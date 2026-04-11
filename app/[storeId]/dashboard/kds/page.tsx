'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChefHat, Clock3, Flame, Sparkles } from 'lucide-react';
import {
    collection,
    doc,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    Timestamp,
    updateDoc,
    where,
    type Firestore,
} from 'firebase/firestore';
import { RoleGuard } from '@/components/dashboard/RoleGuard';
import { useRestaurant } from '@/hooks/useRestaurant';

type KdsStatus = 'new' | 'preparing' | 'done';

type KdsOrderItem = {
    name: string;
    quantity: number;
    addOns: string[];
    note: string | null;
};

type KdsOrder = {
    id: string;
    orderNumber: string;
    tableNumber: string;
    status: KdsStatus;
    createdAt: Date;
    items: KdsOrderItem[];
    note: string | null;
};

const ACTIVE_STATUSES = new Set(['new', 'preparing', 'done']);
const PENDING_URGENT_AFTER_MS = 10 * 60 * 1000;

function toDate(value: unknown): Date {
    if (value instanceof Date) return value;
    if (value instanceof Timestamp) return value.toDate();

    if (value && typeof value === 'object') {
        const maybe = value as { toDate?: () => Date };
        if (typeof maybe.toDate === 'function') return maybe.toDate();
    }

    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    return new Date();
}

function normalizeStatus(value: unknown): KdsStatus | null {
    const raw = String(value || '').toLowerCase();
    if (raw === 'new') return 'new';
    if (raw === 'preparing') return 'preparing';
    if (raw === 'done' || raw === 'ready') return 'done';
    return null;
}

function parseAddOns(item: Record<string, unknown>): string[] {
    const source = item.add_ons ?? item.addOns ?? item.options ?? item.modifiers;
    if (!Array.isArray(source)) return [];

    return source
        .map((v) => String(v || '').trim())
        .filter(Boolean)
        .slice(0, 8);
}

function parseItemNote(item: Record<string, unknown>): string | null {
    const raw = item.note ?? item.notes ?? item.special_note ?? item.special_instructions;
    const note = String(raw || '').trim();
    return note ? note : null;
}

function parseItems(source: unknown): KdsOrderItem[] {
    if (!Array.isArray(source)) return [];

    return source
        .map((entry) => {
            const row = (entry || {}) as Record<string, unknown>;
            const name = String(row.item_name || row.name || 'Item').trim();
            const quantity = Math.max(1, Number(row.quantity || 1));
            return {
                name,
                quantity,
                addOns: parseAddOns(row),
                note: parseItemNote(row),
            };
        })
        .filter((item) => item.name.length > 0);
}

function parseOrder(rowId: string, data: Record<string, unknown>): KdsOrder | null {
    const status = normalizeStatus(data.status);
    if (!status) return null;

    // Served orders are handled by waiter display and should no longer appear in KDS.
    if (status === 'done' && data.waiter_served_at) return null;

    return {
        id: rowId,
        orderNumber: data.daily_order_number ? String(data.daily_order_number) : rowId.slice(-6).toUpperCase(),
        tableNumber: String(data.table_number || data.table || 'N/A'),
        status,
        createdAt: toDate(data.created_at),
        items: parseItems(data.items),
        note: String(data.note || data.notes || data.special_instructions || '').trim() || null,
    };
}

