'use client';

import { useEffect, useMemo, useState } from 'react';
import { CreditCard, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { RoleGuard } from '@/components/dashboard/RoleGuard';
import { adminAuth, tenantAuth } from '@/lib/firebase';
import { useRestaurant } from '@/hooks/useRestaurant';

function PaymentsSettingsContent() {
    const { storeId } = useRestaurant();
    const [keyId, setKeyId] = useState('');
    const [keySecret, setKeySecret] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savingToggle, setSavingToggle] = useState(false);
    const [isPaymentConnected, setIsPaymentConnected] = useState(false);
    const [showSaveConfirm, setShowSaveConfirm] = useState(false);

    const canSubmit = useMemo(() => {
        return Boolean(keyId.trim() && keySecret.trim()) && !saving;
    }, [keyId, keySecret, saving]);

    const getActiveToken = async () => {
        if (tenantAuth.currentUser) return tenantAuth.currentUser.getIdToken(true);
        if (adminAuth.currentUser) return adminAuth.currentUser.getIdToken(true);
        throw new Error('Missing active session');
    };

    useEffect(() => {
        let cancelled = false;

        const loadSettings = async () => {
            if (!storeId) {
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                const token = await getActiveToken();
                const response = await fetch(`/api/settings/payments?restaurantId=${encodeURIComponent(storeId)}`, {
                    headers: { Authorization: `Bearer ${token}` },
                    cache: 'no-store',
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(payload?.error || 'Failed to load payment settings');
                }

                if (cancelled) return;
                setKeyId(String(payload?.keyId || ''));
                setIsPaymentConnected(Boolean(payload?.isPaymentConnected));
            } catch (error: any) {
                if (!cancelled) {
                    toast.error(error?.message || 'Failed to load payment settings');
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void loadSettings();
        return () => {
            cancelled = true;
        };
    }, [storeId]);

    const saveRazorpayKeys = async () => {
        if (!storeId) {
            toast.error('Restaurant context missing');
            return;
        }

        try {
            setSaving(true);
            const token = await getActiveToken();
            const response = await fetch('/api/settings/payments', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    restaurantId: storeId,
                    keyId: keyId.trim(),
                    keySecret: keySecret.trim(),
                }),
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload?.error || 'Failed to connect Razorpay');
            }

            setIsPaymentConnected(true);
            setKeySecret('');
            setShowSaveConfirm(false);
            toast.success('Razorpay connected successfully');
        } catch (error: any) {
            toast.error(error?.message || 'Failed to connect Razorpay');
        } finally {
            setSaving(false);
        }
    };

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (!storeId) {
            toast.error('Restaurant context missing');
            return;
        }

        if (!keyId.trim() || !keySecret.trim()) {
            toast.error('Please enter both Razorpay Key ID and Secret Key');
            return;
        }

        setShowSaveConfirm(true);
    };

    const handleTogglePayments = async () => {
        if (!storeId) {
            toast.error('Restaurant context missing');
            return;
        }

        try {
            setSavingToggle(true);
            const token = await getActiveToken();
            const nextState = !isPaymentConnected;
            const response = await fetch('/api/settings/payments', {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    restaurantId: storeId,
                    isPaymentConnected: nextState,
                }),
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload?.error || 'Failed to update payment status');
            }

            setIsPaymentConnected(Boolean(payload?.isPaymentConnected));
            toast.success(Boolean(payload?.isPaymentConnected) ? 'Payments activated' : 'Payments deactivated');
        } catch (error: any) {
            toast.error(error?.message || 'Failed to update payment status');
        } finally {
            setSavingToggle(false);
        }
    };

    if (loading) {
        return (
            <div className="flex min-h-[220px] items-center justify-center">
                <div className="flex items-center gap-2 text-slate-600">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Loading payment settings...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="mb-6 flex items-start gap-3">
                    <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
                        <CreditCard className="h-5 w-5" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">Payments Settings</h1>
                        <p className="mt-1 text-sm text-slate-600">
                            Connect your Razorpay account to receive payments
                        </p>
                    </div>
                </div>

                <form className="space-y-4" onSubmit={handleSubmit}>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-medium text-slate-800">Accept Razorpay payments</p>
                                <p className="mt-0.5 text-xs text-slate-600">Owner can switch payments on or off anytime.</p>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={isPaymentConnected}
                                onClick={handleTogglePayments}
                                disabled={savingToggle}
                                className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
                                    isPaymentConnected ? 'bg-emerald-500' : 'bg-slate-300'
                                } ${savingToggle ? 'cursor-not-allowed opacity-60' : ''}`}
                            >
                                <span
                                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                                        isPaymentConnected ? 'translate-x-6' : 'translate-x-1'
                                    }`}
                                />
                            </button>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor="razorpay-key-id" className="text-sm font-medium text-slate-700">
                            Razorpay Key ID
                        </label>
                        <input
                            id="razorpay-key-id"
                            type="text"
                            value={keyId}
                            onChange={(event) => setKeyId(event.target.value)}
                            autoComplete="off"
                            className="h-11 w-full rounded-xl border border-slate-300 px-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                            placeholder="rzp_live_xxxxxxxxxxxx"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor="razorpay-key-secret" className="text-sm font-medium text-slate-700">
                            Razorpay Secret Key
                        </label>
                        <input
                            id="razorpay-key-secret"
                            type="password"
                            value={keySecret}
                            onChange={(event) => setKeySecret(event.target.value)}
                            autoComplete="new-password"
                            className="h-11 w-full rounded-xl border border-slate-300 px-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                            placeholder="Enter secret key"
                        />
                        <p className="text-xs text-slate-500">Secret is encrypted before storage and never returned to the frontend.</p>
                    </div>

                    <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
                        <button
                            type="submit"
                            disabled={!canSubmit}
                            className="inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-55"
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                'Save Keys'
                            )}
                        </button>

                        {isPaymentConnected ? (
                            <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                                <ShieldCheck className="h-4 w-4" />
                                ✅ Razorpay Active
                            </div>
                        ) : null}
                    </div>
                </form>
            </div>

            {showSaveConfirm ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
                        <h2 className="text-lg font-semibold text-slate-900">Save Razorpay Keys?</h2>
                        <p className="mt-2 text-sm text-slate-600">
                            Your Razorpay Secret Key will be encrypted before storage. Continue saving these payment credentials?
                        </p>

                        <div className="mt-5 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setShowSaveConfirm(false)}
                                disabled={saving}
                                className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    void saveRazorpayKeys();
                                }}
                                disabled={saving}
                                className="inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {saving ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    'Yes, Save Keys'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export default function PaymentsSettingsPage() {
    return (
        <RoleGuard requiredPermission="can_view_billing" fallbackRoute="/dashboard/account">
            <PaymentsSettingsContent />
        </RoleGuard>
    );
}
