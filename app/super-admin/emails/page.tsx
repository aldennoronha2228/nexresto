'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    Mail,
    Send,
    RefreshCw,
    CheckCircle2,
    XCircle,
    Clock3,
    Ban,
} from 'lucide-react';
import {
    getSubscriptionReminderEmailRows,
    sendManualSubscriptionReminderEmail,
    setRestaurantReminderEmailsEnabled,
    type SubscriptionReminderEmailRow,
} from '@/lib/firebase-super-admin-actions';
import { cn } from '@/lib/utils';

function formatDate(value: string | null): string {
    if (!value) return 'Not set';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value;
    return dt.toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function SuperAdminEmailsPage() {
    const [rows, setRows] = useState<SubscriptionReminderEmailRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const loadRows = useCallback(async () => {
        setLoading(true);
        const data = await getSubscriptionReminderEmailRows();
        setRows(data);
        setLoading(false);
    }, []);

    useEffect(() => {
        loadRows();
    }, [loadRows]);

    useEffect(() => {
        if (!message) return;
        const timer = setTimeout(() => setMessage(null), 3000);
        return () => clearTimeout(timer);
    }, [message]);

    const stats = useMemo(() => {
        const enabled = rows.filter((r) => r.reminders_enabled).length;
        const dueToday = rows.filter((r) => r.days_remaining !== null && r.days_remaining >= 0 && r.days_remaining <= 2).length;
        const sentToday = rows.filter((r) => r.last_reminder_sent_on === new Date().toISOString().slice(0, 10)).length;
        const failed = rows.filter((r) => Boolean(r.last_reminder_error)).length;
        return { enabled, dueToday, sentToday, failed };
    }, [rows]);

    const handleToggle = async (row: SubscriptionReminderEmailRow) => {
        setBusyId(row.id);
        const nextEnabled = !row.reminders_enabled;
        const result = await setRestaurantReminderEmailsEnabled(row.id, nextEnabled);
        if (result.success) {
            setMessage({
                type: 'success',
                text: nextEnabled ? 'Reminder emails enabled' : 'Reminder emails disabled',
            });
            await loadRows();
        } else {
            setMessage({ type: 'error', text: result.error || 'Failed to update setting' });
        }
        setBusyId(null);
    };

    const handleManualSend = async (row: SubscriptionReminderEmailRow) => {
        setBusyId(row.id);
        const result = await sendManualSubscriptionReminderEmail(row.id);
        if (result.success) {
            setMessage({ type: 'success', text: `Reminder sent for ${row.name}` });
            await loadRows();
        } else {
            setMessage({ type: 'error', text: result.error || 'Failed to send reminder' });
        }
        setBusyId(null);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-white">Email Center</h1>
                    <p className="text-slate-400 text-sm mt-1">Track subscription reminder emails and send manually when needed.</p>
                </div>
                <button
                    onClick={loadRows}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                >
                    <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
                    Refresh
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-slate-800/80 rounded-xl border border-slate-700 px-4 py-3">
                    <p className="text-slate-400 text-xs">Reminders Enabled</p>
                    <p className="text-white text-xl font-semibold">{stats.enabled}</p>
                </div>
                <div className="bg-slate-800/80 rounded-xl border border-slate-700 px-4 py-3">
                    <p className="text-slate-400 text-xs">In Reminder Window</p>
                    <p className="text-amber-300 text-xl font-semibold">{stats.dueToday}</p>
                </div>
                <div className="bg-slate-800/80 rounded-xl border border-slate-700 px-4 py-3">
                    <p className="text-slate-400 text-xs">Sent Today</p>
                    <p className="text-emerald-300 text-xl font-semibold">{stats.sentToday}</p>
                </div>
                <div className="bg-slate-800/80 rounded-xl border border-slate-700 px-4 py-3">
                    <p className="text-slate-400 text-xs">With Last Error</p>
                    <p className="text-rose-300 text-xl font-semibold">{stats.failed}</p>
                </div>
            </div>

            <AnimatePresence>
                {message && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className={cn(
                            'rounded-xl px-4 py-3 border text-sm flex items-center gap-2',
                            message.type === 'success'
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                        )}
                    >
                        {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        {message.text}
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
                {loading ? (
                    <div className="h-56 flex items-center justify-center text-slate-400">Loading email tracker...</div>
                ) : rows.length === 0 ? (
                    <div className="h-56 flex items-center justify-center text-slate-400">No restaurants found</div>
                ) : (
                    <div>
                        <div className="md:hidden space-y-3 p-3">
                            {rows.map((row) => {
                                const isBusy = busyId === row.id;
                                const inReminderWindow = row.days_remaining !== null && row.days_remaining >= 0 && row.days_remaining <= 2;
                                const hasEndDate = Boolean(row.subscription_end_date);
                                const todayYmd = new Date().toISOString().slice(0, 10);
                                const alreadySentToday = row.last_reminder_sent_on === todayYmd;
                                const canManualSend = hasEndDate && row.reminders_enabled && !row.account_temporarily_disabled && !alreadySentToday;

                                return (
                                    <div key={row.id} className="rounded-xl border border-slate-700 bg-slate-900/50 p-3 space-y-3">
                                        <div>
                                            <p className="text-white font-medium">{row.name}</p>
                                            <p className="text-xs text-slate-500 break-all">{row.id}</p>
                                        </div>

                                        <div className="text-sm text-slate-300 space-y-1">
                                            <p className="break-all">Owner: {row.owner_email || 'Not found'}</p>
                                            <p>End Date: {row.subscription_end_date || 'Not set'}</p>
                                            {row.days_remaining !== null && (
                                                <p className={cn('text-xs', inReminderWindow ? 'text-amber-300' : 'text-slate-500')}>
                                                    {row.days_remaining} days remaining
                                                </p>
                                            )}
                                            <p className="text-xs">Last Sent: {row.last_reminder_sent_at ? formatDate(row.last_reminder_sent_at) : 'Never'}</p>
                                            <p className="text-xs break-all">Provider ID: {row.last_reminder_provider_id || 'N/A'}</p>
                                            <p className="text-xs">Source: {row.last_reminder_source || 'N/A'}</p>
                                            {row.last_reminder_error && (
                                                <p className="text-xs text-rose-300 break-words">Error: {row.last_reminder_error}</p>
                                            )}
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            <span className={cn(
                                                'inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border',
                                                row.reminders_enabled
                                                    ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
                                                    : 'text-rose-300 border-rose-500/30 bg-rose-500/10'
                                            )}>
                                                <Mail className="w-3.5 h-3.5" />
                                                {row.reminders_enabled ? 'Enabled' : 'Disabled'}
                                            </span>
                                            {row.account_temporarily_disabled && (
                                                <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border text-amber-300 border-amber-500/30 bg-amber-500/10">
                                                    <Ban className="w-3.5 h-3.5" />
                                                    Account Disabled
                                                </span>
                                            )}
                                            {inReminderWindow && (
                                                <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border text-blue-300 border-blue-500/30 bg-blue-500/10">
                                                    <Clock3 className="w-3.5 h-3.5" />
                                                    Reminder Window
                                                </span>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                disabled={isBusy}
                                                onClick={() => handleToggle(row)}
                                                className={cn(
                                                    'px-3 py-2 rounded-lg text-xs transition-colors',
                                                    row.reminders_enabled
                                                        ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                                                        : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30',
                                                    isBusy && 'opacity-50 cursor-not-allowed'
                                                )}
                                            >
                                                {row.reminders_enabled ? 'Disable' : 'Enable'}
                                            </button>
                                            <button
                                                disabled={!canManualSend || isBusy}
                                                onClick={() => handleManualSend(row)}
                                                className={cn(
                                                    'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-colors',
                                                    canManualSend
                                                        ? 'bg-purple-600 text-white hover:bg-purple-700'
                                                        : 'bg-slate-700 text-slate-500 cursor-not-allowed',
                                                    isBusy && 'opacity-50'
                                                )}
                                            >
                                                <Send className="w-3.5 h-3.5" />
                                                Send Now
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="hidden md:block overflow-x-auto">
                        <table className="w-full table-fixed min-w-[1120px]">
                            <thead>
                                <tr className="border-b border-slate-700">
                                    <th className="text-left px-3 py-3 text-slate-400 text-xs font-semibold w-[14%]">Restaurant</th>
                                    <th className="text-left px-3 py-3 text-slate-400 text-xs font-semibold w-[18%]">Owner Email</th>
                                    <th className="text-left px-3 py-3 text-slate-400 text-xs font-semibold w-[12%]">End Date</th>
                                    <th className="text-left px-3 py-3 text-slate-400 text-xs font-semibold w-[14%]">Status</th>
                                    <th className="text-left px-3 py-3 text-slate-400 text-xs font-semibold w-[10%]">Last Sent</th>
                                    <th className="text-left px-3 py-3 text-slate-400 text-xs font-semibold w-[16%]">Delivery</th>
                                    <th className="text-left px-3 py-3 text-slate-400 text-xs font-semibold w-[8%]">Error</th>
                                    <th className="text-right px-3 py-3 text-slate-400 text-xs font-semibold w-[8%]">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => {
                                    const isBusy = busyId === row.id;
                                    const inReminderWindow = row.days_remaining !== null && row.days_remaining >= 0 && row.days_remaining <= 2;
                                    const hasEndDate = Boolean(row.subscription_end_date);
                                    const todayYmd = new Date().toISOString().slice(0, 10);
                                    const alreadySentToday = row.last_reminder_sent_on === todayYmd;
                                    const canManualSend = hasEndDate && row.reminders_enabled && !row.account_temporarily_disabled && !alreadySentToday;

                                    return (
                                        <tr key={row.id} className="border-b border-slate-700/60">
                                            <td className="px-3 py-3 align-top">
                                                <p className="text-white font-medium">{row.name}</p>
                                                <p className="text-slate-500 text-xs">{row.id}</p>
                                            </td>
                                            <td className="px-3 py-3 text-slate-300 text-sm break-all align-top">{row.owner_email || 'Not found'}</td>
                                            <td className="px-3 py-3 text-slate-300 text-sm align-top">
                                                <div className="flex flex-col">
                                                    <span>{row.subscription_end_date || 'Not set'}</span>
                                                    {row.days_remaining !== null && (
                                                        <span className={cn(
                                                            'text-xs',
                                                            inReminderWindow ? 'text-amber-300' : 'text-slate-500'
                                                        )}>
                                                            {row.days_remaining} days remaining
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 align-top">
                                                <div className="flex flex-wrap gap-2">
                                                    <span className={cn(
                                                        'inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border',
                                                        row.reminders_enabled
                                                            ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
                                                            : 'text-rose-300 border-rose-500/30 bg-rose-500/10'
                                                    )}>
                                                        <Mail className="w-3.5 h-3.5" />
                                                        {row.reminders_enabled ? 'Enabled' : 'Disabled'}
                                                    </span>
                                                    {row.account_temporarily_disabled && (
                                                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border text-amber-300 border-amber-500/30 bg-amber-500/10">
                                                            <Ban className="w-3.5 h-3.5" />
                                                            Account Disabled
                                                        </span>
                                                    )}
                                                    {inReminderWindow && (
                                                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border text-blue-300 border-blue-500/30 bg-blue-500/10">
                                                            <Clock3 className="w-3.5 h-3.5" />
                                                            Reminder Window
                                                        </span>
                                                    )}
                                                    {alreadySentToday && (
                                                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border text-emerald-300 border-emerald-500/30 bg-emerald-500/10">
                                                            Sent Today
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 text-slate-300 text-sm align-top">
                                                {row.last_reminder_sent_at ? formatDate(row.last_reminder_sent_at) : 'Never'}
                                            </td>
                                            <td className="px-3 py-3 text-xs text-slate-300 align-top">
                                                <div className="space-y-0.5">
                                                    <p className="break-all">To: {row.last_reminder_to || 'N/A'}</p>
                                                    <p className="break-all">ID: {row.last_reminder_provider_id || 'N/A'}</p>
                                                    <p>Source: {row.last_reminder_source || 'N/A'}</p>
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 text-xs text-rose-300 align-top break-words" title={row.last_reminder_error || ''}>
                                                {row.last_reminder_error || 'None'}
                                            </td>
                                            <td className="px-3 py-3 align-top">
                                                <div className="flex flex-col items-end gap-2">
                                                    <button
                                                        disabled={isBusy}
                                                        onClick={() => handleToggle(row)}
                                                        className={cn(
                                                            'px-3 py-1.5 rounded-lg text-xs transition-colors',
                                                            row.reminders_enabled
                                                                ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                                                                : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30',
                                                            isBusy && 'opacity-50 cursor-not-allowed'
                                                        )}
                                                    >
                                                        {row.reminders_enabled ? 'Disable' : 'Enable'}
                                                    </button>
                                                    <button
                                                        disabled={!canManualSend || isBusy}
                                                        onClick={() => handleManualSend(row)}
                                                        className={cn(
                                                            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors',
                                                            canManualSend
                                                                ? 'bg-purple-600 text-white hover:bg-purple-700'
                                                                : 'bg-slate-700 text-slate-500 cursor-not-allowed',
                                                            isBusy && 'opacity-50'
                                                        )}
                                                    >
                                                        <Send className="w-3.5 h-3.5" />
                                                        Send Now
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
