'use client';

/**
 * Super Admin - Activity Logs
 * Live feed of significant platform events
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    ScrollText, RefreshCw, Filter, Clock,
    Info, AlertTriangle, XCircle, CheckCircle,
    Building2, User, ChevronDown
} from 'lucide-react';
import { getGlobalLogs, type GlobalLog } from '@/lib/firebase-super-admin-actions';
import { cn } from '@/lib/utils';

const EVENT_TYPES = [
    { value: '', label: 'All Events' },
    { value: 'SIGNUP', label: 'Signups' },
    { value: 'SUBSCRIPTION_CHANGE', label: 'Subscription Changes' },
    { value: 'STATUS_CHANGE', label: 'Status Changes' },
    { value: 'PASSWORD_RESET', label: 'Password Resets' },
    { value: 'IMPERSONATION', label: 'Impersonations' },
    { value: 'RESTAURANT_DELETED', label: 'Deletions' },
];

const severityIcons = {
    info: Info,
    warning: AlertTriangle,
    error: XCircle,
    success: CheckCircle,
};

const severityColors = {
    info: {
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/30',
        text: 'text-blue-400',
        icon: 'text-blue-400',
    },
    warning: {
        bg: 'bg-yellow-500/10',
        border: 'border-yellow-500/30',
        text: 'text-yellow-400',
        icon: 'text-yellow-400',
    },
    error: {
        bg: 'bg-red-500/10',
        border: 'border-red-500/30',
        text: 'text-red-400',
        icon: 'text-red-400',
    },
    success: {
        bg: 'bg-green-500/10',
        border: 'border-green-500/30',
        text: 'text-green-400',
        icon: 'text-green-400',
    },
};

const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays < 7) return `${diffDays} days ago`;
    return formatTime(dateString);
};

export default function ActivityLogs() {
    const [logs, setLogs] = useState<GlobalLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [eventFilter, setEventFilter] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [expandedLog, setExpandedLog] = useState<string | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(true);

    const loadLogs = useCallback(async () => {
        try {
            const data = await getGlobalLogs(100, 0, eventFilter || undefined);
            setLogs(data);
        } catch (error) {
            console.error('Error loading logs:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [eventFilter]);

    useEffect(() => {
        loadLogs();
    }, [loadLogs]);

    // Auto-refresh every 10 seconds
    useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(loadLogs, 10000);
        return () => clearInterval(interval);
    }, [autoRefresh, loadLogs]);

    const handleRefresh = () => {
        setRefreshing(true);
        loadLogs();
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
                    <p className="text-slate-400">Loading activity logs...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Activity Logs</h1>
                    <p className="text-slate-400 mt-1">Real-time platform events and activities</p>
                </div>

                <div className="flex items-center gap-3">
                    {/* Auto-refresh toggle */}
                    <button
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors",
                            autoRefresh
                                ? "bg-green-500/20 border-green-500/30 text-green-400"
                                : "bg-slate-700 border-slate-600 text-slate-400"
                        )}
                    >
                        <div className={cn(
                            "w-2 h-2 rounded-full",
                            autoRefresh ? "bg-green-400 animate-pulse" : "bg-slate-500"
                        )} />
                        <span className="text-sm">Live</span>
                    </button>

                    {/* Filter button */}
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors",
                            eventFilter
                                ? "bg-purple-500/20 border-purple-500/30 text-purple-400"
                                : "bg-slate-700 border-slate-600 text-slate-400 hover:bg-slate-600"
                        )}
                    >
                        <Filter className="w-4 h-4" />
                        <span className="text-sm">Filter</span>
                    </button>

                    {/* Refresh button */}
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
            </div>

            {/* Filter Panel */}
            <AnimatePresence>
                {showFilters && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
                            <p className="text-slate-400 text-sm mb-3">Filter by event type:</p>
                            <div className="flex flex-wrap gap-2">
                                {EVENT_TYPES.map((type) => (
                                    <button
                                        key={type.value}
                                        onClick={() => setEventFilter(type.value)}
                                        className={cn(
                                            "px-3 py-1.5 rounded-lg text-sm transition-colors",
                                            eventFilter === type.value
                                                ? "bg-purple-600 text-white"
                                                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                                        )}
                                    >
                                        {type.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Logs List */}
            <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
                {logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                        <ScrollText className="w-12 h-12 mb-4 opacity-50" />
                        <p>No activity logs found</p>
                        {eventFilter && (
                            <button
                                onClick={() => setEventFilter('')}
                                className="mt-2 text-purple-400 hover:text-purple-300 text-sm"
                            >
                                Clear filter
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="divide-y divide-slate-700/50">
                        {logs.map((log, index) => {
                            const SeverityIcon = severityIcons[log.severity];
                            const colors = severityColors[log.severity];
                            const isExpanded = expandedLog === log.id;

                            return (
                                <motion.div
                                    key={log.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.02 }}
                                    className="hover:bg-slate-700/30 transition-colors"
                                >
                                    <button
                                        onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                                        className="w-full flex items-start gap-4 p-4 text-left"
                                    >
                                        {/* Severity Icon */}
                                        <div className={cn("p-2 rounded-lg flex-shrink-0", colors.bg)}>
                                            <SeverityIcon className={cn("w-4 h-4", colors.icon)} />
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={cn(
                                                    "px-2 py-0.5 rounded text-xs font-mono",
                                                    colors.bg, colors.text, colors.border, "border"
                                                )}>
                                                    {log.event_type}
                                                </span>
                                                {log.restaurants?.name && (
                                                    <span className="flex items-center gap-1 text-slate-400 text-xs">
                                                        <Building2 className="w-3 h-3" />
                                                        {log.restaurants.name}
                                                    </span>
                                                )}
                                            </div>
                                            <p className={cn("text-sm", colors.text)}>{log.message}</p>
                                        </div>

                                        {/* Time & Expand */}
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            <span className="text-slate-400 text-xs whitespace-nowrap">
                                                {getRelativeTime(log.created_at)}
                                            </span>
                                            <motion.div
                                                animate={{ rotate: isExpanded ? 180 : 0 }}
                                                transition={{ duration: 0.2 }}
                                            >
                                                <ChevronDown className="w-4 h-4 text-slate-400" />
                                            </motion.div>
                                        </div>
                                    </button>

                                    {/* Expanded Details */}
                                    <AnimatePresence>
                                        {isExpanded && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="px-4 pb-4 pl-[68px]">
                                                    <div className="bg-slate-900/50 rounded-lg p-4 space-y-3">
                                                        <div className="flex items-center gap-4 text-sm">
                                                            <span className="text-slate-400">
                                                                <Clock className="w-3 h-3 inline mr-1" />
                                                                {formatTime(log.created_at)}
                                                            </span>
                                                            {log.tenant_id && (
                                                                <span className="text-slate-400">
                                                                    <Building2 className="w-3 h-3 inline mr-1" />
                                                                    {log.tenant_id}
                                                                </span>
                                                            )}
                                                            {log.user_id && (
                                                                <span className="text-slate-400">
                                                                    <User className="w-3 h-3 inline mr-1" />
                                                                    {log.user_id.slice(0, 8)}...
                                                                </span>
                                                            )}
                                                        </div>

                                                        {Object.keys(log.metadata).length > 0 && (
                                                            <div>
                                                                <p className="text-slate-400 text-xs mb-2">Metadata:</p>
                                                                <pre className="text-xs text-slate-300 bg-slate-950 rounded p-3 overflow-x-auto">
                                                                    {JSON.stringify(log.metadata, null, 2)}
                                                                </pre>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Stats Footer */}
            <div className="flex items-center justify-between text-sm text-slate-400">
                <p>Showing {logs.length} events</p>
                <p className="flex items-center gap-2">
                    {autoRefresh && (
                        <>
                            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                            Auto-refreshing every 10 seconds
                        </>
                    )}
                </p>
            </div>
        </div>
    );
}