function formatElapsed(ms: number): string {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;

    if (hours > 0) {
        return `${hours}h ${String(mins).padStart(2, '0')}m`;
    }

    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function createDingUrl(): string {
    const sampleRate = 22050;
    const durationSec = 0.26;
    const sampleCount = Math.floor(sampleRate * durationSec);
    const bytesPerSample = 2;
    const buffer = new ArrayBuffer(44 + sampleCount * bytesPerSample);
    const view = new DataView(buffer);

    const writeString = (offset: number, value: string) => {
        for (let i = 0; i < value.length; i += 1) {
            view.setUint8(offset + i, value.charCodeAt(i));
        }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + sampleCount * bytesPerSample, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * bytesPerSample, true);
    view.setUint16(32, bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, sampleCount * bytesPerSample, true);

    const f1 = 880;
    const f2 = 1320;

    for (let i = 0; i < sampleCount; i += 1) {
        const t = i / sampleRate;
        const envelope = Math.exp(-7 * t);
        const signal = 0.55 * Math.sin(2 * Math.PI * f1 * t) + 0.45 * Math.sin(2 * Math.PI * f2 * t);
        const sample = Math.max(-1, Math.min(1, signal * envelope));
        view.setInt16(44 + i * bytesPerSample, sample * 0x7fff, true);
    }

    return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

function StatusColumn({
    lane,
    title,
    subtitle,
    orders,
    now,
    actionLoadingId,
    onAdvance,
}: {
    lane: 'pending' | 'preparing' | 'ready';
    title: string;
    subtitle: string;
    orders: KdsOrder[];
    now: number;
    actionLoadingId: string | null;
    onAdvance: (order: KdsOrder) => Promise<void>;
}) {
    const laneTheme = {
        pending: {
            column: 'border-amber-200 bg-amber-50/65',
            header: 'border-amber-200/80 bg-amber-100/70',
            title: 'text-amber-900',
            badge: 'border-amber-300 bg-amber-200/80 text-amber-900',
            subtitle: 'text-amber-800/80',
            empty: 'border-amber-300/70 bg-amber-50 text-amber-800/80',
        },
        preparing: {
            column: 'border-sky-200 bg-sky-50/65',
            header: 'border-sky-200/80 bg-sky-100/70',
            title: 'text-sky-900',
            badge: 'border-sky-300 bg-sky-200/80 text-sky-900',
            subtitle: 'text-sky-800/80',
            empty: 'border-sky-300/70 bg-sky-50 text-sky-800/80',
        },
        ready: {
            column: 'border-emerald-200 bg-emerald-50/65',
            header: 'border-emerald-200/80 bg-emerald-100/70',
            title: 'text-emerald-900',
            badge: 'border-emerald-300 bg-emerald-200/80 text-emerald-900',
            subtitle: 'text-emerald-800/80',
            empty: 'border-emerald-300/70 bg-emerald-50 text-emerald-800/80',
        },
    }[lane];

    return (
        <section className={`min-h-[72vh] rounded-3xl border shadow-sm ${laneTheme.column}`}>
            <header className={`sticky top-0 z-10 border-b px-4 py-3 backdrop-blur ${laneTheme.header}`}>
                <div className="flex items-center justify-between">
                    <h2 className={`text-base font-semibold tracking-wide ${laneTheme.title}`}>{title}</h2>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${laneTheme.badge}`}>{orders.length}</span>
                </div>
                <p className={`mt-1 text-xs ${laneTheme.subtitle}`}>{subtitle}</p>
            </header>

            <motion.div layout className="space-y-3 p-3">
                <AnimatePresence initial={false}>
                    {orders.map((order) => {
                        const elapsedMs = now - order.createdAt.getTime();
                        const isUrgent = order.status === 'new' && elapsedMs > PENDING_URGENT_AFTER_MS;
                        const canAdvance = order.status === 'new' || order.status === 'preparing';

                        return (
                            <motion.article
                                key={order.id}
                                layout
                                initial={{ opacity: 0, y: 14, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -10, scale: 0.96 }}
                                transition={{ duration: 0.2 }}
                                className={[
                                    'rounded-2xl border bg-white p-3 shadow-[0_10px_24px_rgba(15,23,42,0.08)]',
                                    isUrgent
                                        ? 'border-red-300 ring-2 ring-red-200/70 animate-pulse'
                                        : 'border-slate-200',
                                ].join(' ')}
                            >
                                <div className="mb-3 flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                                    <div>
                                        <p className="text-lg font-bold leading-none text-slate-900">Table {order.tableNumber}</p>
                                        <p className="mt-1 text-xs tracking-[0.18em] text-slate-500">ORDER #{order.orderNumber}</p>
                                    </div>
                                    {isUrgent ? (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-red-700">
                                            <Flame className="h-3 w-3" /> Urgent
                                        </span>
                                    ) : null}
                                </div>

                                <div className="space-y-2">
                                    {order.items.length === 0 ? (
                                        <p className="text-sm text-slate-500">No items found.</p>
                                    ) : (
                                        order.items.map((item, idx) => (
                                            <div key={`${order.id}-item-${idx}`} className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2">
                                                <p className="text-sm font-semibold text-slate-900">
                                                    <span className="mr-2 text-slate-600">{item.quantity}x</span>
                                                    {item.name}
                                                </p>
                                                {item.addOns.length > 0 ? (
                                                    <p className="mt-1 text-xs text-amber-700">Add-ons: {item.addOns.join(', ')}</p>
                                                ) : null}
                                                {item.note ? <p className="mt-1 text-xs text-amber-700">Note: {item.note}</p> : null}
                                            </div>
                                        ))
                                    )}

                                    {order.note ? (
                                        <p className="rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
                                            Kitchen Note: {order.note}
                                        </p>
                                    ) : null}
                                </div>

                                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
                                    <span className={[
                                        'inline-flex items-center gap-1 text-xs font-medium',
                                        isUrgent ? 'text-red-700' : 'text-slate-600',
                                    ].join(' ')}>
                                        <Clock3 className="h-3.5 w-3.5" /> {formatElapsed(elapsedMs)}
                                    </span>

                                    {canAdvance ? (
                                        <button
                                            type="button"
                                            disabled={actionLoadingId === order.id}
                                            onClick={() => {
                                                void onAdvance(order);
                                            }}
                                            className={[
                                                'rounded-xl px-3 py-1.5 text-xs font-semibold transition',
                                                actionLoadingId === order.id
                                                    ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                                                    : order.status === 'new'
                                                        ? 'bg-amber-500 text-white hover:bg-amber-600'
                                                        : 'bg-emerald-600 text-white hover:bg-emerald-700',
                                            ].join(' ')}
                                        >
                                            {actionLoadingId === order.id
                                                ? 'Updating...'
                                                : order.status === 'new'
                                                    ? 'Start Cooking'
                                                    : 'Mark Ready'}
                                        </button>
                                    ) : null}
                                </div>
                            </motion.article>
                        );
                    })}
                </AnimatePresence>

                {orders.length === 0 ? (
                    <div className={`rounded-2xl border border-dashed p-6 text-center text-sm ${laneTheme.empty}`}>
                        No orders in this lane.
                    </div>
                ) : null}
            </motion.div>
        </section>
    );
}

export default function KdsPage() {
    const { storeId, db, loading } = useRestaurant();
    const [orders, setOrders] = useState<KdsOrder[]>([]);
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
    const [listenerError, setListenerError] = useState<string | null>(null);
    const [now, setNow] = useState<number>(() => Date.now());

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const dingUrlRef = useRef<string | null>(null);
    const seenPendingIdsRef = useRef<Set<string>>(new Set());
    const seededRef = useRef(false);

    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        dingUrlRef.current = createDingUrl();
        audioRef.current = new Audio(dingUrlRef.current);
        audioRef.current.preload = 'auto';

        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = '';
            }
            if (dingUrlRef.current) {
                URL.revokeObjectURL(dingUrlRef.current);
            }
        };
    }, []);

    const playDing = () => {
        const player = audioRef.current;
        if (!player) return;
        player.currentTime = 0;
        player.play().catch(() => {
            // Browser may block autoplay before user interaction.
        });
    };

    useEffect(() => {
        if (!storeId || !db || loading) return;

        let fallbackEnabled = false;
        let unsubscribe: (() => void) | null = null;

        const ordersRef = collection(db as Firestore, 'restaurants', storeId, 'orders');

        const applySnapshot = (snapshot: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => {
            const next = snapshot.docs
                .map((row) => parseOrder(row.id, row.data()))
                .filter((order): order is KdsOrder => Boolean(order))
                .filter((order) => ACTIVE_STATUSES.has(order.status))
                .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

            setOrders(next);
            setListenerError(null);
        };

        const startFallbackListener = () => {
            if (fallbackEnabled) return;
            fallbackEnabled = true;

            const fallbackQuery = query(ordersRef, orderBy('created_at', 'asc'));
            unsubscribe = onSnapshot(
                fallbackQuery,
                applySnapshot,
                (error) => {
                    setListenerError(error.message || 'Live feed unavailable.');
                }
            );
        };

        const primaryQuery = query(
            ordersRef,
            where('status', '!=', 'completed'),
            orderBy('status'),
            orderBy('created_at', 'asc')
        );

        unsubscribe = onSnapshot(
            primaryQuery,
            applySnapshot,
            () => {
                if (unsubscribe) unsubscribe();
                startFallbackListener();
            }
        );

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [storeId, db, loading]);

    useEffect(() => {
        const currentPending = new Set(orders.filter((o) => o.status === 'new').map((o) => o.id));

        if (!seededRef.current) {
            seenPendingIdsRef.current = currentPending;
            seededRef.current = true;
            return;
        }

        const hasNewPending = [...currentPending].some((id) => !seenPendingIdsRef.current.has(id));
        if (hasNewPending) playDing();

        seenPendingIdsRef.current = currentPending;
    }, [orders]);

    const pendingOrders = useMemo(() => orders.filter((o) => o.status === 'new'), [orders]);
    const preparingOrders = useMemo(() => orders.filter((o) => o.status === 'preparing'), [orders]);
    const readyOrders = useMemo(() => orders.filter((o) => o.status === 'done'), [orders]);

    const updateStatus = async (order: KdsOrder) => {
        if (!storeId || !db) return;

        const targetStatus = order.status === 'new' ? 'preparing' : 'done';
        setActionLoadingId(order.id);

        try {
            const orderRef = doc(db as Firestore, 'restaurants', storeId, 'orders', order.id);
            if (targetStatus === 'done') {
                await updateDoc(orderRef, {
                    status: 'done',
                    kds_ready_at: serverTimestamp(),
                    waiter_notified_at: serverTimestamp(),
                    waiter_notification: {
                        type: 'order_ready',
                        source: 'kds',
                        table_number: order.tableNumber,
                        order_id: order.id,
                        at: new Date().toISOString(),
                    },
                    updated_at: serverTimestamp(),
                });
            } else {
                await updateDoc(orderRef, {
                    status: 'preparing',
                    started_cooking_at: serverTimestamp(),
                    updated_at: serverTimestamp(),
                });
            }
        } finally {
            setActionLoadingId(null);
        }
    };

    return (
        <RoleGuard requiredPermission="can_view_kds">
            <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-100 to-slate-200 px-4 py-4 text-slate-900 lg:px-6">
                <header className="mb-4 rounded-3xl border border-slate-200 bg-white/95 px-4 py-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
                                <ChefHat className="h-6 w-6 text-emerald-600" /> Kitchen Display System
                            </h1>
                            <p className="mt-1 text-sm text-slate-600">Live Kanban board for active kitchen orders.</p>
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
                            <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                            Optimized for landscape tablet and TV view
                        </div>
                    </div>
                    {listenerError ? (
                        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">{listenerError}</p>
                    ) : null}
                </header>

                <div className="overflow-x-auto pb-2">
                    <div className="grid min-w-[1080px] grid-cols-3 gap-4">
                        <StatusColumn
                            lane="pending"
                            title="Pending"
                            subtitle="New tickets waiting to start"
                            orders={pendingOrders}
                            now={now}
                            actionLoadingId={actionLoadingId}
                            onAdvance={updateStatus}
                        />
                        <StatusColumn
                            lane="preparing"
                            title="Preparing"
                            subtitle="Orders currently being cooked"
                            orders={preparingOrders}
                            now={now}
                            actionLoadingId={actionLoadingId}
                            onAdvance={updateStatus}
                        />
                        <StatusColumn
                            lane="ready"
                            title="Ready"
                            subtitle="Ready for pickup/serve"
                            orders={readyOrders}
                            now={now}
                            actionLoadingId={actionLoadingId}
                            onAdvance={updateStatus}
                        />
                    </div>
                </div>
            </div>
        </RoleGuard>
    );
}
