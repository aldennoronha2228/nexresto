'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, X, Plus, Trash2, Search, RefreshCw, AlertCircle, Lock, Sparkles } from 'lucide-react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import { cn } from '@/lib/utils';
import { getDefaultTables, getTables, menuItems, type Table } from '@/data/sharedData';
import { fetchActiveOrders, updateOrderStatus, deleteOrder, subscribeToOrders } from '@/lib/firebase-api';
import type { DashboardOrder } from '@/lib/types';
import { useRestaurant } from '@/hooks/useRestaurant';
import { collection, doc, onSnapshot, orderBy, query, type Unsubscribe } from 'firebase/firestore';
import { adminAuth, tenantAuth } from '@/lib/firebase';

const statusConfig = {
    new: { label: 'New Order', color: 'bg-blue-500', ring: 'ring-blue-500/20', text: 'text-blue-700', bg: 'bg-blue-50' },
    preparing: { label: 'Preparing', color: 'bg-amber-500', ring: 'ring-amber-500/20', text: 'text-amber-700', bg: 'bg-amber-50' },
    done: { label: 'Ready', color: 'bg-emerald-500', ring: 'ring-emerald-500/20', text: 'text-emerald-700', bg: 'bg-emerald-50' },
    paid: { label: 'Paid', color: 'bg-slate-500', ring: 'ring-slate-500/20', text: 'text-slate-700', bg: 'bg-slate-50' },
    cancelled: { label: 'Cancelled', color: 'bg-rose-500', ring: 'ring-rose-500/20', text: 'text-rose-700', bg: 'bg-rose-50' },
};

const tableStatusConfig = {
    available: { color: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-700' },
    busy: { color: 'bg-rose-50', border: 'border-rose-400', text: 'text-rose-700' },
    reserved: { color: 'bg-amber-50', border: 'border-amber-400', text: 'text-amber-700' },
};

const inrFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
});

function formatINR(value: number) {
    return inrFormatter.format(Number.isFinite(value) ? value : 0);
}

const FLOOR_SOURCE_WIDTH = 1000;
const FLOOR_SOURCE_HEIGHT = 600;
const FLOOR_WORLD_WIDTH = 14;
const FLOOR_WORLD_DEPTH = 8.4;
const FLOOR_PADDING_X_PCT = 8;
const FLOOR_PADDING_Y_PCT = 10;

function floorToWorld(x: number, y: number) {
    const nx = Math.max(0, Math.min(FLOOR_SOURCE_WIDTH, x)) / FLOOR_SOURCE_WIDTH;
    const ny = Math.max(0, Math.min(FLOOR_SOURCE_HEIGHT, y)) / FLOOR_SOURCE_HEIGHT;
    return {
        x: (nx - 0.5) * FLOOR_WORLD_WIDTH,
        z: (ny - 0.5) * FLOOR_WORLD_DEPTH,
    };
}

function seatOffsets(seats: number) {
    const count = Math.max(2, Math.min(12, seats));
    const radius = 0.78;
    return Array.from({ length: count }).map((_, i) => {
        const angle = (Math.PI * 2 * i) / count;
        return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius] as [number, number, number];
    });
}

function occupiedSeatIndexes(seatCount: number, occupantCount: number) {
    if (seatCount <= 0 || occupantCount <= 0) return new Set<number>();
    const safeCount = Math.min(seatCount, occupantCount);
    const picks = Array.from({ length: safeCount }).map((_, idx) => Math.floor((idx * seatCount) / safeCount));
    return new Set(picks);
}

function tableStatusMaterial(status: Table['status']) {
    if (status === 'busy') return { top: '#fecdd3', edge: '#e11d48', glow: '#fb7185' };
    if (status === 'reserved') return { top: '#fde68a', edge: '#d97706', glow: '#f59e0b' };
    return { top: '#bbf7d0', edge: '#16a34a', glow: '#4ade80' };
}

