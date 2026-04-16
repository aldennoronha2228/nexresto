'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
    AlertTriangle,
    CalendarClock,
    CreditCard,
    RefreshCw,
    Search,
    WalletCards,
} from 'lucide-react';
import {
    getPaymentOverviewRows,
    type PaymentOverviewRow,
} from '@/lib/firebase-super-admin-actions';
import { cn } from '@/lib/utils';

function formatCurrency(amount: number | null): string {
    if (amount == null || Number.isNaN(amount)) return 'NA';
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}

function formatDate(dateYmd: string | null): string {
    if (!dateYmd) return 'NA';
    const date = new Date(`${dateYmd}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return 'NA';
    return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function formatDateTime(iso: string | null): string {
    if (!iso) return 'No payment yet';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'No payment yet';
    return date.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function planLabel(plan: string | null, tier: PaymentOverviewRow['subscription_tier']): string {
    if (plan) return plan;
    if (tier === '2.5k') return 'Pro Chain';
    if (tier === '2k' || tier === 'pro') return 'Growth';
    return 'Starter';
}

function renewalBadgeClass(state: PaymentOverviewRow['renewal_state']): string {
    if (state === 'expired') return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
    if (state === 'expiring_soon') return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    if (state === 'active') return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
}

function statusBadgeClass(status: PaymentOverviewRow['subscription_status']): string {
    if (status === 'active') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    if (status === 'trial') return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
    if (status === 'past_due') return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    if (status === 'cancelled') return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
    return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
}

export default function SuperAdminPaymentsPage() {
    const [rows, setRows] = useState<PaymentOverviewRow[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        setLoadError(null);
        try {
            const result = await getPaymentOverviewRows();
            setRows(result);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to load payments overview';
            setLoadError(message);
            setRows([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const filteredRows = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return rows;

        return rows.filter((row) => {
            const haystack = [
                row.name,
                row.id,
                row.owner_email || '',
                row.last_payment_provider || '',
                row.last_payment_id || '',
                row.last_payment_plan || '',
                row.subscription_tier,
                row.subscription_status,
            ]
                .join(' ')
                .toLowerCase();

            return haystack.includes(query);
        });
    }, [rows, search]);

    const summary = useMemo(() => {
        return filteredRows.reduce(
            (acc, row) => {
                if (row.last_payment_amount_inr != null) {
                    acc.totalCollected += row.last_payment_amount_inr;
                    acc.paidCount += 1;
                }
                if (row.renewal_state === 'expired') acc.expired += 1;
                if (row.renewal_state === 'expiring_soon') acc.expiringSoon += 1;
                return acc;
            },
            {
                totalCollected: 0,
                paidCount: 0,
                expired: 0,
                expiringSoon: 0,
            }
        );
    }, [filteredRows]);

    const handleRefresh = async () => {
        setRefreshing(true);
        await loadData();
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-violet-500/20 border-t-violet-400 rounded-full animate-spin" />
                    <p className="text-slate-400">Loading payment overview...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 isolate text-slate-100">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight text-white">Payments and Renewals</h1>
                    <p className="text-slate-400 mt-1">Track latest subscription payments and upcoming renewals across all restaurants</p>
                </div>
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:text-violet-200 hover:border-violet-400/40 hover:bg-violet-500/10 transition-all disabled:opacity-50"
                >
                    <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} strokeWidth={1.5} />
                    Refresh
                </motion.button>
            </div>

            {loadError && (
                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                    Failed to load data: {loadError}
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="rounded-3xl border border-white/8 bg-[#0b0b0c]/85 px-4 py-3">
                    <p className="text-slate-400 text-[11px] uppercase tracking-[0.18em]">Restaurants</p>
                    <p className="text-white text-2xl font-semibold tracking-tight mt-1 flex items-center gap-2">
                        <WalletCards className="w-4 h-4 text-cyan-300" strokeWidth={1.5} />
                        {filteredRows.length}
                    </p>
                </div>
                <div className="rounded-3xl border border-white/8 bg-[#0b0b0c]/85 px-4 py-3">
                    <p className="text-slate-400 text-[11px] uppercase tracking-[0.18em]">Latest Payments Total</p>
                    <p className="text-white text-2xl font-semibold tracking-tight mt-1 flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-violet-300" strokeWidth={1.5} />
                        {formatCurrency(summary.totalCollected)}
                    </p>
                </div>
                <div className="rounded-3xl border border-white/8 bg-[#0b0b0c]/85 px-4 py-3">
                    <p className="text-slate-400 text-[11px] uppercase tracking-[0.18em]">Expiring in 7 days</p>
                    <p className="text-white text-2xl font-semibold tracking-tight mt-1 flex items-center gap-2">
                        <CalendarClock className="w-4 h-4 text-amber-300" strokeWidth={1.5} />
                        {summary.expiringSoon}
                    </p>
                </div>
                <div className="rounded-3xl border border-white/8 bg-[#0b0b0c]/85 px-4 py-3">
                    <p className="text-slate-400 text-[11px] uppercase tracking-[0.18em]">Expired</p>
                    <p className="text-white text-2xl font-semibold tracking-tight mt-1 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-300" strokeWidth={1.5} />
                        {summary.expired}
                    </p>
                </div>
            </div>

            <div className="rounded-3xl border border-white/8 bg-[#0b0b0c]/85 p-4">
                <div className="relative">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.5} />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by restaurant, owner email, payment id, provider, plan..."
                        className="w-full bg-black/35 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                    />
                </div>
            </div>

            <div className="rounded-3xl border border-white/8 bg-[#0b0b0c]/85 overflow-x-auto">
                {filteredRows.length === 0 ? (
                    <div className="h-56 flex items-center justify-center text-slate-400">
                        No payment records found for this filter.
                    </div>
                ) : (
                    <table className="w-full min-w-[1240px]">
                        <thead>
                            <tr className="border-b border-white/8">
                                <th className="text-left px-6 py-4 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">Restaurant</th>
                                <th className="text-left px-6 py-4 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">Subscription</th>
                                <th className="text-left px-6 py-4 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">Last Payment</th>
                                <th className="text-left px-6 py-4 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">Renewal</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRows.map((row) => (
                                <tr key={row.id} className="border-b border-white/6 hover:bg-white/[0.05] transition-colors align-top">
                                    <td className="px-6 py-4">
                                        <p className="text-white font-medium">{row.name}</p>
                                        <p className="text-slate-500 text-xs mt-1">{row.id}</p>
                                        <p className="text-slate-400 text-xs mt-1">{row.owner_email || 'Owner email not set'}</p>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="px-2 py-0.5 rounded-full text-[10px] border bg-slate-500/15 text-slate-200 border-slate-400/20 uppercase">
                                                {row.subscription_tier}
                                            </span>
                                            <span className={cn('px-2 py-0.5 rounded-full text-[10px] border uppercase', statusBadgeClass(row.subscription_status))}>
                                                {row.subscription_status}
                                            </span>
                                        </div>
                                        <p className="text-slate-400 text-xs mt-2">Plan: {planLabel(row.last_payment_plan, row.subscription_tier)}</p>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="text-white font-medium">{formatCurrency(row.last_payment_amount_inr)}</p>
                                        <p className="text-slate-400 text-xs mt-1">{formatDateTime(row.last_payment_at)}</p>
                                        <p className="text-slate-500 text-xs mt-1">{row.last_payment_provider || 'Provider NA'}</p>
                                        <p className="text-slate-500 text-xs mt-1 break-all">{row.last_payment_id || 'Payment ID NA'}</p>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="text-slate-300 text-sm">Ends: {formatDate(row.subscription_end_date)}</p>
                                        <p className="text-slate-500 text-xs mt-1">
                                            {row.days_remaining == null
                                                ? 'Days remaining NA'
                                                : row.days_remaining < 0
                                                    ? `${Math.abs(row.days_remaining)} day(s) overdue`
                                                    : `${row.days_remaining} day(s) remaining`}
                                        </p>
                                        <span className={cn('inline-flex mt-2 px-2 py-0.5 rounded-full text-[10px] border uppercase', renewalBadgeClass(row.renewal_state))}>
                                            {row.renewal_state.replace('_', ' ')}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <p className="text-xs text-slate-500">Note: This view tracks each restaurant&apos;s latest recorded payment snapshot and current renewal timeline.</p>
        </div>
    );
}
