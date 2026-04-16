'use client';

/**
 * Analytics Dashboard (Pro-only feature)
 * Shows revenue trends, order analytics, customer insights, and Daily Reports
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    BarChart3, TrendingUp, TrendingDown, IndianRupee,
    ShoppingBag, Users, Clock, Calendar, ArrowUpRight,
    FileText, Download, Loader2, ChevronRight, Lock, Sparkles
} from 'lucide-react';
import { useRestaurant } from '@/hooks/useRestaurant';
import { ProFeatureGate } from '@/components/dashboard/ProFeatureGate';
import { RoleGuard } from '@/components/dashboard/RoleGuard';
import { cn } from '@/lib/utils';
import { downloadReportPDF, generateWeeklySummaryPDF, type DailyReport } from '@/lib/reportPDF';
import { auth } from '@/lib/firebase';
import { hasSubscriptionFeature } from '@/lib/subscription-features';
import { toast } from 'sonner';

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(value || 0);
}

type AnalyticsOrder = {
    id: string;
    status: string;
    total: number;
    created_at: string;
    items: Array<{ name?: string; quantity?: number; price?: number }>;
};

// Reports Section Component
function ReportsSection() {
    const { storeId: tenantId, tenantName, subscriptionTier } = useRestaurant();
    const [reports, setReports] = useState<DailyReport[]>([]);
    const [showAllReports, setShowAllReports] = useState(false);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [downloadingWeekly, setDownloadingWeekly] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isPro = hasSubscriptionFeature(subscriptionTier, 'premium_dashboard');

    const fetchReports = useCallback(async () => {
        if (!tenantId) return;

        setLoading(true);
        try {
            const token = await auth.currentUser?.getIdToken();
            const res = await fetch(`/api/reports?restaurantId=${tenantId}&limit=7`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const data = await res.json();
            if (data.upgrade) {
                setError('upgrade');
            } else if (data.error) {
                setError(data.error);
            } else {
                setReports(data.reports || []);
                setError(null);
            }
        } catch (err) {
            setError('Failed to load reports');
        } finally {
            setLoading(false);
        }
    }, [tenantId]);

    useEffect(() => {
        fetchReports();
    }, [fetchReports]);

    const generateTodayReport = async () => {
        if (!tenantId) return;

        setGenerating(true);
        try {
            const token = await auth.currentUser?.getIdToken();
            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

            const res = await fetch('/api/reports', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ restaurantId: tenantId, date: yesterday })
            });

            const data = await res.json();
            if (data.report) {
                setReports(prev => [data.report, ...prev.filter(r => r.report_date !== data.report.report_date)]);
                toast.success(`Report generated for ${data.report.report_date}`);
            }
        } catch (err) {
            console.error('Failed to generate report:', err);
            toast.error('Failed to generate yesterday report');
        } finally {
            setGenerating(false);
        }
    };

    const handleDownload = (report: DailyReport) => {
        try {
            downloadReportPDF(report, tenantName || 'Restaurant');
            toast.success(`Downloaded report for ${report.report_date}`);
        } catch {
            toast.error('Report download failed. Please try again.');
        }
    };

    const normalizedReports = useMemo(() => {
        return reports
            .map((report) => {
                const parsedDate = new Date(report.report_date);
                const date = Number.isNaN(parsedDate.getTime())
                    ? new Date().toISOString().slice(0, 10)
                    : parsedDate.toISOString().slice(0, 10);

                return {
                    id: String(report.id || `report_${date}`),
                    restaurant_id: String(report.restaurant_id || tenantId || ''),
                    report_date: date,
                    total_revenue: Number(report.total_revenue || 0),
                    total_orders: Number(report.total_orders || 0),
                    avg_order_value: Number(report.avg_order_value || 0),
                    top_items: Array.isArray(report.top_items)
                        ? report.top_items.map((item) => ({
                            name: String(item?.name || 'Item'),
                            quantity: Number(item?.quantity || 0),
                            revenue: Number(item?.revenue || 0),
                        }))
                        : [],
                    hourly_breakdown: report.hourly_breakdown && typeof report.hourly_breakdown === 'object'
                        ? report.hourly_breakdown
                        : {},
                    busiest_hour: typeof report.busiest_hour === 'number' ? report.busiest_hour : null,
                    cancelled_orders: Number(report.cancelled_orders || 0),
                    generated_at: String(report.generated_at || new Date().toISOString()),
                } as DailyReport;
            })
            .sort((a, b) => new Date(b.report_date).getTime() - new Date(a.report_date).getTime());
    }, [reports, tenantId]);

    const visibleReports = useMemo(
        () => (showAllReports ? normalizedReports : normalizedReports.slice(0, 3)),
        [normalizedReports, showAllReports]
    );

    const handleDownloadWeekly = () => {
        if (normalizedReports.length === 0) {
            setError('No reports available for weekly summary.');
            toast.error('No reports available for weekly summary');
            return;
        }

        setDownloadingWeekly(true);
        const sortedReports = [...normalizedReports].sort((a, b) =>
            new Date(a.report_date).getTime() - new Date(b.report_date).getTime()
        );
        const weeklyReports = sortedReports.slice(-7);
        const weekStart = weeklyReports[0]?.report_date || '';
        const weekEnd = weeklyReports[weeklyReports.length - 1]?.report_date || '';

        try {
            const doc = generateWeeklySummaryPDF([...weeklyReports], tenantName || 'Restaurant', weekStart, weekEnd);
            doc.save(`${(tenantName || 'Restaurant').replace(/\s+/g, '_')}_Weekly_Report.pdf`);
            setError(null);
            toast.success('Weekly summary downloaded');
        } catch (err) {
            setError('Weekly summary download failed. Please try again.');
            toast.error('Weekly summary download failed. Please try again.');
        } finally {
            setDownloadingWeekly(false);
        }
    };

    // Not Pro - show upgrade prompt
    if (!isPro) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-8 border border-slate-700"
            >
                <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/30 flex-shrink-0">
                        <Lock className="w-7 h-7 text-white" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-xl font-bold text-white mb-2">Daily Reports</h3>
                        <p className="text-slate-300 mb-4">
                            Automated Daily Reports are a Pro feature. Upgrade to get sales insights
                            delivered to your inbox with professional PDF summaries.
                        </p>
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/20 border border-purple-500/30 rounded-xl text-purple-300 text-sm font-medium">
                                <Sparkles className="w-4 h-4" />
                                Pro Feature
                            </div>
                            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-400">
                                <li>• Revenue summaries</li>
                                <li>• Top selling items</li>
                                <li>• Peak hour analysis</li>
                                <li>• PDF downloads</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </motion.div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="bg-white rounded-2xl border border-slate-200 p-6"
        >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-600" />
                        Daily Reports
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">Download professional PDF summaries</p>
                </div>
                <div className="flex items-center gap-2">
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={generateTodayReport}
                        disabled={generating}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                    >
                        {generating ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <BarChart3 className="w-4 h-4" />
                        )}
                        Generate Yesterday's Report
                    </motion.button>
                    {normalizedReports.length > 1 && (
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleDownloadWeekly}
                            disabled={downloadingWeekly}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {downloadingWeekly ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            {downloadingWeekly ? 'Downloading...' : 'Weekly Summary'}
                        </motion.button>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                </div>
            ) : error && error !== 'upgrade' ? (
                <div className="text-center py-12 text-slate-500">
                    <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p>{error}</p>
                </div>
            ) : normalizedReports.length === 0 ? (
                <div className="text-center py-12">
                    <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">No reports yet</p>
                    <p className="text-slate-400 text-sm mt-1">Click "Generate Yesterday's Report" to create your first report</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {visibleReports.map((report, i) => {
                        const date = new Date(report.report_date);
                        const formattedDate = date.toLocaleDateString('en-IN', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric'
                        });

                        return (
                            <motion.div
                                key={`${report.id}-${report.report_date}`}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className="flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors group"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                                        <Calendar className="w-5 h-5 text-blue-600" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-slate-900">{formattedDate}</p>
                                        <p className="text-xs text-slate-500">
                                            {report.total_orders} orders • ₹{report.total_revenue.toLocaleString('en-IN')} revenue
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {report.busiest_hour !== null && (
                                        <div className="hidden sm:flex items-center gap-1 text-xs text-slate-500 bg-white px-2 py-1 rounded-lg">
                                            <Clock className="w-3 h-3" />
                                            Peak: {report.busiest_hour > 12 ? `${report.busiest_hour - 12}PM` : `${report.busiest_hour}AM`}
                                        </div>
                                    )}
                                    <motion.button
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => handleDownload(report)}
                                        className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-lg text-sm font-medium transition-all"
                                    >
                                        <Download className="w-4 h-4" />
                                        <span className="hidden sm:inline">Download PDF</span>
                                    </motion.button>
                                </div>
                            </motion.div>
                        );
                    })}

                    {normalizedReports.length > 3 && (
                        <div className="pt-2 flex justify-center">
                            <button
                                type="button"
                                onClick={() => setShowAllReports((prev) => !prev)}
                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                            >
                                {showAllReports ? 'Show less' : `See all (${normalizedReports.length})`}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </motion.div>
    );
}

function AnalyticsContent() {
    const { storeId: tenantId } = useRestaurant();
    const [overviewOrders, setOverviewOrders] = useState<AnalyticsOrder[]>([]);
    const [repeatCustomerRate, setRepeatCustomerRate] = useState(0);
    const [loadingOverview, setLoadingOverview] = useState(true);

    const fetchOverview = useCallback(async () => {
        if (!tenantId) {
            setOverviewOrders([]);
            setRepeatCustomerRate(0);
            setLoadingOverview(false);
            return;
        }

        setLoadingOverview(true);
        try {
            const token = await auth.currentUser?.getIdToken();
            if (!token) {
                setOverviewOrders([]);
                setRepeatCustomerRate(0);
                return;
            }
            const headers = { Authorization: `Bearer ${token}` };

            const [liveRes, historyRes, customersRes] = await Promise.all([
                fetch(`/api/orders/live?restaurantId=${tenantId}`, { headers, cache: 'no-store' }),
                fetch(`/api/orders/history?restaurantId=${tenantId}&limit=500`, { headers, cache: 'no-store' }),
                fetch(`/api/customers/list?restaurantId=${tenantId}`, { headers, cache: 'no-store' }),
            ]);

            const [liveData, historyData, customersData] = await Promise.all([
                liveRes.json().catch(() => ({})),
                historyRes.json().catch(() => ({})),
                customersRes.json().catch(() => ({})),
            ]);

            const liveOrders = (liveRes.ok && Array.isArray(liveData?.orders)) ? liveData.orders : [];
            const historyOrders = (historyRes.ok && Array.isArray(historyData?.orders)) ? historyData.orders : [];
            const merged = new Map<string, AnalyticsOrder>();

            [...liveOrders, ...historyOrders].forEach((order: any) => {
                if (!order?.id) return;
                merged.set(String(order.id), {
                    id: String(order.id),
                    status: String(order.status || 'new'),
                    total: Number(order.total || 0),
                    created_at: String(order.created_at || ''),
                    items: Array.isArray(order.items)
                        ? order.items.map((item: any) => ({
                            name: String(item?.name || item?.item_name || ''),
                            quantity: Number(item?.quantity || 0),
                            price: Number(item?.price || item?.item_price || 0),
                        }))
                        : [],
                });
            });

            setOverviewOrders(Array.from(merged.values()));

            if (customersRes.ok && Array.isArray(customersData?.customers)) {
                const customers = customersData.customers as Array<{ visitCount?: number }>;
                const total = customers.length;
                const repeats = customers.filter((c) => Number(c.visitCount || 0) > 1).length;
                setRepeatCustomerRate(total > 0 ? (repeats / total) * 100 : 0);
            } else {
                setRepeatCustomerRate(0);
            }
        } finally {
            setLoadingOverview(false);
        }
    }, [tenantId]);

    useEffect(() => {
        fetchOverview();
    }, [fetchOverview]);

    const revenueData = useMemo(() => {
        const bins = Array.from({ length: 7 }).map((_, idx) => {
            const date = new Date();
            date.setHours(0, 0, 0, 0);
            date.setDate(date.getDate() - (6 - idx));
            const dateKey = date.toISOString().slice(0, 10);
            return {
                dateKey,
                day: date.toLocaleDateString('en-IN', { weekday: 'short' }),
                revenue: 0,
            };
        });

        const indexByDate = new Map<string, number>();
        bins.forEach((entry, idx) => indexByDate.set(entry.dateKey, idx));

        overviewOrders
            .filter((order) => order.status !== 'cancelled')
            .forEach((order) => {
                const dateKey = new Date(order.created_at).toISOString().slice(0, 10);
                const idx = indexByDate.get(dateKey);
                if (idx === undefined) return;
                bins[idx].revenue += Number(order.total || 0);
            });

        return bins;
    }, [overviewOrders]);

    const topItems = useMemo(() => {
        const map = new Map<string, { orders: number; revenue: number }>();
        overviewOrders
            .filter((order) => order.status !== 'cancelled')
            .forEach((order) => {
                order.items.forEach((item) => {
                const key = String(item.name || 'Item');
                const existing = map.get(key) || { orders: 0, revenue: 0 };
                map.set(key, {
                    orders: existing.orders + Number(item.quantity || 0),
                    revenue: existing.revenue + (Number(item.price || 0) * Number(item.quantity || 0)),
                });
            });
        });

        return Array.from(map.entries())
            .map(([name, data]) => ({ name, orders: data.orders, revenue: data.revenue, trend: 0 }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);
    }, [overviewOrders]);

    const totalRevenue = useMemo(() => {
        return overviewOrders
            .filter((order) => order.status !== 'cancelled')
            .reduce((sum, order) => sum + Number(order.total || 0), 0);
    }, [overviewOrders]);
    const totalOrders = useMemo(() => {
        return overviewOrders.filter((order) => order.status !== 'cancelled').length;
    }, [overviewOrders]);
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const hasRevenueData = useMemo(() => revenueData.some((entry) => entry.revenue > 0), [revenueData]);

    const statCards = useMemo(() => ([
        { title: 'Total Revenue', value: formatCurrency(totalRevenue), change: 'Last 7 days', isPositive: true, icon: IndianRupee },
        { title: 'Total Orders', value: `${totalOrders}`, change: 'Last 7 days', isPositive: true, icon: ShoppingBag },
        { title: 'Avg Order Value', value: formatCurrency(avgOrderValue), change: 'Last 7 days', isPositive: true, icon: TrendingUp },
        { title: 'Repeat Customers', value: `${Math.round(repeatCustomerRate)}%`, change: 'Overall', isPositive: true, icon: Users },
    ]), [totalRevenue, totalOrders, avgOrderValue, repeatCustomerRate]);

    const maxRevenue = Math.max(1, ...revenueData.map(d => d.revenue));

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Analytics Dashboard</h1>
                    <p className="text-slate-500 text-sm mt-1">Track your restaurant's performance</p>
                </div>
                <div className="flex items-center gap-2">
                    <button className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                        <Calendar className="w-4 h-4 inline mr-2" />
                        Last 7 Days
                    </button>
                    <button className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors">
                        Export Report
                    </button>
                </div>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map((stat, i) => (
                    <motion.div
                        key={stat.title}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="bg-white rounded-2xl border border-slate-200 p-5"
                    >
                        <div className="flex items-center justify-between mb-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                                <stat.icon className="w-5 h-5 text-blue-600" />
                            </div>
                            <span className={cn(
                                "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
                                stat.isPositive
                                    ? "bg-green-50 text-green-600"
                                    : "bg-red-50 text-red-600"
                            )}>
                                {stat.isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                {stat.change}
                            </span>
                        </div>
                        <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                        <p className="text-sm text-slate-500 mt-1">{stat.title}</p>
                    </motion.div>
                ))}
            </div>

            {/* Revenue Chart */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50/70 to-blue-50/40 p-6 shadow-sm"
            >
                <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-blue-200/30 blur-2xl" />
                <div className="pointer-events-none absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-indigo-200/20 blur-2xl" />

                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">Revenue Trend</h2>
                        <p className="text-sm text-slate-500">Daily revenue for the past week</p>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                        <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50/80 px-3 py-1 font-medium text-blue-700">
                            <div className="h-2.5 w-2.5 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500"></div>
                            Revenue (INR)
                        </span>
                    </div>
                </div>

                <div className="relative h-72 rounded-2xl border border-slate-100 bg-white/70 p-4">
                    <div className="pointer-events-none absolute inset-0 px-4 py-4">
                        {[0, 25, 50, 75, 100].map((line) => (
                            <div
                                key={line}
                                className="absolute left-4 right-4 border-t border-dashed border-slate-200/80"
                                style={{ bottom: `${line}%` }}
                            />
                        ))}
                    </div>

                    <div className="relative z-10 h-full flex items-end gap-3">
                    {loadingOverview ? (
                        <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
                            Loading analytics...
                        </div>
                    ) : !hasRevenueData ? (
                        <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
                            No analytics data yet
                        </div>
                    ) : (
                        revenueData.map((data, i) => (
                            <div key={data.dateKey} className="flex-1 h-full flex flex-col items-center gap-2">
                                <div className="flex-1 w-full flex items-end">
                                    <motion.div
                                        initial={{ height: 0 }}
                                        animate={{ height: `${Math.max((data.revenue / maxRevenue) * 220, data.revenue > 0 ? 10 : 0)}px` }}
                                        transition={{ delay: 0.5 + i * 0.1, duration: 0.5 }}
                                        className="w-full rounded-t-xl border border-blue-300/30 bg-gradient-to-t from-blue-600 via-blue-500 to-sky-400 shadow-[0_10px_24px_-12px_rgba(59,130,246,0.9)] relative group cursor-pointer"
                                    >
                                        <div className="absolute -top-9 left-1/2 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-xs text-white opacity-0 shadow-md transition-opacity whitespace-nowrap group-hover:opacity-100">
                                            {formatCurrency(data.revenue)}
                                        </div>
                                    </motion.div>
                                </div>
                                <span className="text-xs font-medium text-slate-500">{data.day}</span>
                            </div>
                        ))
                    )}
                    </div>
                </div>
            </motion.div>

            {/* Top Items */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="bg-white rounded-2xl border border-slate-200 p-6"
            >
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Top Selling Items</h2>
                {loadingOverview ? (
                    <div className="text-center py-10 text-slate-400 text-sm">Loading item analytics...</div>
                ) : topItems.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 text-sm">No item analytics yet</div>
                ) : (
                    <div className="space-y-3">
                        {topItems.map((item, i) => (
                            <div key={item.name} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center text-sm font-bold text-slate-600">
                                        {i + 1}
                                    </div>
                                    <div>
                                        <p className="font-medium text-slate-900">{item.name}</p>
                                        <p className="text-xs text-slate-500">{item.orders} orders</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="font-semibold text-slate-900">₹{item.revenue.toLocaleString()}</p>
                                    <span className={cn(
                                        "text-xs",
                                        item.trend >= 0 ? "text-green-600" : "text-red-600"
                                    )}>
                                        {item.trend >= 0 ? '+' : ''}{item.trend}%
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </motion.div>

            {/* Daily Reports Section */}
            <ReportsSection />
        </div>
    );
}

export default function AnalyticsPage() {
    return (
        <RoleGuard requiredPermission="can_view_analytics">
            <ProFeatureGate
                feature="Analytics Dashboard"
                description="Get detailed insights into your restaurant's performance with revenue tracking, order analytics, and customer behavior data."
            >
                <AnalyticsContent />
            </ProFeatureGate>
        </RoleGuard>
    );
}