function LiveOrdersFloor3D({
    tables,
    selectedTableId,
    onSelectTable,
}: {
    tables: Table[];
    selectedTableId: string | null;
    onSelectTable: (id: string | null) => void;
}) {
    return (
        <Canvas
            shadows
            camera={{ position: [7.6, 7.2, 8.2], fov: 44 }}
            className="h-full w-full"
            onPointerMissed={() => onSelectTable(null)}
        >
            <color attach="background" args={['#f1f5f9']} />
            <ambientLight intensity={0.62} />
            <directionalLight
                position={[6, 10, 5]}
                intensity={1}
                castShadow
                shadow-mapSize-width={2048}
                shadow-mapSize-height={2048}
                shadow-camera-near={1}
                shadow-camera-far={35}
                shadow-camera-left={-12}
                shadow-camera-right={12}
                shadow-camera-top={12}
                shadow-camera-bottom={-12}
            />

            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[FLOOR_WORLD_WIDTH, FLOOR_WORLD_DEPTH]} />
                <meshStandardMaterial color="#cbd5e1" roughness={0.9} metalness={0.05} />
            </mesh>

            <gridHelper args={[FLOOR_WORLD_WIDTH, 28, '#64748b', '#94a3b8']} position={[0, 0.01, 0]} />

            <ContactShadows
                opacity={0.34}
                scale={Math.max(FLOOR_WORLD_WIDTH, FLOOR_WORLD_DEPTH) * 1.08}
                blur={2.3}
                far={9}
                resolution={1024}
                color="#0f172a"
                position={[0, 0.02, 0]}
            />

            {tables.map((table) => {
                const pos = floorToWorld(table.x, table.y);
                const selected = selectedTableId === table.id;
                const material = tableStatusMaterial(table.status);
                const chairs = seatOffsets(table.seats);
                const busyOccupantCount = table.status === 'busy' ? Math.max(1, Math.min(4, Math.ceil(table.seats / 3))) : 0;
                const occupiedIndexes = occupiedSeatIndexes(chairs.length, busyOccupantCount);

                return (
                    <group
                        key={`live-floor-${table.id}`}
                        position={[pos.x, 0, pos.z]}
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            onSelectTable(selected ? null : table.id);
                        }}
                    >
                        <mesh castShadow receiveShadow position={[0, 0.34, 0]}>
                            <cylinderGeometry args={[0.72, 0.72, 0.14, 44]} />
                            <meshStandardMaterial color={material.edge} roughness={0.42} metalness={0.08} />
                        </mesh>
                        <mesh castShadow receiveShadow position={[0, 0.4, 0]}>
                            <cylinderGeometry args={[0.62, 0.62, 0.05, 36]} />
                            <meshStandardMaterial color={material.top} roughness={0.52} metalness={0.05} />
                        </mesh>
                        <mesh castShadow receiveShadow position={[0, 0.18, 0]}>
                            <cylinderGeometry args={[0.17, 0.2, 0.34, 20]} />
                            <meshStandardMaterial color="#7c3f1d" roughness={0.56} metalness={0.1} />
                        </mesh>

                        {chairs.map((offset, idx) => {
                            const lookAtCenter = Math.atan2(-offset[0], -offset[2]);
                            return (
                                <group key={`${table.id}-seat-${idx}`} position={offset} rotation={[0, lookAtCenter, 0]}>
                                    <mesh castShadow receiveShadow position={[0, 0.2, 0]}>
                                        <boxGeometry args={[0.26, 0.05, 0.24]} />
                                        <meshStandardMaterial color="#7f4a2b" roughness={0.5} metalness={0.08} />
                                    </mesh>
                                    <mesh castShadow receiveShadow position={[0, 0.42, -0.1]}>
                                        <boxGeometry args={[0.26, 0.34, 0.05]} />
                                        <meshStandardMaterial color="#5b2d15" roughness={0.48} metalness={0.08} />
                                    </mesh>
                                    {[
                                        [0.1, 0.08],
                                        [-0.1, 0.08],
                                        [0.1, -0.08],
                                        [-0.1, -0.08],
                                    ].map((leg, legIdx) => (
                                        <mesh key={`leg-${legIdx}`} castShadow receiveShadow position={[leg[0], 0.08, leg[1]]}>
                                            <boxGeometry args={[0.03, 0.16, 0.03]} />
                                            <meshStandardMaterial color="#3b1d0f" roughness={0.58} metalness={0.1} />
                                        </mesh>
                                    ))}

                                    {occupiedIndexes.has(idx) && (
                                        <group position={[0, 0.26, -0.01]}>
                                            <mesh castShadow receiveShadow position={[0, 0.09, 0]}>
                                                <boxGeometry args={[0.11, 0.16, 0.08]} />
                                                <meshStandardMaterial color="#1e293b" roughness={0.52} metalness={0.18} />
                                            </mesh>
                                            <mesh castShadow receiveShadow position={[0, 0.22, 0.015]}>
                                                <sphereGeometry args={[0.055, 18, 18]} />
                                                <meshStandardMaterial color="#cbd5e1" roughness={0.4} metalness={0.08} />
                                            </mesh>
                                            <mesh castShadow receiveShadow position={[0.022, 0.23, 0.064]}>
                                                <sphereGeometry args={[0.007, 10, 10]} />
                                                <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.6} />
                                            </mesh>
                                            <mesh castShadow receiveShadow position={[-0.022, 0.23, 0.064]}>
                                                <sphereGeometry args={[0.007, 10, 10]} />
                                                <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.6} />
                                            </mesh>
                                            <mesh castShadow receiveShadow position={[0.04, 0.14, 0]} rotation={[0, 0, -0.25]}>
                                                <cylinderGeometry args={[0.012, 0.012, 0.1, 10]} />
                                                <meshStandardMaterial color="#0f172a" roughness={0.5} metalness={0.2} />
                                            </mesh>
                                            <mesh castShadow receiveShadow position={[-0.04, 0.14, 0]} rotation={[0, 0, 0.25]}>
                                                <cylinderGeometry args={[0.012, 0.012, 0.1, 10]} />
                                                <meshStandardMaterial color="#0f172a" roughness={0.5} metalness={0.2} />
                                            </mesh>
                                        </group>
                                    )}
                                </group>
                            );
                        })}

                        {table.status === 'reserved' && (
                            <group>
                                <mesh position={[0, 0.5, 0]}>
                                    <cylinderGeometry args={[0.02, 0.02, 0.22, 10]} />
                                    <meshStandardMaterial color="#f59e0b" roughness={0.4} metalness={0.25} />
                                </mesh>
                                <mesh position={[0, 0.67, 0]} rotation={[0, Math.PI / 4, 0]}>
                                    <boxGeometry args={[0.1, 0.1, 0.1]} />
                                    <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.42} />
                                </mesh>
                                <mesh position={[0, 0.52, 0]} rotation={[Math.PI / 2, 0, 0]}>
                                    <torusGeometry args={[0.92, 0.018, 10, 56]} />
                                    <meshBasicMaterial color="#f59e0b" />
                                </mesh>
                            </group>
                        )}

                        {selected && (
                            <mesh position={[0, 0.47, 0]}>
                                <torusGeometry args={[0.88, 0.02, 12, 64]} />
                                <meshBasicMaterial color={material.glow} />
                            </mesh>
                        )}
                    </group>
                );
            })}

            <OrbitControls
                enablePan
                enableZoom
                enableRotate
                enableDamping
                dampingFactor={0.08}
                rotateSpeed={0.75}
                panSpeed={0.7}
                zoomSpeed={0.85}
                target={[0, 0.35, 0]}
                minDistance={5.2}
                maxDistance={22}
                minPolarAngle={Math.PI / 6}
                maxPolarAngle={Math.PI / 2.05}
            />
        </Canvas>
    );
}

