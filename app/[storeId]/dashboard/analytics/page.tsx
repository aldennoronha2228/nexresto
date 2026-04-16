'use client';

/**
 * Analytics Dashboard (Pro-only feature)
 * Shows revenue trends, order analytics, customer insights, and Daily Reports
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    BarChart3, TrendingUp, TrendingDown, DollarSign,
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

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(value || 0);
}

// Reports Section Component
function ReportsSection() {
    const { storeId: tenantId, tenantName, subscriptionTier } = useRestaurant();
    const [reports, setReports] = useState<DailyReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
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
            }
        } catch (err) {
            console.error('Failed to generate report:', err);
        } finally {
            setGenerating(false);
        }
    };

    const handleDownload = (report: DailyReport) => {
        downloadReportPDF(report, tenantName || 'Restaurant');
    };

    const handleDownloadWeekly = () => {
        if (reports.length === 0) return;

        const sortedReports = [...reports].sort((a, b) =>
            new Date(a.report_date).getTime() - new Date(b.report_date).getTime()
        );
        const weekStart = sortedReports[0]?.report_date || '';
        const weekEnd = sortedReports[sortedReports.length - 1]?.report_date || '';

        const doc = generateWeeklySummaryPDF(reports, tenantName || 'Restaurant', weekStart, weekEnd);
        doc.save(`${(tenantName || 'Restaurant').replace(/\s+/g, '_')}_Weekly_Report.pdf`);
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
                    {reports.length > 1 && (
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleDownloadWeekly}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors"
                        >
                            <Download className="w-4 h-4" />
                            Weekly Summary
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
            ) : reports.length === 0 ? (
                <div className="text-center py-12">
                    <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">No reports yet</p>
                    <p className="text-slate-400 text-sm mt-1">Click "Generate Yesterday's Report" to create your first report</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {reports.map((report, i) => {
                        const date = new Date(report.report_date);
                        const formattedDate = date.toLocaleDateString('en-IN', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric'
                        });

                        return (
                            <motion.div
                                key={report.id}
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
                </div>
            )}
        </motion.div>
    );
}

function AnalyticsContent() {
    const { storeId: tenantId } = useRestaurant();
    const [reports, setReports] = useState<DailyReport[]>([]);
    const [repeatCustomerRate, setRepeatCustomerRate] = useState(0);
    const [loadingOverview, setLoadingOverview] = useState(true);

    const fetchOverview = useCallback(async () => {
        if (!tenantId) {
            setReports([]);
            setRepeatCustomerRate(0);
            setLoadingOverview(false);
            return;
        }

        setLoadingOverview(true);
        try {
            const token = await auth.currentUser?.getIdToken();
            const headers = { Authorization: `Bearer ${token}` };

            const [reportsRes, customersRes] = await Promise.all([
                fetch(`/api/reports?restaurantId=${tenantId}&limit=7`, { headers, cache: 'no-store' }),
                fetch(`/api/customers/list?restaurantId=${tenantId}`, { headers, cache: 'no-store' }),
            ]);

            const [reportsData, customersData] = await Promise.all([
                reportsRes.json().catch(() => ({})),
                customersRes.json().catch(() => ({})),
            ]);

            if (reportsRes.ok && Array.isArray(reportsData?.reports)) {
                setReports(reportsData.reports as DailyReport[]);
            } else {
                setReports([]);
            }

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

    const orderedReports = useMemo(
        () => [...reports].sort((a, b) => new Date(a.report_date).getTime() - new Date(b.report_date).getTime()),
        [reports]
    );

    const revenueData = useMemo(() => orderedReports.map((report) => ({
        day: new Date(report.report_date).toLocaleDateString('en-IN', { weekday: 'short' }),
        revenue: Number(report.total_revenue || 0),
    })), [orderedReports]);

    const topItems = useMemo(() => {
        const map = new Map<string, { orders: number; revenue: number }>();
        orderedReports.forEach((report) => {
            (report.top_items || []).forEach((item) => {
                const key = String(item.name || 'Item');
                const existing = map.get(key) || { orders: 0, revenue: 0 };
                map.set(key, {
                    orders: existing.orders + Number(item.quantity || 0),
                    revenue: existing.revenue + Number(item.revenue || 0),
                });
            });
        });

        return Array.from(map.entries())
            .map(([name, data]) => ({ name, orders: data.orders, revenue: data.revenue, trend: 0 }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);
    }, [orderedReports]);

    const totalRevenue = useMemo(
        () => orderedReports.reduce((sum, report) => sum + Number(report.total_revenue || 0), 0),
        [orderedReports]
    );
    const totalOrders = useMemo(
        () => orderedReports.reduce((sum, report) => sum + Number(report.total_orders || 0), 0),
        [orderedReports]
    );
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const statCards = useMemo(() => ([
        { title: 'Total Revenue', value: formatCurrency(totalRevenue), change: 'Last 7 days', isPositive: true, icon: DollarSign },
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
                className="bg-white rounded-2xl border border-slate-200 p-6"
            >
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">Revenue Trend</h2>
                        <p className="text-sm text-slate-500">Daily revenue for the past week</p>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                        <span className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                            Revenue
                        </span>
                    </div>
                </div>

                <div className="h-64 flex items-end gap-3">
                    {loadingOverview ? (
                        <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
                            Loading analytics...
                        </div>
                    ) : revenueData.length === 0 ? (
                        <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
                            No analytics data yet
                        </div>
                    ) : (
                        revenueData.map((data, i) => (
                            <div key={data.day} className="flex-1 flex flex-col items-center gap-2">
                                <motion.div
                                    initial={{ height: 0 }}
                                    animate={{ height: `${(data.revenue / maxRevenue) * 200}px` }}
                                    transition={{ delay: 0.5 + i * 0.1, duration: 0.5 }}
                                    className="w-full bg-gradient-to-t from-blue-500 to-blue-400 rounded-t-lg relative group cursor-pointer"
                                >
                                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                        {formatCurrency(data.revenue)}
                                    </div>
                                </motion.div>
                                <span className="text-xs text-slate-500">{data.day}</span>
                            </div>
                        ))
                    )}
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
