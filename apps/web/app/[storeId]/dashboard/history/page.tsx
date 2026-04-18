'use client';

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Calendar, Download, TrendingUp, DollarSign, ShoppingBag, RefreshCw, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DashboardOrder } from '@/lib/types';
import { useRestaurant } from '@/hooks/useRestaurant';
import { RoleGuard } from '@/components/dashboard/RoleGuard';
import { useAuth } from '@/context/AuthContext';
import { useSuperAdminAuth } from '@/context/SuperAdminAuthContext';
import { getActiveToken as resolveActiveToken } from '@/lib/client/get-active-token';

const statusConfig = {
    paid: { label: 'Paid', color: 'bg-emerald-500', ring: 'ring-emerald-500/20', text: 'text-emerald-700', bg: 'bg-emerald-50' },
    cancelled: { label: 'Cancelled', color: 'bg-rose-500', ring: 'ring-rose-500/20', text: 'text-rose-700', bg: 'bg-rose-50' },
    done: { label: 'Completed', color: 'bg-emerald-500', ring: 'ring-emerald-500/20', text: 'text-emerald-700', bg: 'bg-emerald-50' },
    new: { label: 'New', color: 'bg-blue-500', ring: 'ring-blue-500/20', text: 'text-blue-700', bg: 'bg-blue-50' },
    preparing: { label: 'Preparing', color: 'bg-amber-500', ring: 'ring-amber-500/20', text: 'text-amber-700', bg: 'bg-amber-50' },
};

function formatDate(iso: string) { return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
function formatTime(iso: string) { return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); }
function isToday(iso: string) { return new Date(iso).toDateString() === new Date().toDateString(); }
function isYesterday(iso: string) { const y = new Date(); y.setDate(y.getDate() - 1); return new Date(iso).toDateString() === y.toDateString(); }
function isThisWeek(iso: string) { return new Date(iso) >= new Date(Date.now() - 7 * 864e5); }
function isThisMonth(iso: string) { const d = new Date(iso), n = new Date(); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); }

