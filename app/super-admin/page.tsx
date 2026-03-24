'use client';

/**
 * Super Admin Overview Dashboard
 * Shows high-level platform statistics
 */

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
    DollarSign, Building2, ShoppingBag, UserPlus,
    TrendingUp, TrendingDown, RefreshCw, X, Check
} from 'lucide-react';
import { getPlatformStats, getGlobalLogs, type PlatformStats, type GlobalLog } from '@/lib/firebase-super-admin-actions';
import { cn } from '@/lib/utils';

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
    info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    error: 'bg-red-500/20 text-red-400 border-red-500/30',
    success: 'bg-green-500/20 text-green-400 border-green-500/30',
};

export default function SuperAdminOverview() {
    const [stats, setStats] = useState<PlatformStats | null>(null);
    const [recentLogs, setRecentLogs] = useState<GlobalLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedTier, setSelectedTier] = useState<'starter' | 'pro' | null>(null);

    const tierFeatures = {
        starter: {
            name: 'Starter',
            price: '₹1,000/mo',
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
            price: '₹2,000/mo',
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
            <div className="flex items-center justify-center h-[60vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
                    <p className="text-slate-400">Loading platform data...</p>
                </div>
            </div>
        );
    }

    const statCards = [
        {
            label: 'Monthly Revenue (MRR)',
            value: formatCurrency(stats?.total_revenue || 0),
            icon: DollarSign,
            color: 'from-green-500 to-emerald-600',
            bgColor: 'bg-green-500/10',
            change: '+12%',
            changeUp: true,
        },
        {
            label: 'Total Restaurants',
            value: stats?.total_restaurants || 0,
            icon: Building2,
            color: 'from-blue-500 to-cyan-600',
            bgColor: 'bg-blue-500/10',
            change: '+3',
            changeUp: true,
        },
        {
            label: 'Active Orders',
            value: stats?.active_orders || 0,
            icon: ShoppingBag,
            color: 'from-orange-500 to-red-600',
            bgColor: 'bg-orange-500/10',
            change: 'Live',
            changeUp: true,
        },
        {
            label: 'New Signups (30d)',
            value: stats?.new_signups_30d || 0,
            icon: UserPlus,
            color: 'from-purple-500 to-pink-600',
            bgColor: 'bg-purple-500/10',
            change: '+8%',
            changeUp: true,
        },
    ];

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-white">Platform Overview</h1>
                    <p className="text-slate-400 mt-1">Monitor your entire NexResto network</p>
                </div>
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                    <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
                    Refresh
                </motion.button>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map((stat, index) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="relative overflow-hidden bg-slate-800 rounded-2xl border border-slate-700 p-6"
                    >
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-slate-400 text-sm">{stat.label}</p>
                                <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
                                <div className="flex items-center gap-1 mt-2">
                                    {stat.changeUp ? (
                                        <TrendingUp className="w-4 h-4 text-green-400" />
                                    ) : (
                                        <TrendingDown className="w-4 h-4 text-red-400" />
                                    )}
                                    <span className={cn(
                                        "text-sm font-medium",
                                        stat.changeUp ? "text-green-400" : "text-red-400"
                                    )}>
                                        {stat.change}
                                    </span>
                                </div>
                            </div>
                            <div className={cn("p-3 rounded-xl", stat.bgColor)}>
                                <stat.icon className={cn("w-6 h-6 bg-gradient-to-br bg-clip-text", stat.color)} style={{ color: 'currentColor' }} />
                            </div>
                        </div>
                        {/* Gradient accent */}
                        <div className={cn(
                            "absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r",
                            stat.color
                        )} />
                    </motion.div>
                ))}
            </div>

            {/* Quick Actions & Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Quick Actions */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="bg-slate-800 rounded-2xl border border-slate-700 p-6"
                >
                    <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                            onClick={() => window.location.href = '/super-admin/restaurants'}
                            className="flex items-center gap-3 p-4 bg-slate-700/50 hover:bg-slate-700 rounded-xl transition-colors text-left"
                        >
                            <div className="p-2 bg-blue-500/20 rounded-lg">
                                <Building2 className="w-5 h-5 text-blue-400" />
                            </div>
                            <div>
                                <p className="text-white font-medium">Manage Restaurants</p>
                                <p className="text-slate-400 text-xs">View all tenants</p>
                            </div>
                        </button>
                        <button
                            onClick={() => window.location.href = '/super-admin/logs'}
                            className="flex items-center gap-3 p-4 bg-slate-700/50 hover:bg-slate-700 rounded-xl transition-colors text-left"
                        >
                            <div className="p-2 bg-purple-500/20 rounded-lg">
                                <RefreshCw className="w-5 h-5 text-purple-400" />
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
                    className="bg-slate-800 rounded-2xl border border-slate-700 p-6"
                >
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-white">Recent Activity</h2>
                        <button
                            onClick={() => window.location.href = '/super-admin/logs'}
                            className="text-purple-400 text-sm hover:text-purple-300"
                        >
                            View all →
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
                                    className={cn(
                                        "flex items-start gap-3 p-3 rounded-lg border",
                                        severityColors[log.severity]
                                    )}
                                >
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
                className="bg-slate-800 rounded-2xl border border-slate-700 p-6"
            >
                <h2 className="text-lg font-semibold text-white mb-4">Revenue by Tier</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                        { tier: '₹1,000/mo', label: 'Starter', color: 'from-slate-500 to-slate-600', key: 'starter' as const },
                        { tier: '₹2,000/mo', label: 'Pro', color: 'from-blue-500 to-cyan-600', key: 'pro' as const },
                    ].map((item) => (
                        <button
                            key={item.tier}
                            onClick={() => setSelectedTier(item.key)}
                            className="relative overflow-hidden bg-slate-700/30 rounded-xl p-4 border border-slate-600/50 text-left hover:bg-slate-700/50 hover:border-slate-500 transition-all cursor-pointer group"
                        >
                            <p className="text-slate-400 text-sm">{item.label}</p>
                            <p className="text-xl font-bold text-white mt-1">{item.tier}</p>
                            <p className="text-xs text-slate-500 mt-2 group-hover:text-slate-400 transition-colors">Click to view features →</p>
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
                        className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-md w-full"
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
