'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, CheckCircle2, Clock3 } from 'lucide-react';
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

type WaiterOrderItem = {
    name: string;
    quantity: number;
};

type WaiterOrder = {
    id: string;
    orderNumber: string;
    tableNumber: string;
    createdAt: Date;
    readyAt: Date;
    items: WaiterOrderItem[];
    note: string | null;
};

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

function parseItems(source: unknown): WaiterOrderItem[] {
    if (!Array.isArray(source)) return [];

    return source
        .map((entry) => {
            const row = (entry || {}) as Record<string, unknown>;
            const name = String(row.item_name || row.name || 'Item').trim();
            const quantity = Math.max(1, Number(row.quantity || 1));
            return { name, quantity };
        })
        .filter((item) => item.name.length > 0)
        .slice(0, 12);
}

function parseOrder(rowId: string, data: Record<string, unknown>): WaiterOrder | null {
    const status = String(data.status || '').toLowerCase();
    if (status !== 'done' && status !== 'ready') return null;
    if (data.waiter_served_at) return null;

    return {
        id: rowId,
        orderNumber: data.daily_order_number ? String(data.daily_order_number) : rowId.slice(-6).toUpperCase(),
        tableNumber: String(data.table_number || data.table || 'N/A'),
        createdAt: toDate(data.created_at),
        readyAt: toDate(data.waiter_notified_at || data.kds_ready_at || data.updated_at || data.created_at),
        items: parseItems(data.items),
        note: String(data.note || data.notes || '').trim() || null,
    };
}

function formatElapsed(ms: number): string {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function WaiterPage() {
    const { storeId, db, loading } = useRestaurant();
    const [orders, setOrders] = useState<WaiterOrder[]>([]);
    const [now, setNow] = useState<number>(() => Date.now());
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
    const [listenerError, setListenerError] = useState<string | null>(null);
    const seenOrderIdsRef = useRef<Set<string>>(new Set());
    const seededRef = useRef(false);

    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!storeId || !db || loading) return;

        let fallbackEnabled = false;
        let unsubscribe: (() => void) | null = null;

        const ordersRef = collection(db as Firestore, 'restaurants', storeId, 'orders');

        const applySnapshot = (snapshot: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => {
            const next = snapshot.docs
                .map((row) => parseOrder(row.id, row.data()))
                .filter((order): order is WaiterOrder => Boolean(order))
                .sort((a, b) => b.readyAt.getTime() - a.readyAt.getTime());

            setOrders(next);
            setListenerError(null);
        };

        const startFallbackListener = () => {
            if (fallbackEnabled) return;
            fallbackEnabled = true;

            const fallbackQuery = query(ordersRef, orderBy('updated_at', 'desc'));
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
            where('status', '==', 'done'),
            orderBy('waiter_notified_at', 'desc')
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
        const currentIds = new Set(orders.map((o) => o.id));
        if (!seededRef.current) {
            seededRef.current = true;
            seenOrderIdsRef.current = currentIds;
            return;
        }

        seenOrderIdsRef.current = currentIds;
    }, [orders]);

    const markServed = async (order: WaiterOrder) => {
        if (!storeId || !db) return;

        setActionLoadingId(order.id);
        try {
            const orderRef = doc(db as Firestore, 'restaurants', storeId, 'orders', order.id);
            await updateDoc(orderRef, {
                waiter_served_at: serverTimestamp(),
                waiter_service_status: 'served',
                waiter_service_source: 'waiter-display',
                updated_at: serverTimestamp(),
            });
        } finally {
            setActionLoadingId(null);
        }
    };

    const averageWait = useMemo(() => {
        if (orders.length === 0) return '00:00';
        const totalMs = orders.reduce((acc, order) => acc + (now - order.readyAt.getTime()), 0);
        return formatElapsed(totalMs / orders.length);
    }, [orders, now]);

    return (
        <RoleGuard requiredPermission="can_view_waiter">
            <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-100 to-slate-200 px-4 py-4 text-slate-900 lg:px-6">
                <header className="mb-4 rounded-3xl border border-slate-200 bg-white/95 px-4 py-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
                                <Bell className="h-6 w-6 text-emerald-600" /> Waiter Display
                            </h1>
                            <p className="mt-1 text-sm text-slate-600">Live notifications for dishes ready to serve.</p>
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
                            <Clock3 className="h-3.5 w-3.5 text-emerald-600" /> Avg ready wait: {averageWait}
                        </div>
                    </div>
                    {listenerError ? (
                        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">{listenerError}</p>
                    ) : null}
                </header>

                <section className="rounded-3xl border border-emerald-200 bg-emerald-50/70 p-3 shadow-sm">
                    <AnimatePresence initial={false}>
                        {orders.length === 0 ? (
                            <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="rounded-2xl border border-dashed border-emerald-300 bg-emerald-50 p-8 text-center text-sm text-emerald-800"
                            >
                                No dishes are waiting for service.
                            </motion.div>
                        ) : (
                            <div className="space-y-3">
                                {orders.map((order) => {
                                    const readyMs = now - order.readyAt.getTime();

                                    return (
                                        <motion.article
                                            key={order.id}
                                            layout
                                            initial={{ opacity: 0, y: 14, scale: 0.98 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: -10, scale: 0.96 }}
                                            transition={{ duration: 0.2 }}
                                            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
                                        >
                                            <div className="mb-3 flex items-start justify-between gap-3 border-b border-slate-100 pb-2">
                                                <div>
                                                    <p className="text-lg font-bold leading-none text-slate-900">Table {order.tableNumber}</p>
                                                    <p className="mt-1 text-xs tracking-[0.18em] text-slate-500">ORDER #{order.orderNumber}</p>
                                                </div>
                                                <div className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                                    <Clock3 className="h-3.5 w-3.5" /> Ready for {formatElapsed(readyMs)}
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                {order.items.map((item, idx) => (
                                                    <div key={`${order.id}-item-${idx}`} className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2">
                                                        <p className="text-sm font-semibold text-slate-900">
                                                            <span className="mr-2 text-slate-600">{item.quantity}x</span>
                                                            {item.name}
                                                        </p>
                                                    </div>
                                                ))}

                                                {order.note ? (
                                                    <p className="rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
                                                        Note: {order.note}
                                                    </p>
                                                ) : null}
                                            </div>

                                            <div className="mt-3 flex justify-end border-t border-slate-100 pt-2">
                                                <button
                                                    type="button"
                                                    disabled={actionLoadingId === order.id}
                                                    onClick={() => {
                                                        void markServed(order);
                                                    }}
                                                    className={[
                                                        'inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition',
                                                        actionLoadingId === order.id
                                                            ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                                                            : 'bg-emerald-600 text-white hover:bg-emerald-700',
                                                    ].join(' ')}
                                                >
                                                    <CheckCircle2 className="h-4 w-4" />
                                                    {actionLoadingId === order.id ? 'Updating...' : 'Mark Served'}
                                                </button>
                                            </div>
                                        </motion.article>
                                    );
                                })}
                            </div>
                        )}
                    </AnimatePresence>
                </section>
            </div>
        </RoleGuard>
    );
}
