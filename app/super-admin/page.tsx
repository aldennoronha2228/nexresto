'use client';

/**
 * Super Admin Overview Dashboard
 * Shows high-level platform statistics
 */

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Geist } from 'next/font/google';
import {
    Building2,
    TrendingUp, RefreshCw, X, Check
} from 'lucide-react';
import { getPlatformStats, getGlobalLogs, type PlatformStats, type GlobalLog } from '@/lib/firebase-super-admin-actions';
import { cn } from '@/lib/utils';

const geist = Geist({ subsets: ['latin'] });

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
};

const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
};

const severityColors = {
    info: 'bg-cyan-400',
    warning: 'bg-amber-400',
    error: 'bg-rose-400',
    success: 'bg-emerald-400',
};

function MetricSparkline({ points, strokeClass }: { points: number[]; strokeClass: string }) {
    if (!points.length) return null;

    const max = Math.max(...points);
    const min = Math.min(...points);
    const range = max - min || 1;
    const width = 260;
    const height = 70;

    const d = points
        .map((point, index) => {
            const x = (index / Math.max(1, points.length - 1)) * width;
            const y = height - ((point - min) / range) * height;
            return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
        })
        .join(' ');

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="absolute -bottom-2 left-0 right-0 h-20 w-full opacity-45">
            <path d={d} fill="none" className={strokeClass} strokeWidth={2} strokeLinecap="round" />
        </svg>
    );
}

