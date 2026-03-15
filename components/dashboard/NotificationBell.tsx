'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, ShoppingBag, Clock, X, Trash2 } from 'lucide-react';
import { tenantAuth, adminAuth } from '@/lib/firebase';
import { useRestaurant } from '@/hooks/useRestaurant';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────
type NotifType = 'new_order';

interface Notification {
    id: string;
    type: NotifType;
    title: string;
    message: string;
    timestamp: Date;
    read: boolean;
    orderId: string;
}

const TYPE_CONFIG: Record<NotifType, { icon: React.ReactNode; color: string; bg: string }> = {
    new_order: { icon: <ShoppingBag className="w-4 h-4" />, color: 'text-blue-600', bg: 'bg-blue-50' },
};

function timeAgo(date: Date): string {
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

// ─── Component ────────────────────────────────────────────────────────────────
export function NotificationBell() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [open, setOpen] = useState(false);
    const [retryNonce, setRetryNonce] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const audioRef = useRef<AudioContext | null>(null);
    const { storeId, loading } = useRestaurant();
    const seenOrderIds = useRef(new Set<string>());

    const refreshTokens = useCallback(async () => {
        const jobs: Promise<unknown>[] = [];
        if (tenantAuth.currentUser) jobs.push(tenantAuth.currentUser.getIdToken(true));
        if (adminAuth.currentUser) jobs.push(adminAuth.currentUser.getIdToken(true));
        if (jobs.length > 0) {
            await Promise.allSettled(jobs);
        }
    }, []);

    // ── play a subtle "ding" using Web Audio API ──────────────────────────────
    const playDing = useCallback(() => {
        try {
            const ctx = audioRef.current ?? new AudioContext();
            audioRef.current = ctx;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.5);
        } catch {
            // Audio not available (e.g. browser blocked) — silently ignore
        }
    }, []);

    const addNotification = useCallback((notif: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
        setNotifications((prev) => [
            { ...notif, id: crypto.randomUUID(), timestamp: new Date(), read: false },
            ...prev.slice(0, 49), // cap at 50 notifications
        ]);
        playDing();
    }, [playDing]);

    const getActiveToken = useCallback(async (): Promise<string> => {
        if (adminAuth.currentUser) return adminAuth.currentUser.getIdToken(true);
        if (tenantAuth.currentUser) return tenantAuth.currentUser.getIdToken(true);
        throw new Error('Missing active session');
    }, []);

    // ── Poll server endpoint for newly created "new" orders ─────────────────
    useEffect(() => {
        if (!storeId || loading) return;

        let cancelled = false;
        let seeded = false;

        const poll = async () => {
            try {
                const token = await getActiveToken();
                const res = await fetch(`/api/orders/new?restaurantId=${encodeURIComponent(storeId)}&limit=20`, {
                    headers: { Authorization: `Bearer ${token}` },
                    cache: 'no-store',
                });

                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    const message = String(data?.error || 'Failed to load notifications');
                    if (message.toLowerCase().includes('permission')) {
                        await refreshTokens();
                    }
                    return;
                }

                const data = await res.json();
                const rows = Array.isArray(data?.orders) ? data.orders : [];

                if (!seeded) {
                    rows.forEach((o: any) => seenOrderIds.current.add(String(o.id)));
                    seeded = true;
                    return;
                }

                rows.forEach((o: any) => {
                    const orderId = String(o.id || '');
                    if (!orderId || seenOrderIds.current.has(orderId)) return;

                    seenOrderIds.current.add(orderId);
                    const createdAt = new Date(String(o.created_at || Date.now()));
                    const ageMs = Date.now() - createdAt.getTime();
                    if (ageMs > 30000) return;

                    if (!cancelled) {
                        addNotification({
                            type: 'new_order',
                            title: '🛎️ New Order',
                            message: `Table ${String(o.table_number || '-') } placed an order`,
                            orderId,
                        });
                    }
                });
            } catch {
                // Silent by design: notifications should not break dashboard UX.
            }
        };

        poll();
        const interval = setInterval(poll, 12000);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [storeId, loading, addNotification, refreshTokens, getActiveToken, retryNonce]);

    // ── Close on outside click ─────────────────────────────────────────────────
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const unread = notifications.filter((n) => !n.read).length;

    const markAllRead = () =>
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

    const dismiss = (id: string) =>
        setNotifications((prev) => prev.filter((n) => n.id !== id));

    const clearAll = () => setNotifications([]);

    const handleOpen = () => {
        setOpen((prev) => {
            if (!prev) markAllRead(); // mark all read when opening
            return !prev;
        });
    };

    return (
        <div ref={containerRef} className="relative">
            {/* Bell button */}
            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleOpen}
                className={cn(
                    'relative w-9 h-9 rounded-xl flex items-center justify-center transition-colors',
                    open ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 hover:bg-slate-100 text-slate-600'
                )}
            >
                <motion.div
                    animate={unread > 0 ? { rotate: [0, -15, 15, -10, 10, 0] } : {}}
                    transition={{ duration: 0.5, repeat: unread > 0 ? Infinity : 0, repeatDelay: 4 }}
                >
                    <Bell className="w-4 h-4" />
                </motion.div>

                {/* Unread badge */}
                <AnimatePresence>
                    {unread > 0 && (
                        <motion.span
                            key="badge"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none"
                        >
                            {unread > 9 ? '9+' : unread}
                        </motion.span>
                    )}
                </AnimatePresence>
            </motion.button>

            {/* Dropdown panel */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-xl border border-slate-200/60 z-50 overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
                                {unread > 0 && (
                                    <span className="px-1.5 py-0.5 bg-rose-100 text-rose-600 text-[10px] font-bold rounded-full">
                                        {unread} new
                                    </span>
                                )}
                            </div>
                            {notifications.length > 0 && (
                                <button
                                    onClick={clearAll}
                                    className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-500 transition-colors"
                                >
                                    <Trash2 className="w-3 h-3" /> Clear all
                                </button>
                            )}
                        </div>

                        {/* List */}
                        <div className="max-h-96 overflow-y-auto">
                            {notifications.length === 0 ? (
                                <div className="px-4 py-10 text-center">
                                    <Bell className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                                    <p className="text-sm text-slate-400 font-medium">No notifications yet</p>
                                    <p className="text-xs text-slate-300 mt-1">New orders will appear here in real-time</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-50">
                                    {notifications.map((notif) => {
                                        const cfg = TYPE_CONFIG[notif.type];
                                        return (
                                            <motion.div
                                                key={notif.id}
                                                layout
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: 10, height: 0 }}
                                                className={cn(
                                                    'flex items-start gap-3 px-4 py-3 hover:bg-slate-50/80 transition-colors group',
                                                    !notif.read && 'bg-blue-50/30'
                                                )}
                                            >
                                                {/* Icon */}
                                                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', cfg.bg, cfg.color)}>
                                                    {cfg.icon}
                                                </div>

                                                {/* Text */}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-semibold text-slate-900">{notif.title}</p>
                                                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{notif.message}</p>
                                                    <div className="flex items-center gap-1 mt-1">
                                                        <Clock className="w-3 h-3 text-slate-300" />
                                                        <span className="text-[10px] text-slate-400">{timeAgo(notif.timestamp)}</span>
                                                    </div>
                                                </div>

                                                {/* Dismiss */}
                                                <button
                                                    onClick={() => dismiss(notif.id)}
                                                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-slate-200 rounded transition-all flex-shrink-0 mt-0.5"
                                                >
                                                    <X className="w-3 h-3 text-slate-400" />
                                                </button>

                                                {/* Unread dot */}
                                                {!notif.read && (
                                                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full flex-shrink-0 mt-2" />
                                                )}
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        {notifications.length > 0 && (
                            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/50">
                                <p className="text-[10px] text-slate-400 text-center">
                                    🔴 Live — new orders appear automatically
                                </p>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
