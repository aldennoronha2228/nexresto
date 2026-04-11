'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { CalendarDays, Phone, RefreshCw, Users, Wallet } from 'lucide-react';
import { RoleGuard } from '@/components/dashboard/RoleGuard';
import { useRestaurant } from '@/hooks/useRestaurant';
import { adminAuth, tenantAuth } from '@/lib/firebase';

type CustomerRow = {
    id: string;
    name: string;
    phone: string;
    tableNumber: string;
    visitCount: number;
    totalSpend: number;
    lastVisited: Date | null;
};

function isSameLocalDate(date: Date, dateValue: string): boolean {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}` === dateValue;
}

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(value || 0);
}

function formatPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 10) return phone;
    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
}

function toDateValue(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export default function DashboardCustomersPage() {
    const { storeId: tenantId } = useRestaurant();
    const [selectedDate, setSelectedDate] = useState<string>(() => toDateValue(new Date()));
    const [rows, setRows] = useState<CustomerRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        if (!tenantId) {
            setRows([]);
            setLoading(false);
            return;
        }

        let active = true;

        const loadCustomers = async () => {
            try {
                if (active) {
                    setLoading(true);
                    setError(null);
                }

                const user = adminAuth.currentUser || tenantAuth.currentUser;
                if (!user) throw new Error('Missing active session');

                const token = await user.getIdToken(true);
                const response = await fetch(`/api/customers/list?restaurantId=${encodeURIComponent(tenantId)}`, {
                    headers: { Authorization: `Bearer ${token}` },
                    cache: 'no-store',
                });

                const payload = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(payload?.error || 'Unable to load customers right now. Please retry.');
                }

                const nextRows: CustomerRow[] = Array.isArray(payload?.customers)
                    ? payload.customers.map((row: any) => ({
                        id: String(row.id || ''),
                        name: String(row.name || 'Guest'),
                        phone: String(row.phone || ''),
                        tableNumber: String(row.tableNumber || ''),
                        visitCount: Number(row.visitCount || 0),
                        totalSpend: Number(row.totalSpend || 0),
                        lastVisited: row.lastVisited ? new Date(row.lastVisited) : null,
                    }))
                    : [];

                if (active) {
                    setRows(nextRows);
                    setLoading(false);
                }
            } catch (err) {
                if (active) {
                    setError(err instanceof Error ? err.message : 'Unable to load customers right now. Please retry.');
                    setLoading(false);
                }
            }
        };

        loadCustomers();
        const interval = setInterval(loadCustomers, 7000);

        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [tenantId, refreshKey]);

    const filteredRows = useMemo(() => {
        return rows.filter((row) => {
            if (!row.lastVisited) return false;
            return isSameLocalDate(row.lastVisited, selectedDate);
        });
    }, [rows, selectedDate]);

    const dailyCustomersCount = filteredRows.length;
    const totalSpend = useMemo(() => filteredRows.reduce((sum, row) => sum + row.totalSpend, 0), [filteredRows]);

    return (
        <RoleGuard requiredPermission="can_view_history">
            <div className="space-y-5 lg:space-y-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold text-slate-900 lg:text-4xl">Customers</h1>
                        <p className="mt-1 text-sm text-slate-500">Real-time customer capture and visit tracking from QR scans.</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm">
                            <CalendarDays className="h-4 w-4 text-slate-500" />
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="bg-transparent text-sm text-slate-700 outline-none"
                            />
                        </label>

                        <button
                            type="button"
                            onClick={() => setRefreshKey((prev) => prev + 1)}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm transition hover:bg-slate-50"
                        >
                            <RefreshCw className="h-4 w-4" /> Refresh
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <motion.div layout className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Daily Customers</p>
                        <div className="mt-2 flex items-center gap-2">
                            <Users className="h-5 w-5 text-blue-600" />
                            <span className="text-2xl font-semibold text-slate-900">{dailyCustomersCount}</span>
                        </div>
                    </motion.div>

                    <motion.div layout className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Total Spend</p>
                        <div className="mt-2 flex items-center gap-2">
                            <Wallet className="h-5 w-5 text-emerald-600" />
                            <span className="text-2xl font-semibold text-slate-900">{formatCurrency(totalSpend)}</span>
                        </div>
                    </motion.div>

                    <motion.div layout className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Selected Date</p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">{selectedDate}</p>
                    </motion.div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] text-left">
                            <thead className="bg-slate-50/80">
                                <tr>
                                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Name</th>
                                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Phone</th>
                                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Table</th>
                                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Visit Count</th>
                                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Last Active</th>
                                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Total Spend</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">Loading customers...</td>
                                    </tr>
                                ) : error ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-rose-600">{error}</td>
                                    </tr>
                                ) : filteredRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">No customer activity for this date yet.</td>
                                    </tr>
                                ) : (
                                    filteredRows.map((row) => (
                                        <tr key={row.id} className="hover:bg-slate-50/70">
                                            <td className="px-4 py-3 text-sm font-medium text-slate-900">{row.name}</td>
                                            <td className="px-4 py-3 text-sm text-slate-700">
                                                <span className="inline-flex items-center gap-1.5">
                                                    <Phone className="h-3.5 w-3.5 text-slate-400" />
                                                    {formatPhone(row.phone)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-slate-700">{row.tableNumber || '-'}</td>
                                            <td className="px-4 py-3 text-sm text-slate-700">{row.visitCount}</td>
                                            <td className="px-4 py-3 text-sm text-slate-700">
                                                {row.lastVisited
                                                    ? row.lastVisited.toLocaleTimeString('en-IN', {
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    })
                                                    : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-sm font-medium text-slate-900">{formatCurrency(row.totalSpend)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </RoleGuard>
    );
}
