'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
    Activity,
    AlertTriangle,
    Database,
    HardDrive,
    RefreshCw,
    Sparkles,
    Wifi,
} from 'lucide-react';
import {
    collection,
    doc,
    onSnapshot,
    type Unsubscribe,
} from 'firebase/firestore';
import { getMetadata, listAll, ref } from 'firebase/storage';
import { adminDb, adminStorage } from '@/lib/firebase';
import { cn } from '@/lib/utils';

export interface RestaurantUsage {
    id: string;
    name: string;
    logo_url: string | null;
    subscription_tier: 'starter' | 'pro' | '1k' | '2k' | '2.5k';
    subscription_status: 'active' | 'past_due' | 'cancelled' | 'trial' | 'expired';
    storage_used_bytes: number;
    storage_limit_bytes: number;
    ai_credits_used: number;
    ai_credits_limit: number;
    db_reads: number;
    db_writes: number;
    bandwidth_used_bytes: number;
    bandwidth_limit_bytes: number;
    daily_ai_count: number;
    daily_ai_limit: number;
    daily_ai_tier: 'free' | 'pro';
}

function formatCompact(value: number): string {
    return new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function bytesToReadable(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function clampPercent(used: number, limit: number): number {
    if (limit <= 0) return 0;
    return Math.min(100, Math.max(0, (used / limit) * 100));
}

function toNumber(...values: unknown[]): number {
    for (const value of values) {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
    }
    return 0;
}

function firstPositiveNumber(...values: unknown[]): number {
    for (const value of values) {
        const numeric = toNumber(value);
        if (numeric > 0) return numeric;
    }
    return 0;
}

function normalizeStatus(rawStatus: unknown, endDateRaw: unknown): RestaurantUsage['subscription_status'] {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (typeof endDateRaw === 'string' && endDateRaw) {
        const endDate = new Date(endDateRaw);
        if (!Number.isNaN(endDate.getTime())) {
            const normalized = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
            if (normalized < today) return 'expired';
        }
    }

    if (rawStatus === 'active' || rawStatus === 'past_due' || rawStatus === 'cancelled' || rawStatus === 'trial' || rawStatus === 'expired') {
        return rawStatus;
    }
    return 'active';
}

function tierBadgeClass(tier: RestaurantUsage['subscription_tier']): string {
    if (tier === 'pro' || tier === '2k') return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
    if (tier === '2.5k') return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
}

function resolveDailyAiTier(tier: RestaurantUsage['subscription_tier']): 'free' | 'pro' {
    return tier === 'pro' || tier === '2k' || tier === '2.5k' ? 'pro' : 'free';
}

async function sumStorageBytesRecursive(prefix: string): Promise<number> {
    const root = ref(adminStorage, prefix);

    const walk = async (folderRef: ReturnType<typeof ref>): Promise<number> => {
        const result = await listAll(folderRef);
        const fileBytes = await Promise.all(result.items.map(async (itemRef) => {
            const metadata = await getMetadata(itemRef);
            return Number(metadata.size || 0);
        }));

        const nested = await Promise.all(result.prefixes.map((subRef) => walk(subRef)));
        const localTotal = fileBytes.reduce((a, b) => a + b, 0);
        const nestedTotal = nested.reduce((a, b) => a + b, 0);
        return localTotal + nestedTotal;
    };

    try {
        return await walk(root);
    } catch {
        return 0;
    }
}

export default function ResourceMonitorPage() {
    const [rows, setRows] = useState<RestaurantUsage[]>([]);
    const [loading, setLoading] = useState(true);
    const [snapshotError, setSnapshotError] = useState<string | null>(null);
    const [rowStorageLoading, setRowStorageLoading] = useState<Record<string, boolean>>({});
    const [rowStorageError, setRowStorageError] = useState<Record<string, string>>({});
    const [hasInitialStorageSync, setHasInitialStorageSync] = useState(false);

    const usageUnsubsRef = useRef<Record<string, Unsubscribe>>({});

    const syncStorageForRow = useCallback(async (restaurantId: string) => {
        setRowStorageLoading((prev) => ({ ...prev, [restaurantId]: true }));
        setRowStorageError((prev) => ({ ...prev, [restaurantId]: '' }));

        try {
            const prefixes = [`restaurants/${restaurantId}/`, `${restaurantId}/`];
            const scanPromise = (async () => {
                let bytes = 0;
                for (const prefix of prefixes) {
                    const next = await sumStorageBytesRecursive(prefix);
                    if (next > 0) {
                        bytes = next;
                        break;
                    }
                }
                return bytes;
            })();

            const timeoutPromise = new Promise<number>((resolve) => {
                setTimeout(() => resolve(0), 15000);
            });

            const bytes = await Promise.race([scanPromise, timeoutPromise]);

            setRows((prev) => prev.map((row) => (
                row.id === restaurantId ? { ...row, storage_used_bytes: bytes } : row
            )));
        } catch {
            setRowStorageError((prev) => ({
                ...prev,
                [restaurantId]: 'Storage sync failed',
            }));
        } finally {
            setRowStorageLoading((prev) => ({ ...prev, [restaurantId]: false }));
        }
    }, []);

    const syncAllStorage = useCallback(async () => {
        const ids = rows.map((r) => r.id);
        await Promise.all(ids.map((id) => syncStorageForRow(id)));
    }, [rows, syncStorageForRow]);

    useEffect(() => {
        const restaurantsRef = collection(adminDb, 'restaurants');

        const unsubRestaurants = onSnapshot(
            restaurantsRef,
            (snapshot) => {
                setSnapshotError(null);
                Object.values(usageUnsubsRef.current).forEach((unsub) => unsub());
                usageUnsubsRef.current = {};

            const baseRows: RestaurantUsage[] = snapshot.docs.map((docSnap) => {
                const d = docSnap.data() as Record<string, unknown>;

                return {
                    id: docSnap.id,
                    name: String(d.name || docSnap.id),
                    logo_url: (d.logo_url as string) || (d.logo as string) || null,
                    subscription_tier: ((d.subscription_tier as RestaurantUsage['subscription_tier']) || 'starter'),
                    subscription_status: normalizeStatus(d.subscription_status, d.subscription_end_date),
                    storage_used_bytes: 0,
                    storage_limit_bytes: firstPositiveNumber(d.storage_limit_bytes, d.storage_limit_mb ? Number(d.storage_limit_mb) * 1024 * 1024 : 0, 500 * 1024 * 1024),
                    ai_credits_used: toNumber((d as any).usage?.ai_credits_used, d.ai_credits_used),
                    ai_credits_limit: firstPositiveNumber(d.ai_credits_limit, 1000),
                    db_reads: toNumber(d.db_reads, (d as any).usage?.db_reads),
                    db_writes: toNumber(d.db_writes, (d as any).usage?.db_writes),
                    bandwidth_used_bytes: toNumber(d.bandwidth_used_bytes, d.bandwidth_used_mb ? Number(d.bandwidth_used_mb) * 1024 * 1024 : 0),
                    bandwidth_limit_bytes: firstPositiveNumber(d.bandwidth_limit_bytes, d.bandwidth_limit_mb ? Number(d.bandwidth_limit_mb) * 1024 * 1024 : 0, 2 * 1024 * 1024 * 1024),
                    daily_ai_count: toNumber((d as any).usage?.dailyAiCount),
                    daily_ai_limit: resolveDailyAiTier(((d.subscription_tier as RestaurantUsage['subscription_tier']) || 'starter')) === 'pro' ? 30 : 5,
                    daily_ai_tier: resolveDailyAiTier(((d.subscription_tier as RestaurantUsage['subscription_tier']) || 'starter')),
                };
            });

            setRows((prev) => baseRows.map((base) => {
                const existing = prev.find((p) => p.id === base.id);
                if (!existing) return base;
                return {
                    ...base,
                    storage_used_bytes: existing.storage_used_bytes,
                };
            }));
            setLoading(false);

                baseRows.forEach((row) => {
                    const usageRef = doc(adminDb, 'restaurants', row.id, 'usage', 'ai_credits_used');
                    usageUnsubsRef.current[row.id] = onSnapshot(
                        usageRef,
                        (usageSnap) => {
                            const usage = usageSnap.exists() ? (usageSnap.data() as Record<string, unknown>) : {};
                            setRows((prev) => prev.map((prevRow) => {
                                if (prevRow.id !== row.id) return prevRow;
                                return {
                                    ...prevRow,
                                    ai_credits_used: toNumber(usage.ai_credits_used, usage.used, prevRow.ai_credits_used),
                                    ai_credits_limit: toNumber(usage.ai_credits_limit, prevRow.ai_credits_limit),
                                    db_reads: toNumber(usage.db_reads, usage.firestore_reads, prevRow.db_reads),
                                    db_writes: toNumber(usage.db_writes, usage.firestore_writes, prevRow.db_writes),
                                    bandwidth_used_bytes: toNumber(
                                        usage.bandwidth_used_bytes,
                                        usage.bandwidth_used_mb ? Number(usage.bandwidth_used_mb) * 1024 * 1024 : 0,
                                        prevRow.bandwidth_used_bytes,
                                    ),
                                };
                            }));
                        },
                        (error) => {
                            if (error.code === 'permission-denied') {
                                setSnapshotError('Permission denied for usage metrics. Deploy updated Firestore rules and ensure super_admin claims are present.');
                            }
                        },
                    );
                });
            },
            (error) => {
                setLoading(false);
                if (error.code === 'permission-denied') {
                    setSnapshotError('Permission denied for restaurants listener. Check Firestore rules deployment and custom claims.');
                } else {
                    setSnapshotError(`Realtime listener error: ${error.message}`);
                }
            },
        );

        return () => {
            unsubRestaurants();
            Object.values(usageUnsubsRef.current).forEach((unsub) => unsub());
            usageUnsubsRef.current = {};
        };
    }, []);

    useEffect(() => {
        if (hasInitialStorageSync || rows.length === 0) return;
        setHasInitialStorageSync(true);
        syncAllStorage().catch(() => {
            // best-effort sync; row-level retry is available
        });
    }, [hasInitialStorageSync, rows.length, syncAllStorage]);

    const handleSyncNow = async (restaurantId?: string) => {
        if (restaurantId) {
            await syncStorageForRow(restaurantId);
            return;
        }
        await syncAllStorage();
    };

    const totalAiCreditsUsed = useMemo(() => rows.reduce((acc, row) => acc + row.ai_credits_used, 0), [rows]);
    const summary = useMemo(() => {
        const totalGlobalStorageBytes = rows.reduce((acc, row) => acc + row.storage_used_bytes, 0);
        const totalAiCostInr = rows.reduce((acc, row) => acc + row.ai_credits_used * 0.2, 0);
        const hotelsNearLimit = rows.filter((row) => {
            const storagePct = clampPercent(row.storage_used_bytes, row.storage_limit_bytes);
            const aiPct = clampPercent(row.ai_credits_used, row.ai_credits_limit);
            return storagePct >= 80 || aiPct >= 80;
        }).length;

        return {
            totalGlobalStorageBytes,
            totalAiCostInr,
            hotelsNearLimit,
        };
    }, [rows]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
                    <p className="text-slate-400">Loading resource monitor...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                <div className="rounded-xl bg-slate-800/80 border border-slate-700/60 px-4 py-3 backdrop-blur-sm">
                    <p className="text-slate-400 text-xs">Total Global Storage</p>
                    <p className="text-white text-lg font-semibold mt-1 flex items-center gap-2">
                        <HardDrive className="w-4 h-4 text-cyan-400" />
                        {bytesToReadable(summary.totalGlobalStorageBytes)}
                    </p>
                </div>

                <div className="rounded-xl bg-slate-800/80 border border-slate-700/60 px-4 py-3 backdrop-blur-sm">
                    <p className="text-slate-400 text-xs">Total AI Cost</p>
                    <p className="text-white text-lg font-semibold mt-1 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-purple-400" />
                        ₹{summary.totalAiCostInr.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </p>
                </div>

                <div className="rounded-xl bg-slate-800/80 border border-slate-700/60 px-4 py-3 backdrop-blur-sm">
                    <p className="text-slate-400 text-xs">Hotels near Limit</p>
                    <p className="text-white text-lg font-semibold mt-1 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        {summary.hotelsNearLimit}
                    </p>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-white">Resource Monitor</h1>
                    <p className="text-slate-400 mt-1">
                        {rows.length} restaurants tracked • {formatCompact(totalAiCreditsUsed)} AI credits used this month
                    </p>
                    {snapshotError && (
                        <p className="text-red-400 text-xs mt-2">{snapshotError}</p>
                    )}
                </div>
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSyncNow()}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white transition-colors disabled:opacity-50"
                >
                    <RefreshCw className="w-4 h-4" />
                    Sync Now
                </motion.button>
            </div>

            <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-x-auto">
                {rows.length === 0 ? (
                    <div className="h-64 flex items-center justify-center text-slate-400">
                        No restaurants found for usage monitoring.
                    </div>
                ) : (
                    <table className="w-full min-w-[1120px]">
                        <thead>
                            <tr className="border-b border-slate-700">
                                <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Restaurant</th>
                                <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Firebase Storage</th>
                                <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">AI Credits</th>
                                <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Tier Comparison</th>
                                <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Database Ops</th>
                                <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Bandwidth</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => {
                                const storagePercent = clampPercent(row.storage_used_bytes, row.storage_limit_bytes);
                                const aiPercent = clampPercent(row.ai_credits_used, row.ai_credits_limit);
                                const bandwidthPercent = clampPercent(row.bandwidth_used_bytes, row.bandwidth_limit_bytes);
                                const tierComparePercent = clampPercent(row.daily_ai_count, row.daily_ai_limit);
                                const nearLimit = storagePercent >= 80 || aiPercent >= 80 || tierComparePercent >= 80;

                                return (
                                    <tr
                                        key={row.id}
                                        className={cn(
                                            'border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors',
                                            nearLimit && 'bg-amber-500/[0.03]'
                                        )}
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                {row.logo_url ? (
                                                    <img
                                                        src={row.logo_url}
                                                        alt={row.name}
                                                        className="w-10 h-10 rounded-lg object-cover border border-slate-700"
                                                    />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center text-white font-bold">
                                                        {row.name[0]?.toUpperCase() || 'R'}
                                                    </div>
                                                )}
                                                <div>
                                                    <p className="text-white font-medium">{row.name}</p>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className={cn('px-2 py-0.5 rounded-full text-[10px] border', tierBadgeClass(row.subscription_tier))}>
                                                            {row.subscription_tier}
                                                        </span>
                                                        <span className="text-slate-500 text-xs">{row.id}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>

                                        <td className="px-6 py-4 min-w-[240px]">
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="text-slate-300 text-sm">
                                                    {bytesToReadable(row.storage_used_bytes)} / {bytesToReadable(row.storage_limit_bytes)}
                                                </p>
                                                <button
                                                    onClick={() => handleSyncNow(row.id)}
                                                    className="p-1.5 rounded-lg hover:bg-slate-700 transition-colors"
                                                    title="Sync storage"
                                                >
                                                    <RefreshCw className={cn('w-3.5 h-3.5 text-slate-400', rowStorageLoading[row.id] && 'animate-spin')} />
                                                </button>
                                            </div>
                                            {rowStorageLoading[row.id] ? (
                                                <div className="space-y-1">
                                                    <div className="h-2 rounded-full bg-slate-700/60 animate-pulse" />
                                                    <div className="h-2 w-2/3 rounded-full bg-slate-700/40 animate-pulse" />
                                                </div>
                                            ) : (
                                                <div className="w-full h-2 rounded-full bg-slate-700/60 overflow-hidden backdrop-blur-sm">
                                                    <div
                                                        className={cn(
                                                            'h-full rounded-full transition-all',
                                                            storagePercent >= 80
                                                                ? 'bg-gradient-to-r from-amber-400 to-orange-500'
                                                                : 'bg-gradient-to-r from-cyan-400 to-blue-500'
                                                        )}
                                                        style={{ width: `${storagePercent}%` }}
                                                    />
                                                </div>
                                            )}
                                            {!!rowStorageError[row.id] && (
                                                <p className="text-[11px] text-amber-400 mt-1">{rowStorageError[row.id]}</p>
                                            )}
                                        </td>

                                        <td className="px-6 py-4 min-w-[220px]">
                                            <p className="text-slate-300 text-sm mb-2">
                                                {row.ai_credits_used.toLocaleString('en-IN')} / {row.ai_credits_limit.toLocaleString('en-IN')}
                                            </p>
                                            <div className="w-full h-2 rounded-full bg-slate-700/60 overflow-hidden backdrop-blur-sm">
                                                <div
                                                    className={cn(
                                                        'h-full rounded-full transition-all',
                                                        aiPercent >= 80
                                                            ? 'bg-gradient-to-r from-rose-400 to-red-500'
                                                            : 'bg-gradient-to-r from-violet-400 to-purple-500'
                                                    )}
                                                    style={{ width: `${aiPercent}%` }}
                                                />
                                            </div>
                                        </td>

                                        <td className="px-6 py-4 min-w-[220px]">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className={cn(
                                                    'px-2 py-0.5 rounded-full text-[10px] border uppercase',
                                                    row.daily_ai_tier === 'pro'
                                                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                                                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                                )}>
                                                    {row.daily_ai_tier}
                                                </span>
                                                <p className="text-slate-200 text-sm">
                                                    {row.daily_ai_count} / {row.daily_ai_limit}
                                                </p>
                                            </div>
                                            <div className="w-full h-2 rounded-full bg-slate-700/60 overflow-hidden backdrop-blur-sm">
                                                <div
                                                    className={cn(
                                                        'h-full rounded-full transition-all',
                                                        tierComparePercent >= 80
                                                            ? 'bg-gradient-to-r from-amber-400 to-orange-500'
                                                            : 'bg-gradient-to-r from-emerald-400 to-cyan-500'
                                                    )}
                                                    style={{ width: `${tierComparePercent}%` }}
                                                />
                                            </div>
                                        </td>

                                        <td className="px-6 py-4">
                                            <div className="space-y-1 text-sm">
                                                <p className="text-slate-300 flex items-center gap-2">
                                                    <Database className="w-4 h-4 text-emerald-400" />
                                                    Reads: {row.db_reads.toLocaleString('en-IN')}
                                                </p>
                                                <p className="text-slate-400">Writes: {row.db_writes.toLocaleString('en-IN')}</p>
                                            </div>
                                        </td>

                                        <td className="px-6 py-4 min-w-[220px]">
                                            <p className="text-slate-300 text-sm mb-2 flex items-center gap-2">
                                                <Wifi className="w-4 h-4 text-blue-400" />
                                                {bytesToReadable(row.bandwidth_used_bytes)} / {bytesToReadable(row.bandwidth_limit_bytes)}
                                            </p>
                                            <div className="w-full h-2 rounded-full bg-slate-700/60 overflow-hidden backdrop-blur-sm">
                                                <div
                                                    className="h-full rounded-full bg-gradient-to-r from-blue-400 to-indigo-500 transition-all"
                                                    style={{ width: `${bandwidthPercent}%` }}
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="text-xs text-slate-500 flex items-center gap-2">
                <Activity className="w-3.5 h-3.5" />
                Live values come from Firestore onSnapshot listeners. Storage size is synced on mount and on-demand per row.
            </div>
        </div>
    );
}