export default function LiveOrdersPage() {
    const [orders, setOrders] = useState<DashboardOrder[]>([]);
    const [floorTables, setFloorTables] = useState<Table[]>([]);
    const [liveMenuItems, setLiveMenuItems] = useState(menuItems);
    const [addingToOrder, setAddingToOrder] = useState<string | null>(null);
    const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [floorViewMode, setFloorViewMode] = useState<'2d' | '3d'>('2d');
    const [isMobileViewport, setIsMobileViewport] = useState(false);
    const [useServerFallback, setUseServerFallback] = useState(false);
    const updateQueue = useRef<Record<string, Promise<void>>>({});
    const seenOrderIdsRef = useRef<Set<string>>(new Set());
    const hasUserInteractedRef = useRef(false);

    const { storeId: tenantId, db: contextDb, loading: tenantLoading, subscriptionTier } = useRestaurant();

    const getActiveToken = useCallback(async (): Promise<string> => {
        if (tenantAuth.currentUser) return tenantAuth.currentUser.getIdToken(true);
        if (adminAuth.currentUser) return adminAuth.currentUser.getIdToken(true);
        throw new Error('Missing active session');
    }, []);

    const loadTablesViaServer = useCallback(async () => {
        if (!tenantId) return;
        const token = await getActiveToken();
        const response = await fetch(`/api/tables/layout?restaurantId=${encodeURIComponent(tenantId)}`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
            throw new Error('Failed to load table layout');
        }

        const payload = await response.json();
        if (payload?.found && Array.isArray(payload?.layout?.tables)) {
            const serverTables = payload.layout.tables as Table[];
            setFloorTables(serverTables);
            const { setTables } = await import('@/data/sharedData');
            setTables(serverTables, tenantId);
            return;
        }

        const seedTables = getDefaultTables();
        await fetch('/api/tables/layout', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                restaurantId: tenantId,
                tables: seedTables,
                walls: [],
                desks: [],
                floorPlans: [{ id: '1', name: 'Default Layout', tables: seedTables, walls: [], desks: [] }],
            }),
        });

        setFloorTables(seedTables);
        const { setTables } = await import('@/data/sharedData');
        setTables(seedTables, tenantId);
    }, [tenantId, getActiveToken]);

    const syncTablesToServer = useCallback(async (nextTables: Table[]) => {
        if (!tenantId) return;
        const token = await getActiveToken();
        await fetch('/api/tables/layout', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                restaurantId: tenantId,
                tables: nextTables,
            }),
        });
    }, [tenantId, getActiveToken]);

    const loadMenuViaServer = useCallback(async () => {
        if (!tenantId) return;
        const token = await getActiveToken();
        const response = await fetch(`/api/menu/list?restaurantId=${encodeURIComponent(tenantId)}`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) return;

        const payload = await response.json();
        const nextItems = Array.isArray(payload?.menuItems) ? payload.menuItems : [];
        setLiveMenuItems(nextItems);
    }, [tenantId, getActiveToken]);

    useEffect(() => {
        loadTablesViaServer().catch(() => {
            setFloorTables(getDefaultTables());
        });
    }, [tenantId, loadTablesViaServer]);

    useEffect(() => {
        const updateViewport = () => {
            setIsMobileViewport(window.innerWidth < 768);
        };

        updateViewport();
        window.addEventListener('resize', updateViewport);
        return () => window.removeEventListener('resize', updateViewport);
    }, []);

    useEffect(() => {
        const markInteracted = () => {
            hasUserInteractedRef.current = true;
        };

        window.addEventListener('pointerdown', markInteracted, { once: true });
        window.addEventListener('keydown', markInteracted, { once: true });

        return () => {
            window.removeEventListener('pointerdown', markInteracted);
            window.removeEventListener('keydown', markInteracted);
        };
    }, []);

    useEffect(() => {
        if (!tenantId || !contextDb) return;

        let fallbackInterval: ReturnType<typeof setInterval> | null = null;

        const layoutRef = doc(contextDb, 'restaurants', tenantId, 'settings', 'floor_layout');
        const unsubscribe = onSnapshot(
            layoutRef,
            async (snapshot) => {
                const data = snapshot.exists() ? (snapshot.data() as Record<string, unknown>) : {};
                const nextTables = Array.isArray(data?.tables) ? (data.tables as Table[]) : [];

                setFloorTables(nextTables);
                const { setTables } = await import('@/data/sharedData');
                setTables(nextTables, tenantId);
            },
            () => {
                // If real-time listener is blocked by rules/network, keep UI near-live using polling.
                if (!fallbackInterval) {
                    fallbackInterval = setInterval(() => {
                        loadTablesViaServer().catch(() => {
                            // keep last known UI state
                        });
                    }, 8000);
                }
            }
        );

        return () => {
            unsubscribe();
            if (fallbackInterval) clearInterval(fallbackInterval);
        };
    }, [tenantId, contextDb, loadTablesViaServer]);

    useEffect(() => {
        if (!tenantId || !contextDb) return;

        let fallbackInterval: ReturnType<typeof setInterval> | null = null;
        const menuQuery = query(collection(contextDb, 'restaurants', tenantId, 'menu_items'), orderBy('name'));
        const unsubscribe = onSnapshot(
            menuQuery,
            (snapshot) => {
                const nextItems = snapshot.docs.map((docSnap) => {
                    const row = docSnap.data() as Record<string, unknown>;
                    return {
                        id: docSnap.id,
                        name: String(row?.name || 'Item'),
                        price: Number(row?.price || 0),
                    };
                });

                setLiveMenuItems(nextItems as typeof menuItems);
            },
            () => {
                if (!fallbackInterval) {
                    loadMenuViaServer().catch(() => {
                        // keep last known UI state
                    });
                    fallbackInterval = setInterval(() => {
                        loadMenuViaServer().catch(() => {
                            // keep last known UI state
                        });
                    }, 8000);
                }
            }
        );

        return () => {
            unsubscribe();
            if (fallbackInterval) clearInterval(fallbackInterval);
        };
    }, [tenantId, contextDb, loadMenuViaServer]);

    const runServerOrderAction = useCallback(async (payload: Record<string, unknown>) => {
        if (!tenantId) throw new Error('Missing tenant context');
        const token = await getActiveToken();
        const response = await fetch('/api/orders/manage', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                restaurantId: tenantId,
                ...payload,
            }),
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data?.error || 'Order action failed');
        }
    }, [tenantId, getActiveToken]);

    const playNewOrderAlert = useCallback(async () => {
        if (typeof window === 'undefined' || !hasUserInteractedRef.current) return;

        try {
            const Ctx = window.AudioContext || (window as any).webkitAudioContext;
            if (!Ctx) return;

            const ctx = new Ctx();
            await ctx.resume();

            const now = ctx.currentTime;
            const frequencies = [880, 1174];

            frequencies.forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                const start = now + i * 0.14;
                const end = start + 0.11;

                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, start);

                gain.gain.setValueAtTime(0.0001, start);
                gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, end);

                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(start);
                osc.stop(end);
            });

            window.setTimeout(() => {
                ctx.close().catch(() => { });
            }, 450);
        } catch {
            // Ignore audio failures to keep order flow uninterrupted.
        }
    }, []);

    const loadOrdersViaServer = useCallback(async () => {
        if (!tenantId) return;
        const token = await getActiveToken();
        const response = await fetch(`/api/orders/live?restaurantId=${encodeURIComponent(tenantId)}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload?.error || 'Failed to load orders');
        }
        setOrders((payload.orders || []) as DashboardOrder[]);
        setError(null);
    }, [tenantId, getActiveToken]);

    // Check if user has Pro tier - Pro gets Floor Overview, Starter does not
    const isPro = subscriptionTier === 'pro' || subscriptionTier === '2k' || subscriptionTier === '2.5k';

    // Safety: if tenantId is available, we don't need to wait for tenantLoading
    const waitingForTenant = tenantLoading && !tenantId;

    const loadOrders = useCallback(async (isBackground = false) => {
        if (!tenantId || !contextDb) {
            if (!isBackground) setLoading(false);
            return;
        }
        if (!isBackground) setLoading(true);
        try {
            if (useServerFallback) {
                await loadOrdersViaServer();
            } else {
                const data = await fetchActiveOrders(tenantId, contextDb);
                setOrders(data);
            }
            setError(null);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Could not connect to database.';
            setError(message);
        } finally {
            if (!isBackground) setLoading(false);
        }
    }, [tenantId, contextDb, useServerFallback, loadOrdersViaServer]);

    useEffect(() => {
        if (!tenantId || !contextDb) return;

        if (useServerFallback) {
            setLoading(true);
            loadOrdersViaServer()
                .catch((err: unknown) => {
                    const message = err instanceof Error ? err.message : 'Could not load orders.';
                    setError(message);
                })
                .finally(() => setLoading(false));

            const interval = setInterval(() => {
                loadOrdersViaServer().catch(() => {
                    // keep last known UI state
                });
            }, 15000);

            return () => clearInterval(interval);
        }

        setLoading(true);
        setError(null);

        // Initial fetch followed by real-time subscription
        const unsubscribe: Unsubscribe = subscribeToOrders(tenantId, (data) => {
            setOrders(data);
            setLoading(false);
            setError(null);
        }, contextDb, (err) => {
            const code = typeof (err as { code?: string } | null)?.code === 'string'
                ? ((err as { code?: string }).code as string)
                : '';

            if (code.includes('permission-denied')) {
                setUseServerFallback(true);
                setError(null);
                return;
            }

            setError(err.message || 'Could not connect to live orders feed.');
            setLoading(false);
        });

        // Cleanup on unmount
        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [tenantId, contextDb, useServerFallback, loadOrdersViaServer]);

    // Play a short alert when brand-new incoming orders appear.
    useEffect(() => {
        const currentIds = new Set(orders.map((o) => o.id));

        if (seenOrderIdsRef.current.size === 0) {
            seenOrderIdsRef.current = currentIds;
            return;
        }

        const hasNewIncomingOrder = orders.some(
            (o) => o.status === 'new' && !seenOrderIdsRef.current.has(o.id)
        );

        if (hasNewIncomingOrder) {
            playNewOrderAlert();
        }

        seenOrderIdsRef.current = currentIds;
    }, [orders, playNewOrderAlert]);

    // Automatically sync table status based on active orders
    useEffect(() => {
        if (!orders?.length && !floorTables.length) return;

        const activeTableIds = new Set(
            orders
                .filter(o => ['new', 'preparing', 'done'].includes(o.status) && o.table)
                .map(o => o.table.toString().trim().toLowerCase())
        );

        let changed = false;
        const updatedTables = floorTables.map(t => {
            // Check if the table ID or Name matches the order's table field
            const strippedId = t.id.replace('T-', ''); // "05"
            const numStr = parseInt(strippedId, 10).toString(); // "5"
            const hasActiveOrder = activeTableIds.has(t.id.toLowerCase()) ||
                activeTableIds.has(t.name.toLowerCase()) ||
                activeTableIds.has(strippedId.toLowerCase()) ||
                activeTableIds.has(numStr.toLowerCase()) ||
                activeTableIds.has(`table ${numStr}`);

            const targetStatus: Table['status'] = hasActiveOrder
                ? 'busy'
                : (t.status === 'reserved' ? 'reserved' : 'available');

            if (t.status !== targetStatus) {
                changed = true;
                return { ...t, status: targetStatus as 'available' | 'busy' | 'reserved' };
            }
            return t;
        });

        if (changed) {
            setFloorTables(updatedTables);
            import('@/data/sharedData').then(({ setTables }) => {
                setTables(updatedTables, tenantId || undefined);
            });
            syncTablesToServer(updatedTables).catch(() => {
                // keep UI responsive even if background sync fails
            });
        }
    }, [orders, floorTables, tenantId, syncTablesToServer]);

    const handleStatusChange = async (orderId: string, status: DashboardOrder['status']) => {
        if (!tenantId || !contextDb) return;
        // Optimistically update the UI instantly
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));

        // Enqueue the API request
        const prevPromise = updateQueue.current[orderId] || Promise.resolve();
        const nextPromise = prevPromise.then(async () => {
            try {
                await updateOrderStatus(tenantId, orderId, status, contextDb);
            } catch (err: any) {
                const code = typeof err?.code === 'string' ? err.code : '';
                if (code.includes('permission-denied') || useServerFallback) {
                    await runServerOrderAction({ action: 'update_status', orderId, status });
                    await loadOrdersViaServer();
                    return;
                }
                loadOrders();
            }
        });
        updateQueue.current[orderId] = nextPromise;
    };

    const handleDeleteOrder = async (orderId: string) => {
        if (!tenantId || !contextDb) return;
        setActionLoading(orderId);
        setOrders(prev => prev.filter(o => o.id !== orderId));
        try {
            await deleteOrder(tenantId, orderId, contextDb);
        } catch (err: any) {
            const code = typeof err?.code === 'string' ? err.code : '';
            if (code.includes('permission-denied') || useServerFallback) {
                await runServerOrderAction({ action: 'delete_order', orderId });
                await loadOrdersViaServer();
            } else {
                loadOrders();
            }
        }
        setActionLoading(null);
    };

    const addItemToOrder = (orderId: string, menuItem: { id: string; name: string; price: number }) => {
        setOrders(prev => prev.map(order => {
            if (order.id !== orderId) return order;
            const existing = order.items.findIndex(i => i.name === menuItem.name);
            if (existing !== -1) {
                const newItems = [...order.items];
                newItems[existing] = { ...newItems[existing], quantity: newItems[existing].quantity + 1 };
                return { ...order, items: newItems };
            }
            return { ...order, items: [...order.items, { id: `${menuItem.id}-${Date.now()}`, name: menuItem.name, quantity: 1, price: menuItem.price }] };
        }));
        setAddingToOrder(null);
        setSearchQuery('');
    };

    const removeItem = (orderId: string, itemId: string) => {
        setOrders(prev => prev.map(order => {
            if (order.id !== orderId) return order;
            const newItems = order.items.filter(i => i.id !== itemId);
            if (newItems.length === 0) return order;
            return { ...order, items: newItems };
        }));
    };

    const toggleTableReserved = useCallback(async (tableId: string) => {
        const nextTables = floorTables.map((table) => {
            if (table.id !== tableId) return table;
            if (table.status === 'busy') return table;
            return {
                ...table,
                status: (table.status === 'reserved' ? 'available' : 'reserved') as Table['status'],
            };
        });

        setFloorTables(nextTables);

        try {
            const { setTables } = await import('@/data/sharedData');
            setTables(nextTables, tenantId || undefined);
            await syncTablesToServer(nextTables);
        } catch {
            // keep UI responsive even if reservation sync fails
        }
    }, [floorTables, tenantId, syncTablesToServer]);

    const filteredMenuItems = liveMenuItems.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()));
    const activeOrders = orders.filter(o => ['new', 'preparing'].includes(o.status));
    const readyToServeOrders = orders.filter(o => o.status === 'done');
    const busyTables = floorTables.filter(t => t.status === 'busy').length;
    const normalizedFloorTables = useMemo(() => {
        const usableXPct = 100 - FLOOR_PADDING_X_PCT * 2;
        const usableYPct = 100 - FLOOR_PADDING_Y_PCT * 2;

        return floorTables.map((table) => {
            const normalizedX = Math.max(0, Math.min(FLOOR_SOURCE_WIDTH, table.x)) / FLOOR_SOURCE_WIDTH;
            const normalizedY = Math.max(0, Math.min(FLOOR_SOURCE_HEIGHT, table.y)) / FLOOR_SOURCE_HEIGHT;

            return {
                ...table,
                leftPct: FLOOR_PADDING_X_PCT + normalizedX * usableXPct,
                topPct: FLOOR_PADDING_Y_PCT + normalizedY * usableYPct,
            };
        });
    }, [floorTables]);

    const displayedOrders = selectedTableId
        ? activeOrders.filter(o => {
            const t = floorTables.find(t => t.id === selectedTableId);
            if (!t) return false;
            const oTable = (o.table || '').toString().trim().toLowerCase();
            const strippedId = t.id.replace('T-', '');
            const numStr = parseInt(strippedId, 10).toString();
            return oTable === t.id.toLowerCase() ||
                oTable === t.name.toLowerCase() ||
                oTable === strippedId.toLowerCase() ||
                oTable === numStr.toLowerCase() ||
                oTable === `table ${numStr}`;
        })
        : activeOrders;

    const displayedReadyOrders = selectedTableId
        ? readyToServeOrders.filter(o => {
            const t = floorTables.find(t => t.id === selectedTableId);
            if (!t) return false;
            const oTable = (o.table || '').toString().trim().toLowerCase();
            const strippedId = t.id.replace('T-', '');
            const numStr = parseInt(strippedId, 10).toString();
            return oTable === t.id.toLowerCase() ||
                oTable === t.name.toLowerCase() ||
                oTable === strippedId.toLowerCase() ||
                oTable === numStr.toLowerCase() ||
                oTable === `table ${numStr}`;
        })
        : readyToServeOrders;

    const getOrdersForTable = useCallback((table: Table) => {
        return activeOrders.filter((o) => {
            const oTable = (o.table || '').toString().trim().toLowerCase();
            const strippedId = table.id.replace('T-', '');
            const numStr = parseInt(strippedId, 10).toString();
            return oTable === table.id.toLowerCase() ||
                oTable === table.name.toLowerCase() ||
                oTable === strippedId.toLowerCase() ||
                oTable === numStr.toLowerCase() ||
                oTable === `table ${numStr}`;
        });
    }, [activeOrders]);
    const floorOverviewHeightClass = isMobileViewport
        ? 'h-[66vh] min-h-[420px] max-h-none'
        : 'h-[52vh] min-h-[320px] max-h-[460px]';

    if ((loading || waitingForTenant) && !orders.length) return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center p-6">
            <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center"
            >
                <RefreshCw className="w-6 h-6 text-blue-600" />
            </motion.div>
            <div className="space-y-2">
                <h3 className="text-slate-900 font-bold text-xl tracking-tight">
                    {waitingForTenant ? 'Initializing restaurant...' : 'Connecting to orders feed...'}
                </h3>
                <p className="text-slate-500 max-w-sm mx-auto text-sm leading-relaxed">
                    Setting up a secure real-time link to your kitchen. This usually takes just a few seconds.
                </p>
            </div>

            {error && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mt-4 p-6 bg-rose-50 border border-rose-100 rounded-3xl text-center max-w-md shadow-sm"
                >
                    <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-6 h-6 text-rose-600" />
                    </div>
                    <p className="text-rose-900 text-sm font-semibold mb-2">Connection Error</p>
                    <p className="text-rose-700 text-xs mb-6 leading-relaxed">{error}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="w-full py-2.5 bg-white border border-rose-200 text-rose-700 text-sm font-bold rounded-xl hover:bg-rose-100 transition-all"
                    >
                        Refresh Session
                    </button>
                </motion.div>
            )}
        </div>
    );

    return (
        <div className={cn('space-y-8', isMobileViewport && 'space-y-4')}>
            <div className="flex items-center justify-between">
                <div>
                    <h1 className={cn('font-bold text-slate-900 tracking-tight', isMobileViewport ? 'text-xl' : 'text-2xl lg:text-4xl')}>Live Orders</h1>
                    <p className={cn('text-sm text-slate-500 mt-1', isMobileViewport && 'hidden')}>Monitor active orders and restaurant floor status</p>
                </div>
                <button onClick={() => loadOrders(false)} className="p-2.5 rounded-xl bg-white/70 border border-white/40 hover:bg-white transition-colors shadow-sm">
                    <RefreshCw className="w-4 h-4 text-rose-500" />
                </button>
            </div>

            {error && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /><span>{error}</span>
                </motion.div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5">
                {[
                    { label: 'Active Orders', value: activeOrders.length.toString(), icon: '📦' },
                    { label: 'Tables Occupied', value: `${busyTables}/${floorTables.length}`, icon: '🪑' },
                    { label: 'New Orders', value: orders.filter(o => o.status === 'new').length.toString(), icon: '⏱️' },
                    { label: 'Ready to Serve', value: orders.filter(o => o.status === 'done').length.toString(), icon: '✅' },
                ].map((stat, i) => (
                    <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} whileHover={{ y: -4 }} className={cn('premium-glass p-5 lg:p-6', isMobileViewport && 'p-3')}>
                        <div className="flex items-start justify-between">
                            <div>
                                <p className={cn('text-slate-500', isMobileViewport ? 'text-[11px]' : 'text-xs lg:text-sm')}>{stat.label}</p>
                                <p className={cn('font-extrabold text-slate-900 mt-1 tracking-tight', isMobileViewport ? 'text-xl' : 'text-2xl lg:text-3xl')}>{stat.value}</p>
                            </div>
                            <span className={cn('rounded-xl bg-rose-50 border border-rose-100', isMobileViewport ? 'text-base p-1.5' : 'text-xl lg:text-2xl p-2')}>{stat.icon}</span>
                        </div>
                    </motion.div>
                ))}
            </div>

            <div className={cn("grid grid-cols-1 gap-4 lg:gap-6", isPro && "lg:grid-cols-2")}>
                {/* Floor Overview - Pro Only */}
                {isPro ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={cn('premium-glass p-5 lg:p-7', isMobileViewport && 'p-3')}>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
                            <h2 className="text-base lg:text-lg font-semibold text-slate-900">Floor Overview</h2>
                            <div className="flex items-center gap-3 lg:gap-4 flex-wrap justify-end">
                                <div className="flex items-center rounded-lg border border-slate-200 bg-white p-1">
                                    <button
                                        onClick={() => setFloorViewMode('2d')}
                                        className={cn(
                                            'px-3 py-1.5 text-xs md:px-2.5 md:py-1 rounded-md transition-colors min-w-[46px] min-h-[34px] md:min-h-0',
                                            floorViewMode === '2d' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                                        )}
                                    >
                                        2D
                                    </button>
                                    <button
                                        onClick={() => setFloorViewMode('3d')}
                                        className={cn(
                                            'px-3 py-1.5 text-xs md:px-2.5 md:py-1 rounded-md transition-colors min-w-[46px] min-h-[34px] md:min-h-0',
                                            floorViewMode === '3d' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                                        )}
                                    >
                                        3D
                                    </button>
                                </div>
                                <div className="hidden sm:flex items-center gap-3 lg:gap-4 text-xs">
                                    {Object.entries(tableStatusConfig).map(([key, cfg]) => (
                                        <div key={key} className="flex items-center gap-2">
                                            <div className={cn('w-3 h-3 rounded border', cfg.color, cfg.border)} />
                                            <span className="text-slate-600 capitalize">{key}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-white/30 overflow-visible">
                            {floorViewMode === '2d' ? (
                                <div
                                    className={cn('relative w-full bg-gradient-to-br from-slate-900/[0.03] to-emerald-500/[0.04] p-3 lg:p-5', floorOverviewHeightClass)}
                                    style={{
                                        backgroundImage: 'radial-gradient(circle, #94a3b8 1px, transparent 1px)',
                                        backgroundSize: '22px 22px'
                                    }}
                                >
                                    {normalizedFloorTables.map(table => {
                                        const config = tableStatusConfig[table.status];
                                        const isSelected = selectedTableId === table.id;
                                        const tableOrders = getOrdersForTable(table);

                                        const tableItems = tableOrders.flatMap(o => o.items);

                                        return (
                                            <div
                                                key={table.id}
                                                style={{ position: 'absolute', left: `${table.leftPct}%`, top: `${table.topPct}%`, transform: 'translate(-50%, -50%)' }}
                                                className={cn('relative', isSelected ? 'z-[70]' : 'z-10')}
                                            >
                                                <motion.div onClick={() => setSelectedTableId(isSelected ? null : table.id)} whileHover={{ scale: 1.1 }} className={cn('w-12 h-12 lg:w-16 lg:h-16 rounded-2xl border-2 flex flex-col items-center justify-center cursor-pointer transition-all shadow-sm relative', config.color, config.border, config.text, isSelected && 'ring-4 ring-rose-400/30', table.status === 'busy' && 'drop-shadow-[0_0_16px_rgba(244,63,94,0.45)]', table.status === 'available' && 'drop-shadow-[0_0_14px_rgba(46,213,115,0.38)]', table.status === 'reserved' && 'drop-shadow-[0_0_12px_rgba(245,158,11,0.35)]')}>
                                                    <span className="text-[10px] lg:text-xs font-semibold">{table.id}</span>
                                                    <span className="text-[8px] lg:text-[10px] opacity-70">{table.seats}</span>
                                                </motion.div>

                                                <AnimatePresence>
                                                    {isSelected && (
                                                        <motion.div
                                                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-48 bg-white/95 backdrop-blur-md rounded-xl shadow-xl border border-slate-200/60 p-3 z-[80]"
                                                        >
                                                            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white/95 border-r border-b border-slate-200/60 rotate-45" />
                                                            <div className="relative z-10">
                                                                <h4 className="text-xs font-bold text-slate-800 mb-2 border-b border-slate-100 pb-1">Table {table.id} Orders</h4>
                                                                {tableItems.length > 0 ? (
                                                                    <ul className="space-y-1.5 max-h-32 overflow-y-auto">
                                                                        {tableItems.map((item, idx) => (
                                                                            <li key={`${item.id}-${idx}`} className="text-[10px] flex justify-between">
                                                                                <span className="text-slate-600 truncate mr-2">{item.name}</span>
                                                                                <span className="font-semibold text-slate-900">x{item.quantity}</span>
                                                                            </li>
                                                                        ))}
                                                                    </ul>
                                                                ) : (
                                                                    <p className="text-[10px] text-slate-400 italic">No active orders</p>
                                                                )}
                                                                <button
                                                                    onClick={() => toggleTableReserved(table.id)}
                                                                    disabled={table.status === 'busy'}
                                                                    className={cn(
                                                                        'mt-2 w-full h-7 rounded-md text-[10px] font-semibold border transition-colors',
                                                                        table.status === 'reserved'
                                                                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                                                            : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
                                                                        table.status === 'busy' && 'opacity-50 cursor-not-allowed'
                                                                    )}
                                                                >
                                                                    {table.status === 'busy'
                                                                        ? 'Busy: cannot reserve'
                                                                        : table.status === 'reserved'
                                                                            ? 'Remove Reservation'
                                                                            : 'Reserve Table'}
                                                                </button>
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className={cn('relative w-full bg-slate-100', floorOverviewHeightClass)}>
                                    <LiveOrdersFloor3D
                                        tables={floorTables}
                                        selectedTableId={selectedTableId}
                                        onSelectTable={setSelectedTableId}
                                    />

                                    {isMobileViewport && (
                                        <div className="absolute left-3 top-3 rounded-lg border border-slate-200/80 bg-white/90 px-2.5 py-1.5 text-[10px] text-slate-600 shadow-sm z-20">
                                            Drag to rotate • Pinch to zoom
                                        </div>
                                    )}

                                    {selectedTableId && (() => {
                                        const table = floorTables.find((t) => t.id === selectedTableId);
                                        if (!table) return null;
                                        const tableItems = getOrdersForTable(table).flatMap((o) => o.items);
                                        return (
                                            <div className="absolute right-3 top-3 w-52 bg-white/95 backdrop-blur-md rounded-xl shadow-xl border border-slate-200/70 p-3 z-20">
                                                <h4 className="text-xs font-bold text-slate-800 mb-2 border-b border-slate-100 pb-1">Table {table.id} Orders</h4>
                                                {tableItems.length > 0 ? (
                                                    <ul className="space-y-1.5 max-h-32 overflow-y-auto">
                                                        {tableItems.map((item, idx) => (
                                                            <li key={`${item.id}-3d-${idx}`} className="text-[10px] flex justify-between">
                                                                <span className="text-slate-600 truncate mr-2">{item.name}</span>
                                                                <span className="font-semibold text-slate-900">x{item.quantity}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : (
                                                    <p className="text-[10px] text-slate-400 italic">No active orders</p>
                                                )}
                                                <button
                                                    onClick={() => toggleTableReserved(table.id)}
                                                    disabled={table.status === 'busy'}
                                                    className={cn(
                                                        'mt-2 w-full h-7 rounded-md text-[10px] font-semibold border transition-colors',
                                                        table.status === 'reserved'
                                                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                                            : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
                                                        table.status === 'busy' && 'opacity-50 cursor-not-allowed'
                                                    )}
                                                >
                                                    {table.status === 'busy'
                                                        ? 'Busy: cannot reserve'
                                                        : table.status === 'reserved'
                                                            ? 'Remove Reservation'
                                                            : 'Reserve Table'}
                                                </button>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>
                    </motion.div>
                ) : (
                    /* Starter Tier - Show Upgrade Prompt */
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="premium-glass p-5 overflow-hidden relative"
                    >
                        <div className="absolute -top-1 -right-1 p-4 opacity-10 pointer-events-none">
                            <Lock className="w-12 h-12 text-slate-600" />
                        </div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-3 mb-2.5">
                                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-sm">
                                    <Sparkles className="w-4 h-4 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-slate-900 font-semibold text-base">Interactive Floor Plan</h3>
                                    <p className="text-slate-500 text-xs">Pro Feature</p>
                                </div>
                            </div>
                            <p className="text-slate-600 text-xs mb-3 max-w-sm leading-relaxed">
                                Unlock a live visual map of your restaurant. Monitor table status, occupancy, and orders at a glance.
                            </p>
                            <button
                                onClick={() => { }} // Upgrade flow would go here
                                className="px-4 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors"
                            >
                                Upgrade to Pro
                            </button>
                        </div>
                    </motion.div>
                )}

                <div className="space-y-4">
                    <h2 className="text-base lg:text-lg font-semibold text-slate-900">
                        Active Orders
                        {activeOrders.length > 0 && <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-medium">{activeOrders.length}</span>}
                    </h2>
                    {activeOrders.length === 0 && !loading && (
                        <div className="premium-glass p-12 text-center">
                            <div className="mx-auto w-24 h-24 mb-4 rounded-3xl bg-rose-50 border border-rose-100 flex items-center justify-center">
                                <svg viewBox="0 0 120 120" className="w-16 h-16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <rect x="24" y="34" width="72" height="52" rx="12" fill="#FFF1F2" stroke="#FF4757" strokeWidth="3" />
                                    <path d="M38 52H82" stroke="#FF4757" strokeWidth="3" strokeLinecap="round" />
                                    <path d="M38 63H69" stroke="#FB7185" strokeWidth="3" strokeLinecap="round" />
                                    <circle cx="84" cy="62" r="7" fill="#2ED573" />
                                </svg>
                            </div>
                            <p className="text-slate-700 font-semibold">Waiting for orders...</p>
                            <p className="text-slate-500 text-sm mt-1">Your kitchen will light up here as soon as the next table places an order.</p>
                        </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5 max-h-[500px] lg:max-h-[580px] overflow-y-auto pr-2 content-start justify-items-start">
                        {displayedOrders.map((order, i) => {
                            const config = statusConfig[order.status];
                            const total = order.items.reduce((acc, item) => acc + item.quantity * item.price, 0);
                            const isDeleting = actionLoading === order.id;
                            return (
                                <motion.div key={order.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }} className={cn('w-full max-w-sm premium-glass p-4 hover:scale-[1.02] transition-all', isDeleting && 'opacity-60')}>
                                    <div className="flex items-start justify-between mb-2.5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#ff4757] to-[#ff6b81] flex items-center justify-center shadow-lg shadow-rose-500/30">
                                                <span className="text-white font-bold text-xs">#{order.daily_order_number ?? order.id.slice(-4)}</span>
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h3 className="font-semibold text-sm text-slate-900">{order.table ? `Table ${order.table}` : 'Takeaway / Unassigned'}</h3>
                                                    <motion.span animate={{ scale: order.status === 'new' ? [1, 1.1, 1] : 1 }} transition={{ repeat: order.status === 'new' ? Infinity : 0, duration: 2 }} className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-medium', config.bg, config.text)}>{config.label}</motion.span>
                                                </div>
                                                <div className="flex items-center gap-1 text-xs text-slate-500"><Clock className="w-3 h-3" />{order.time}</div>
                                            </div>
                                        </div>
                                        <button onClick={() => handleDeleteOrder(order.id)} disabled={isDeleting} className="p-1 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors text-slate-400">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div className="space-y-1.5 mb-2.5">
                                        {order.items.map(item => (
                                            <motion.div key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between group">
                                                <span className="text-xs text-slate-700">{item.name}</span>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xs font-medium text-slate-900">×{item.quantity}</span>
                                                    <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => removeItem(order.id, item.id)} className="w-6 h-6 rounded-md flex items-center justify-center bg-rose-50 hover:bg-rose-100 opacity-0 group-hover:opacity-100 transition-all">
                                                        <X className="w-3.5 h-3.5 text-rose-600" />
                                                    </motion.button>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                    <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} onClick={() => setAddingToOrder(order.id)} className="w-full flex items-center justify-center gap-2 py-1.5 mb-2.5 text-blue-600 hover:text-blue-700 text-xs font-medium transition-colors">
                                        <Plus className="w-4 h-4" />Add Item
                                    </motion.button>
                                    <div className="pt-2.5 border-t border-slate-200/60">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-medium text-slate-600">Total</span>
                                            <span className="text-lg font-bold text-slate-900">{formatINR(total)}</span>
                                        </div>
                                        <div className="flex gap-2">
                                            {order.status === 'new' && <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} onClick={() => handleStatusChange(order.id, 'preparing')} className="flex-1 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-medium text-xs shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 transition-all">Start Preparing</motion.button>}
                                            {order.status === 'preparing' && <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} onClick={() => handleStatusChange(order.id, 'done')} className="flex-1 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-medium text-xs shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all">Mark as Ready</motion.button>}
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>

                    <div className="space-y-2 mt-3">
                        <h2 className="text-sm font-semibold text-slate-900">
                            Ready to Serve
                            {displayedReadyOrders.length > 0 && <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">{displayedReadyOrders.length}</span>}
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                            {displayedReadyOrders.map((order, i) => {
                                const total = order.items.reduce((acc, item) => acc + item.quantity * item.price, 0);
                                const isDeleting = actionLoading === order.id;
                                return (
                                    <motion.div
                                        key={`ready-${order.id}`}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        className={cn('w-full max-w-sm premium-glass p-4 border-emerald-200/70', isDeleting && 'opacity-60')}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <h4 className="text-sm font-semibold text-slate-900">{order.table ? `Table ${order.table}` : 'Takeaway / Unassigned'}</h4>
                                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 font-medium">Ready</span>
                                        </div>
                                        <p className="text-xs text-slate-500 mb-2">{order.items.length} item(s)</p>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs text-slate-600">Total</span>
                                            <span className="text-sm font-bold text-slate-900">{formatINR(total)}</span>
                                        </div>
                                        <motion.button
                                            whileHover={{ scale: 1.01 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => handleStatusChange(order.id, 'paid')}
                                            className="w-full py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-medium text-xs shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all"
                                        >
                                            Mark as Paid ✓
                                        </motion.button>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {addingToOrder && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setAddingToOrder(null)}>
                        <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
                            <div className="p-6 border-b border-slate-200/60">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-xl font-semibold text-slate-900">Add Item to Order</h3>
                                    <button onClick={() => setAddingToOrder(null)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
                                </div>
                                <div className="relative">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                    <input type="text" placeholder="Search menu items…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} autoFocus className="w-full h-12 pl-12 pr-4 bg-slate-50 border border-slate-200/60 rounded-xl text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all" />
                                </div>
                            </div>
                            <div className="p-6 overflow-y-auto max-h-[calc(80vh-180px)]">
                                <div className="grid grid-cols-2 gap-3">
                                    {filteredMenuItems.map(item => (
                                        <motion.button key={item.id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => addItemToOrder(addingToOrder, item)} className="bg-slate-50 hover:bg-blue-50 border border-slate-200/60 hover:border-blue-300 rounded-xl p-3 text-left transition-all group">
                                            <div className="flex items-start gap-3">
                                                <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-slate-200">
                                                    <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-semibold text-slate-900 text-sm mb-0.5 truncate group-hover:text-blue-600 transition-colors">{item.name}</h4>
                                                    <p className="text-xs text-slate-500 mb-2 line-clamp-1">{item.description}</p>
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-sm font-semibold text-slate-900">{formatINR(item.price)}</span>
                                                        <span className="text-xs px-2 py-0.5 bg-slate-200 group-hover:bg-blue-100 text-slate-600 group-hover:text-blue-600 rounded-md transition-colors">{item.category}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.button>
                                    ))}
                                </div>
                                {filteredMenuItems.length === 0 && <div className="text-center py-12"><p className="text-slate-500">No menu items found</p></div>}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
