'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Inbox, RefreshCw, Search, XCircle } from 'lucide-react';
import {
    getDemoRequests,
    updateDemoRequestStatus,
    type DemoRequestRow,
    type DemoRequestStatus,
} from '@/lib/firebase-super-admin-actions';
import { cn } from '@/lib/utils';

const STATUS_OPTIONS: Array<{ value: 'all' | DemoRequestStatus; label: string }> = [
    { value: 'all', label: 'All Statuses' },
    { value: 'new', label: 'New' },
    { value: 'contacted', label: 'Contacted' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'converted', label: 'Converted' },
    { value: 'closed', label: 'Closed' },
];

function formatDate(value: string): string {
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

function statusClasses(status: DemoRequestStatus): string {
    if (status === 'new') return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
    if (status === 'contacted') return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    if (status === 'scheduled') return 'bg-violet-500/15 text-violet-300 border-violet-500/30';
    if (status === 'converted') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
}

export default function SuperAdminDemoRequestsPage() {
    const [rows, setRows] = useState<DemoRequestRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | DemoRequestStatus>('all');
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const loadRows = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
        if (mode === 'initial') {
            setLoading(true);
        } else {
            setRefreshing(true);
        }

        const data = await getDemoRequests({ status: statusFilter, search });
        setRows(data);

        if (mode === 'initial') {
            setLoading(false);
        } else {
            setRefreshing(false);
        }
    }, [statusFilter, search]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setSearch(searchInput.trim());
        }, 250);

        return () => clearTimeout(timer);
    }, [searchInput]);

    useEffect(() => {
        const timer = setTimeout(() => {
            void loadRows();
        }, 0);

        return () => clearTimeout(timer);
    }, [loadRows]);

    useEffect(() => {
        if (!message) return;
        const timer = setTimeout(() => setMessage(null), 3000);
        return () => clearTimeout(timer);
    }, [message]);

    const stats = useMemo(() => {
        return {
            total: rows.length,
            newCount: rows.filter((r) => r.status === 'new').length,
            scheduled: rows.filter((r) => r.status === 'scheduled').length,
            converted: rows.filter((r) => r.status === 'converted').length,
        };
    }, [rows]);

    const handleStatusChange = async (row: DemoRequestRow, nextStatus: DemoRequestStatus) => {
        if (row.status === nextStatus) return;

        setBusyId(row.id);
        const result = await updateDemoRequestStatus(row.id, nextStatus);
        if (result.success) {
            setMessage({ type: 'success', text: `Updated ${row.restaurant_name || 'request'} to ${nextStatus}` });
            await loadRows('refresh');
        } else {
            setMessage({ type: 'error', text: result.error || 'Failed to update status' });
        }
        setBusyId(null);
    };

    return (
        <div className="space-y-6 isolate text-slate-100">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight text-white">Demo Requests</h1>
                    <p className="mt-1 text-sm text-slate-400">All QR onboarding requests submitted from the website landing page.</p>
                </div>

                <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                    <div className="relative flex-1 sm:min-w-[260px] lg:min-w-[300px]">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                        <input
                            value={searchInput}
                            onChange={(event) => setSearchInput(event.target.value)}
                            placeholder="Search restaurant, contact, email, phone"
                            className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-colors focus:border-violet-400/50"
                        />
                    </div>

                    <select
                        value={statusFilter}
                        onChange={(event) => setStatusFilter(event.target.value as 'all' | DemoRequestStatus)}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-200 outline-none"
                    >
                        {STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value} className="bg-[#111111]">
                                {option.label}
                            </option>
                        ))}
                    </select>

                    <button
                        onClick={() => loadRows('refresh')}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-300 transition-all hover:border-violet-400/40 hover:bg-violet-500/10 hover:text-violet-200"
                    >
                        <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} strokeWidth={1.5} />
                        Refresh
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-3xl border border-white/8 bg-[#0b0b0c]/85 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Total Requests</p>
                    <p className="text-2xl font-semibold tracking-tight text-white">{stats.total}</p>
                </div>
                <div className="rounded-3xl border border-white/8 bg-[#0b0b0c]/85 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">New</p>
                    <p className="text-2xl font-semibold tracking-tight text-blue-300">{stats.newCount}</p>
                </div>
                <div className="rounded-3xl border border-white/8 bg-[#0b0b0c]/85 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Scheduled</p>
                    <p className="text-2xl font-semibold tracking-tight text-violet-300">{stats.scheduled}</p>
                </div>
                <div className="rounded-3xl border border-white/8 bg-[#0b0b0c]/85 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Converted</p>
                    <p className="text-2xl font-semibold tracking-tight text-emerald-300">{stats.converted}</p>
                </div>
            </div>

            <AnimatePresence>
                {message && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className={cn(
                            'flex items-center gap-2 rounded-xl border px-4 py-3 text-sm',
                            message.type === 'success'
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                        )}
                    >
                        {message.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                        {message.text}
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="rounded-3xl border border-white/8 bg-[#0b0b0c]/85 overflow-hidden">
                {loading ? (
                    <div className="flex h-56 items-center justify-center text-slate-400">Loading demo requests...</div>
                ) : rows.length === 0 ? (
                    <div className="flex h-56 flex-col items-center justify-center text-slate-400">
                        <Inbox className="mb-3 h-10 w-10 opacity-45" />
                        <p>No demo requests found</p>
                    </div>
                ) : (
                    <>
                        <div className="md:hidden space-y-3 p-3">
                            {rows.map((row) => {
                                const isBusy = busyId === row.id;
                                return (
                                    <div key={row.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3 space-y-3">
                                        <div>
                                            <p className="text-white font-medium">{row.restaurant_name || 'Unknown Restaurant'}</p>
                                            <p className="text-xs text-slate-500">{formatDate(row.created_at)}</p>
                                        </div>

                                        <div className="space-y-1 text-sm text-slate-300">
                                            <p>Contact: {row.contact_name}</p>
                                            <p className="break-all">Email: {row.business_email}</p>
                                            <p>Phone: {row.phone}</p>
                                            <p>Outlets: {row.outlet_count}</p>
                                            {row.qr_requirements && (
                                                <p className="text-xs text-slate-400 break-words">Needs: {row.qr_requirements}</p>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <span className={cn('rounded-full border px-2 py-1 text-xs font-medium uppercase tracking-wide', statusClasses(row.status))}>
                                                {row.status}
                                            </span>
                                            <select
                                                value={row.status}
                                                disabled={isBusy}
                                                onChange={(event) => handleStatusChange(row, event.target.value as DemoRequestStatus)}
                                                className="flex-1 rounded-lg border border-white/10 bg-white/8 px-2 py-1.5 text-xs text-slate-200"
                                            >
                                                {STATUS_OPTIONS.filter((option) => option.value !== 'all').map((option) => (
                                                    <option key={option.value} value={option.value} className="bg-[#111111]">
                                                        {option.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full min-w-[1080px]">
                                <thead>
                                    <tr className="border-b border-white/8">
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Restaurant</th>
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Contact</th>
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Outlets</th>
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">QR Requirements</th>
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Requested At</th>
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row) => {
                                        const isBusy = busyId === row.id;
                                        return (
                                            <tr key={row.id} className="border-b border-white/6 align-top hover:bg-white/[0.05] transition-colors">
                                                <td className="px-4 py-3">
                                                    <p className="font-medium text-white">{row.restaurant_name || 'Unknown Restaurant'}</p>
                                                    <p className="text-xs text-slate-500">{row.source}</p>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-slate-300">
                                                    <p>{row.contact_name}</p>
                                                    <p className="break-all text-xs text-slate-400">{row.business_email}</p>
                                                    <p className="text-xs text-slate-400">{row.phone}</p>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-slate-300">{row.outlet_count}</td>
                                                <td className="px-4 py-3 text-xs text-slate-300 max-w-[320px] break-words">{row.qr_requirements || 'No additional notes'}</td>
                                                <td className="px-4 py-3 text-sm text-slate-300 whitespace-nowrap">{formatDate(row.created_at)}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className={cn('rounded-full border px-2 py-1 text-xs font-medium uppercase tracking-wide', statusClasses(row.status))}>
                                                            {row.status}
                                                        </span>
                                                        <select
                                                            value={row.status}
                                                            disabled={isBusy}
                                                            onChange={(event) => handleStatusChange(row, event.target.value as DemoRequestStatus)}
                                                            className="rounded-lg border border-white/10 bg-white/8 px-2 py-1.5 text-xs text-slate-200"
                                                        >
                                                            {STATUS_OPTIONS.filter((option) => option.value !== 'all').map((option) => (
                                                                <option key={option.value} value={option.value} className="bg-[#111111]">
                                                                    {option.label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