export default function SuperAdminOverview() {
    const [stats, setStats] = useState<PlatformStats | null>(null);
    const [recentLogs, setRecentLogs] = useState<GlobalLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedTier, setSelectedTier] = useState<'starter' | 'pro' | null>(null);

    const tierFeatures = {
        starter: {
            name: 'Starter',
            price: 'Γé╣1,000/mo',
            description: 'Perfect for small restaurants getting started',
            features: [
                { name: 'Digital Menu', included: true },
                { name: 'QR Code Ordering', included: true },
                { name: 'Order Management', included: true },
                { name: 'Basic Dashboard', included: true },
                { name: 'Email Support', included: true },
                { name: 'Up to 50 Menu Items', included: true },
                { name: 'Single Owner Only', included: true },
                { name: 'Multi-User Roles', included: false },
                { name: 'Role-Based Access Control', included: false },
                { name: 'Analytics & Insights', included: false },
                { name: 'Custom Branding', included: false },
                { name: 'Inventory Management', included: false },
            ]
        },
        pro: {
            name: 'Pro',
            price: 'Γé╣2,000/mo',
            description: 'For growing restaurants that need more power',
            features: [
                { name: 'Digital Menu', included: true },
                { name: 'QR Code Ordering', included: true },
                { name: 'Order Management', included: true },
                { name: 'Advanced Dashboard', included: true },
                { name: 'Priority Support', included: true },
                { name: 'Unlimited Menu Items', included: true },
                { name: 'Multi-User Roles (Owner, Manager, Staff)', included: true },
                { name: 'Role-Based Access Control (RBAC)', included: true },
                { name: 'Daily Reports & PDF Export', included: true },
                { name: 'Analytics & Insights', included: true },
                { name: 'Custom Branding', included: true },
                { name: 'Inventory Management', included: true },
            ]
        }
    };

    const loadData = async () => {
        try {
            const [statsData, logsData] = await Promise.all([
                getPlatformStats(),
                getGlobalLogs(10),
            ]);
            setStats(statsData);
            setRecentLogs(logsData);
        } catch (error) {
            console.error('Error loading super admin data:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadData();
        // Refresh every 30 seconds
        const interval = setInterval(loadData, 30000);
        return () => clearInterval(interval);
    }, []);

    const handleRefresh = () => {
        setRefreshing(true);
        loadData();
    };

    if (loading) {
        return (
            <div className={cn("flex items-center justify-center h-[60vh]", geist.className)}>
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-violet-500/20 border-t-violet-400 rounded-full animate-spin"></div>
                    <p className="text-slate-400">Loading platform data...</p>
                </div>
            </div>
        );
    }

    const statCards = [
        {
            label: 'Monthly Revenue (MRR)',
            value: formatCurrency(stats?.total_revenue || 0),
            color: 'from-emerald-400/60 to-emerald-500/10',
            stroke: 'stroke-emerald-300',
            change: '+12%',
            changeUp: true,
            points: [72, 70, 73, 75, 81, 85, 89, 91, 94, 97],
            size: 'lg',
        },
        {
            label: 'Total Restaurants',
            value: stats?.total_restaurants || 0,
            color: 'from-cyan-400/60 to-cyan-500/10',
            stroke: 'stroke-cyan-300',
            change: '+3',
            changeUp: true,
            points: [24, 26, 27, 30, 31, 32, 35, 36, 37, 39],
            size: 'md',
        },
        {
            label: 'Active Orders',
            value: stats?.active_orders || 0,
            color: 'from-fuchsia-400/60 to-fuchsia-600/10',
            stroke: 'stroke-fuchsia-300',
            change: 'Live',
            changeUp: true,
            points: [18, 22, 15, 28, 24, 32, 27, 35, 29, 37],
            size: 'md',
        },
        {
            label: 'New Signups (30d)',
            value: stats?.new_signups_30d || 0,
            color: 'from-violet-400/60 to-violet-600/10',
            stroke: 'stroke-violet-300',
            change: '+8%',
            changeUp: true,
            points: [9, 10, 11, 10, 13, 14, 15, 17, 18, 19],
            size: 'md',
        },
    ];

    return (
        <div className={cn("space-y-8 text-slate-100 isolate", geist.className)}>
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight text-white">Platform Overview</h1>
                    <p className="text-slate-400 mt-1">Monitor your entire NexResto command grid</p>
                </div>
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:text-violet-200 hover:border-violet-400/40 hover:bg-violet-500/10 transition-all disabled:opacity-50"
                >
                    <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} strokeWidth={1.5} />
                    Refresh
                </motion.button>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-12 gap-4">
                {statCards.map((stat, index) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className={cn(
                            "relative overflow-hidden rounded-3xl border border-white/8 p-6 bg-[#0b0b0c]/85 shadow-[0_10px_50px_rgba(0,0,0,0.35)]",
                            stat.size === 'lg' ? 'xl:col-span-6' : 'xl:col-span-2'
                        )}
                    >
                        <div className="relative z-10">
                            <div>
                                <p className="text-slate-400 text-xs uppercase tracking-[0.18em]">{stat.label}</p>
                                <p className={cn(
                                    "text-white mt-2 tracking-tight",
                                    stat.size === 'lg' ? 'text-5xl font-semibold' : 'text-3xl font-semibold'
                                )}>{stat.value}</p>
                                <div className="flex items-center gap-1 mt-2">
                                    <TrendingUp className="w-4 h-4 text-emerald-300" strokeWidth={1.5} />
                                    <span className={cn(
                                        "text-sm font-medium text-emerald-300"
                                    )}>
                                        {stat.change}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className={cn("absolute inset-0 bg-gradient-to-br opacity-45", stat.color)} />
                        <MetricSparkline points={stat.points} strokeClass={stat.stroke} />
                    </motion.div>
                ))}
            </div>

            {/* Quick Actions & Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Quick Actions */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="lg:col-span-5 rounded-3xl border border-white/8 bg-[#0b0b0c]/85 p-6"
                >
                    <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                            onClick={() => window.location.href = '/super-admin/restaurants'}
                            className="flex items-center gap-3 p-4 bg-white/5 hover:bg-white/10 rounded-2xl transition-colors text-left"
                        >
                            <div className="p-2 bg-cyan-500/15 rounded-lg">
                                <Building2 className="w-5 h-5 text-cyan-300" strokeWidth={1.5} />
                            </div>
                            <div>
                                <p className="text-white font-medium">Manage Restaurants</p>
                                <p className="text-slate-400 text-xs">View all tenants</p>
                            </div>
                        </button>
                        <button
                            onClick={() => window.location.href = '/super-admin/logs'}
                            className="flex items-center gap-3 p-4 bg-white/5 hover:bg-white/10 rounded-2xl transition-colors text-left"
                        >
                            <div className="p-2 bg-violet-500/15 rounded-lg">
                                <RefreshCw className="w-5 h-5 text-violet-300" strokeWidth={1.5} />
                            </div>
                            <div>
                                <p className="text-white font-medium">Activity Logs</p>
                                <p className="text-slate-400 text-xs">View all events</p>
                            </div>
                        </button>
                    </div>
                </motion.div>

                {/* Recent Activity */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="lg:col-span-7 rounded-3xl border border-white/8 bg-[#0b0b0c]/85 p-6"
                >
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-white">Recent Activity</h2>
                        <button
                            onClick={() => window.location.href = '/super-admin/logs'}
                            className="text-purple-400 text-sm hover:text-purple-300"
                        >
                            View all ΓåÆ
                        </button>
                    </div>

                    {recentLogs.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-slate-400">No recent activity</p>
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-[300px] overflow-y-auto">
                            {recentLogs.map((log) => (
                                <div
                                    key={log.id}
                                    className="group flex items-start gap-3 p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] transition-colors"
                                >
                                    <span className={cn("mt-1 h-2.5 w-2.5 rounded-full shadow-[0_0_16px_currentColor]", severityColors[log.severity])} />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-mono opacity-70">{log.event_type}</span>
                                        </div>
                                        <p className="text-sm mt-1 truncate">{log.message}</p>
                                        {log.restaurants?.name && (
                                            <p className="text-xs opacity-70 mt-1">{log.restaurants.name}</p>
                                        )}
                                    </div>
                                    <span className="text-xs opacity-70 whitespace-nowrap">
                                        {formatTime(log.created_at)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </motion.div>
            </div>

            {/* Revenue Breakdown */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="rounded-3xl border border-white/8 bg-[#0b0b0c]/85 p-6"
            >
                <h2 className="text-lg font-semibold text-white mb-4">Revenue by Tier</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                        { tier: 'Γé╣1,000/mo', label: 'Starter', color: 'from-slate-500 to-slate-600', key: 'starter' as const },
                        { tier: 'Γé╣2,000/mo', label: 'Pro', color: 'from-blue-500 to-cyan-600', key: 'pro' as const },
                    ].map((item) => (
                        <button
                            key={item.tier}
                            onClick={() => setSelectedTier(item.key)}
                            className="relative overflow-hidden bg-white/[0.03] rounded-2xl p-4 border border-white/10 text-left hover:bg-white/[0.08] transition-all cursor-pointer group"
                        >
                            <p className="text-slate-400 text-sm">{item.label}</p>
                            <p className="text-2xl font-semibold tracking-tight text-white mt-1">{item.tier}</p>
                            <p className="text-xs text-slate-500 mt-2 group-hover:text-slate-400 transition-colors">Click to view features ΓåÆ</p>
                            <div className={cn(
                                "absolute top-0 right-0 w-16 h-16 rounded-bl-full bg-gradient-to-br opacity-20 group-hover:opacity-30 transition-opacity",
                                item.color
                            )} />
                        </button>
                    ))}
                </div>
            </motion.div>

            {/* Tier Features Modal */}
            {selectedTier && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedTier(null)}>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-[#0c0c0d] rounded-3xl border border-white/10 p-6 max-w-md w-full backdrop-blur-2xl"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className={cn(
                                    "text-2xl font-bold",
                                    selectedTier === 'pro' ? 'text-blue-400' : 'text-white'
                                )}>
                                    {tierFeatures[selectedTier].name}
                                </h3>
                                <p className="text-slate-400 text-sm mt-1">{tierFeatures[selectedTier].description}</p>
                            </div>
                            <button
                                onClick={() => setSelectedTier(null)}
                                className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
                            >
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        <div className={cn(
                            "text-3xl font-bold mb-6 pb-4 border-b border-slate-700",
                            selectedTier === 'pro' ? 'text-blue-400' : 'text-white'
                        )}>
                            {tierFeatures[selectedTier].price}
                        </div>

                        <div className="space-y-3">
                            {tierFeatures[selectedTier].features.map((feature, idx) => (
                                <div key={idx} className="flex items-center gap-3">
                                    <div className={cn(
                                        "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0",
                                        feature.included
                                            ? selectedTier === 'pro' ? 'bg-blue-500/20' : 'bg-green-500/20'
                                            : 'bg-slate-700'
                                    )}>
                                        {feature.included ? (
                                            <Check className={cn(
                                                "w-3 h-3",
                                                selectedTier === 'pro' ? 'text-blue-400' : 'text-green-400'
                                            )} />
                                        ) : (
                                            <X className="w-3 h-3 text-slate-500" />
                                        )}
                                    </div>
                                    <span className={cn(
                                        "text-sm",
                                        feature.included ? 'text-white' : 'text-slate-500'
                                    )}>
                                        {feature.name}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}