export default function OrderHistoryPage() {
    const [allOrders, setAllOrders] = useState<DashboardOrder[]>([]);
    const [selectedDate, setSelectedDate] = useState('today');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { session } = useAuth();
    const { session: superAdminSession } = useSuperAdminAuth();
    const { storeId: tenantId, db: contextDb, loading: tenantLoading } = useRestaurant();

    const loadHistory = async (isMounted = true) => {
        if (!tenantId || !contextDb) {
            if (isMounted) setLoading(false);
            return;
        }
        try {
            if (isMounted) { setError(null); setLoading(true); }
            const idToken = await resolveActiveToken({
                tenantSessionToken: session?.access_token,
                superAdminSessionToken: superAdminSession?.access_token,
            });
            const response = await fetch(`/api/orders/history?restaurantId=${encodeURIComponent(tenantId)}&limit=200`, {
                headers: { Authorization: `Bearer ${idToken}` },
            });

            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload?.error || 'Could not load order history.');
            }

            const data = (payload.orders || []) as DashboardOrder[];
            if (isMounted) setAllOrders(data);
        } catch (err: any) {
            if (isMounted) setError(err.message || 'Could not load order history from Firebase.');
        } finally {
            if (isMounted) setLoading(false);
        }
    };

    useEffect(() => {
        let isMounted = true;
        loadHistory(isMounted);
        return () => { isMounted = false; };
    }, [tenantId, contextDb, session?.access_token, superAdminSession?.access_token]);

    const filteredOrders = allOrders.filter(o => {
        if (selectedDate === 'today') return isToday(o.created_at);
        if (selectedDate === 'yesterday') return isYesterday(o.created_at);
        if (selectedDate === 'week') return isThisWeek(o.created_at);
        if (selectedDate === 'month') return isThisMonth(o.created_at);
        return true;
    });

    const paidOrders = filteredOrders.filter(o => o.status === 'paid');
    const totalRevenue = paidOrders.reduce((sum, o) => sum + o.total, 0);
    const avgOrderValue = paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0;

    const exportCSV = () => {
        const rows = [
            ['Order ID', 'Date', 'Time', 'Table', 'Items', 'Total (₹)', 'Status'].join(','),
            ...filteredOrders.map(o => [o.daily_order_number ? `#${o.daily_order_number}` : o.id.slice(-8), formatDate(o.created_at), formatTime(o.created_at), o.table, o.items.length, o.total.toFixed(2), o.status].join(',')),
        ];
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
        a.download = `orders-${selectedDate}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
    };

    if (loading && !allOrders.length) return (
        <RoleGuard requiredPermission="can_view_history">
            <div className="flex flex-col items-center justify-center h-[60vh] gap-6">
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}>
                    <RefreshCw className="w-12 h-12 text-blue-600/30" />
                </motion.div>
                <div className="text-center">
                    <h3 className="text-slate-900 font-semibold text-xl">Loading your history...</h3>
                    <p className="text-slate-500 mt-2 max-w-sm mx-auto text-sm leading-relaxed">
                        Retrieving past order data from the server. This may take a few seconds on slower connections.
                    </p>
                </div>
                {error && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 p-5 bg-rose-50 border border-rose-100 rounded-2xl text-center max-w-md shadow-sm">
                        <p className="text-rose-700 text-sm font-medium mb-4">{error}</p>
                        <button
                            onClick={() => loadHistory(true)}
                            className="px-6 py-2.5 bg-white border border-rose-200 text-rose-700 text-sm font-bold rounded-xl hover:bg-rose-100 transition-all shadow-sm"
                        >
                            Retry Loading History
                        </button>
                    </motion.div>
                )}
            </div>
        </RoleGuard>
    );

    return (
        <RoleGuard requiredPermission="can_view_history">
            <div className="space-y-4 lg:space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl lg:text-4xl font-semibold text-slate-900">Order History</h1>
                        <p className="text-sm text-slate-500 mt-1">View and analyze past orders</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => loadHistory(true)} className="p-2 rounded-xl hover:bg-slate-100 transition-colors"><RefreshCw className="w-4 h-4 text-slate-500" /></button>
                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={exportCSV} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-medium text-sm shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-shadow w-full sm:w-auto">
                            <Download className="w-4 h-4" />Export CSV
                        </motion.button>
                    </div>
                </div>

                {error && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /><span>{error}</span>
                    </motion.div>
                )}

                <div className="flex items-center gap-2 lg:gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                    {['today', 'yesterday', 'week', 'month'].map(period => (
                        <motion.button key={period} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setSelectedDate(period)} className={cn('px-3 lg:px-4 py-2 rounded-xl text-xs lg:text-sm font-medium transition-all whitespace-nowrap flex-shrink-0', selectedDate === period ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25' : 'bg-white text-slate-600 border border-slate-200/60 hover:bg-slate-50')}>
                            {period.charAt(0).toUpperCase() + period.slice(1)}
                        </motion.button>
                    ))}
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="flex items-center gap-2 px-3 lg:px-4 py-2 bg-white rounded-xl text-xs lg:text-sm font-medium text-slate-600 border border-slate-200/60 hover:bg-slate-50 transition-colors whitespace-nowrap flex-shrink-0">
                        <Calendar className="w-4 h-4" /><span className="hidden sm:inline">Custom Range</span><span className="sm:hidden">Custom</span>
                    </motion.button>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                    {[
                        { label: 'Total Revenue', value: `₹${totalRevenue.toFixed(0)}`, icon: DollarSign, color: 'from-emerald-500 to-teal-500' },
                        { label: 'Total Orders', value: String(filteredOrders.length), icon: ShoppingBag, color: 'from-blue-500 to-indigo-500' },
                        { label: 'Avg Order Value', value: `₹${isNaN(avgOrderValue) ? 0 : avgOrderValue.toFixed(0)}`, icon: TrendingUp, color: 'from-violet-500 to-purple-500' },
                        { label: 'Paid Orders', value: String(paidOrders.length), icon: TrendingUp, color: 'from-rose-500 to-pink-500' },
                    ].map((stat, i) => (
                        <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} whileHover={{ y: -4 }} className="relative bg-white rounded-2xl p-4 lg:p-6 border border-slate-200/60 shadow-sm hover:shadow-md transition-all overflow-hidden">
                            <div className={cn('absolute -right-6 -top-6 w-24 h-24 rounded-full opacity-10 bg-gradient-to-br', stat.color)} />
                            <div className="relative">
                                <div className={cn('w-8 h-8 lg:w-10 lg:h-10 rounded-xl bg-gradient-to-br flex items-center justify-center mb-2 lg:mb-3', stat.color)}>
                                    <stat.icon className="w-4 h-4 lg:w-5 lg:h-5 text-white" />
                                </div>
                                <p className="text-xs lg:text-sm text-slate-500">{stat.label}</p>
                                <p className="text-lg lg:text-2xl font-semibold text-slate-900 mt-1">{stat.value}</p>
                            </div>
                        </motion.div>
                    ))}
                </div>

                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
                    <div className="p-4 lg:p-6 border-b border-slate-200/60 flex items-center justify-between">
                        <h2 className="text-base lg:text-lg font-semibold text-slate-900">Orders <span className="ml-2 text-xs text-slate-500 font-normal">({filteredOrders.length})</span></h2>
                    </div>
                    {filteredOrders.length === 0 ? (
                        <div className="p-12 text-center"><p className="text-4xl mb-3">📭</p><p className="text-slate-500">No orders found for this period</p></div>
                    ) : (
                        <>
                            <div className="lg:hidden divide-y divide-slate-200/60">
                                {filteredOrders.map((order, i) => {
                                    const config = statusConfig[order.status as keyof typeof statusConfig] ?? statusConfig.paid;
                                    return (
                                        <motion.div key={order.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }} className="p-4">
                                            <div className="flex items-start justify-between mb-3">
                                                <div>
                                                    <span className="font-semibold text-slate-900">{order.daily_order_number ? `#${order.daily_order_number}` : order.id.slice(-8).toUpperCase()}</span>
                                                    <div className="text-xs text-slate-500 mt-1">{formatDate(order.created_at)} • {formatTime(order.created_at)}</div>
                                                </div>
                                                <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-medium ring-2', config.bg, config.text, config.ring)}>
                                                    <span className={cn('w-1.5 h-1.5 rounded-full', config.color)} />{config.label}
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-3 gap-3 text-sm">
                                                <div><span className="text-slate-500 text-xs">Table</span><div className="font-medium text-slate-900">{order.table}</div></div>
                                                <div><span className="text-slate-500 text-xs">Items</span><div className="font-medium text-slate-900">{order.items.length}</div></div>
                                                <div><span className="text-slate-500 text-xs">Total</span><div className="font-semibold text-slate-900">₹{order.total.toFixed(0)}</div></div>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                            <div className="hidden lg:block overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-slate-50/50">
                                        <tr>{['Order', 'Date & Time', 'Table', 'Items', 'Total', 'Status'].map(h => <th key={h} className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">{h}</th>)}</tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200/60">
                                        {filteredOrders.map((order, i) => {
                                            const config = statusConfig[order.status as keyof typeof statusConfig] ?? statusConfig.paid;
                                            return (
                                                <motion.tr key={order.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-900">{order.daily_order_number ? `#${order.daily_order_number}` : order.id.slice(-8).toUpperCase()}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600"><div>{formatDate(order.created_at)}</div><div className="text-slate-400">{formatTime(order.created_at)}</div></td>
                                                    <td className="px-6 py-4 whitespace-nowrap"><span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium">{order.table}</span></td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{order.items.length} items</td>
                                                    <td className="px-6 py-4 whitespace-nowrap"><span className="font-semibold text-slate-900">₹{order.total.toFixed(0)}</span></td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ring-2', config.bg, config.text, config.ring)}>
                                                            <span className={cn('w-1.5 h-1.5 rounded-full', config.color)} />{config.label}
                                                        </span>
                                                    </td>
                                                </motion.tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                    <div className="px-4 lg:px-6 py-4 border-t border-slate-200/60">
                        <p className="text-xs lg:text-sm text-slate-500">Showing {filteredOrders.length} orders</p>
                    </div>
                </motion.div>
            </div>
        </RoleGuard>
    );
}
