'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useCart, type CartItem } from '@/context/CartContext';
import { QuantitySelector } from '@/components/customer/QuantitySelector';
import { getTenantCheckoutSnapshotKey, getTenantTableStorageKey } from '@/lib/client/storage/tenantKeys';
import { UpgradeCard } from '@/components/customer/UpgradeCard';
import { buildSplitBill } from '@/lib/split-bill';
import { PaymentMethodModal, type PaymentMode } from '@/components/customer/PaymentMethodModal';
import { toast } from 'sonner';

type RazorpayOrder = {
    id: string;
    amount: number;
    currency: string;
};

type RazorpaySuccessResponse = {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
};

type RazorpayOptions = {
    key: string;
    amount: number;
    currency: string;
    name: string;
    description: string;
    order_id: string;
    handler: (response: RazorpaySuccessResponse) => void;
    modal?: {
        ondismiss?: () => void;
    };
};

type RazorpayInstance = {
    open: () => void;
    on: (event: string, cb: (response: any) => void) => void;
};

declare global {
    interface Window {
        Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
    }
}

function formatINR(value: number): string {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
    }).format(value);
}

type CartDrawerProps = {
    tableId?: string;
    restaurantId?: string;
    restaurantName?: string;
    sessionId?: string;
    currentGuestId?: string;
    currentGuestName?: string;
    participants?: Array<{ guestId: string; name: string }>;
    payments?: string[];
    enableSplitBilling?: boolean;
    paymentSessionCompleted?: boolean;
    onRefreshPaymentStatus?: () => Promise<void> | void;
    sharedTableContext?: boolean;
    sharedOrderingLocked?: boolean;
    onUpgrade?: () => void;
    externalCartItems?: CartItem[];
    externalTotalPrice?: number;
    onExternalIncrease?: (itemId: string, quantity: number) => void;
    onExternalDecrease?: (itemId: string, quantity: number) => void;
    onExternalRemove?: (itemId: string) => void;
};

export function CartDrawer({
    tableId = '',
    restaurantId,
    restaurantName,
    sessionId,
    currentGuestId,
    currentGuestName,
    participants = [],
    payments = [],
    enableSplitBilling = false,
    paymentSessionCompleted = false,
    onRefreshPaymentStatus,
    sharedTableContext = false,
    sharedOrderingLocked = false,
    onUpgrade,
    externalCartItems,
    externalTotalPrice,
    onExternalIncrease,
    onExternalDecrease,
    onExternalRemove,
}: CartDrawerProps) {
    const { cart, isCartOpen, setIsCartOpen, totalPrice, updateQuantity, removeFromCart } = useCart();
    const router = useRouter();
    const [manualTable, setManualTable] = React.useState('');
    const [tableError, setTableError] = React.useState<string | null>(null);
    const [showPaymentModal, setShowPaymentModal] = React.useState(false);
    const [paying, setPaying] = React.useState(false);

    const effectiveCart = externalCartItems ?? cart;
    const effectiveTotalPrice = typeof externalTotalPrice === 'number' ? externalTotalPrice : totalPrice;
    const splitBill = React.useMemo(() => buildSplitBill(effectiveCart), [effectiveCart]);
    const paidSet = React.useMemo(() => new Set(payments.map((entry) => String(entry || '').toLowerCase())), [payments]);
    const normalizedCurrentGuestId = String(currentGuestId || '').toLowerCase();
    const hasCurrentUserPaid = Boolean(normalizedCurrentGuestId && paidSet.has(normalizedCurrentGuestId));
    const effectiveParticipantCount = Math.max(1, participants.length || splitBill.people.length || 1);
    const isPaymentLocked = paymentSessionCompleted;

    const increaseItem = (itemId: string, nextQuantity: number) => {
        if (onExternalIncrease) {
            onExternalIncrease(itemId, nextQuantity);
            return;
        }
        updateQuantity(itemId, nextQuantity);
    };

    const decreaseItem = (itemId: string, nextQuantity: number) => {
        if (onExternalDecrease) {
            onExternalDecrease(itemId, nextQuantity);
            return;
        }
        updateQuantity(itemId, nextQuantity);
    };

    const removeItem = (itemId: string) => {
        if (onExternalRemove) {
            onExternalRemove(itemId);
            return;
        }
        removeFromCart(itemId);
    };

    React.useEffect(() => {
        const normalized = (tableId || '').trim();
        if (normalized) {
            setManualTable(normalized);
            if (restaurantId) {
                localStorage.setItem(getTenantTableStorageKey(restaurantId), normalized);
            }
            return;
        }

        if (!restaurantId) {
            setManualTable('');
            return;
        }

        setManualTable((localStorage.getItem(getTenantTableStorageKey(restaurantId)) || '').trim());
    }, [tableId, restaurantId]);

    const goCheckout = () => {
        if (isPaymentLocked) {
            setTableError('All payments are completed for this table session.');
            return;
        }

        if (sharedTableContext && sharedOrderingLocked) {
            setTableError('Shared table ordering is locked on your current plan.');
            return;
        }

        const finalTable = manualTable.trim();
        if (!finalTable) {
            setTableError('Please enter your table number before checkout.');
            return;
        }

        setTableError(null);
        if (restaurantId && finalTable) {
            localStorage.setItem(getTenantTableStorageKey(restaurantId), finalTable);
        }

        if (restaurantId) {
            try {
                sessionStorage.setItem(
                    getTenantCheckoutSnapshotKey(restaurantId),
                    JSON.stringify({
                        items: effectiveCart,
                        subtotal: effectiveTotalPrice,
                        tableId: finalTable,
                        createdAt: Date.now(),
                    })
                );
            } catch {
                // Ignore storage failures and continue checkout.
            }
        }

        const params = new URLSearchParams();
        if (finalTable) params.set('table', finalTable);
        if (restaurantId) params.set('restaurant', restaurantId);
        if (sharedTableContext) params.set('shared', '1');
        setIsCartOpen(false);
        router.push(`/customer/order-summary${params.toString() ? `?${params.toString()}` : ''}`);
    };

    const loadRazorpayScript = React.useCallback(async () => {
        if (window.Razorpay) return;

        await new Promise<void>((resolve, reject) => {
            const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay="true"]');
            if (existing) {
                if (window.Razorpay) resolve();
                existing.addEventListener('load', () => resolve(), { once: true });
                existing.addEventListener('error', () => reject(new Error('Failed to load Razorpay SDK')), { once: true });
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            script.async = true;
            script.dataset.razorpay = 'true';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load Razorpay SDK'));
            document.body.appendChild(script);
        });
    }, []);

    const resolveAmountForMode = React.useCallback(
        (mode: PaymentMode): number => {
            if (mode === 'one_pays_all') {
                return effectiveTotalPrice;
            }

            if (mode === 'split_equally') {
                return Number((effectiveTotalPrice / effectiveParticipantCount).toFixed(2));
            }

            if (!normalizedCurrentGuestId) {
                return Number((effectiveTotalPrice / effectiveParticipantCount).toFixed(2));
            }

            const person = splitBill.people.find((entry) => String(entry.key || '').toLowerCase() === normalizedCurrentGuestId);
            if (person && person.subtotal > 0) {
                return Number(person.subtotal.toFixed(2));
            }

            return Number((effectiveTotalPrice / effectiveParticipantCount).toFixed(2));
        },
        [effectiveParticipantCount, effectiveTotalPrice, normalizedCurrentGuestId, splitBill.people]
    );

    const openPayment = React.useCallback(
        async (mode: PaymentMode) => {
            if (!restaurantId || !manualTable.trim() || !sessionId || !normalizedCurrentGuestId) {
                toast.error('Payment context is incomplete. Refresh and try again.');
                return;
            }

            if (hasCurrentUserPaid) {
                toast.info('You have already paid.');
                return;
            }

            if (isPaymentLocked) {
                toast.info('All payments are already completed.');
                return;
            }

            const amount = resolveAmountForMode(mode);
            if (amount <= 0) {
                toast.error('Nothing to pay for this selection.');
                return;
            }

            try {
                setPaying(true);
                setShowPaymentModal(false);

                await loadRazorpayScript();

                const createRes = await fetch('/api/customer/payment/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId,
                        restaurantId,
                        tableId: manualTable.trim(),
                        guestId: normalizedCurrentGuestId,
                        guestName: currentGuestName || 'Guest',
                        amount,
                        mode,
                    }),
                });

                const createPayload = (await createRes.json().catch(() => ({}))) as {
                    error?: string;
                    paymentId?: string;
                    keyId?: string;
                    order?: RazorpayOrder;
                    restaurant?: { name?: string };
                };

                if (!createRes.ok || !createPayload.paymentId || !createPayload.order?.id) {
                    throw new Error(createPayload.error || 'Unable to create payment');
                }

                const key = String(createPayload.keyId || '').trim();
                if (!key) {
                    throw new Error('Razorpay public key missing');
                }

                const RazorpayCtor = window.Razorpay;
                if (!RazorpayCtor) {
                    throw new Error('Payment SDK unavailable. Please refresh and try again.');
                }

                await new Promise<void>((resolve, reject) => {
                    const razorpay = new RazorpayCtor({
                        key,
                        amount: Number(createPayload.order?.amount || 0),
                        currency: String(createPayload.order?.currency || 'INR'),
                        name: createPayload.restaurant?.name || restaurantName || 'Restaurant',
                        description: 'Table Payment',
                        order_id: String(createPayload.order?.id || ''),
                        handler: async (response: RazorpaySuccessResponse) => {
                            try {
                                const verifyRes = await fetch('/api/customer/payment/verify', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        ...response,
                                        paymentId: createPayload.paymentId,
                                    }),
                                });

                                const verifyPayload = await verifyRes.json().catch(() => ({}));
                                if (!verifyRes.ok) {
                                    throw new Error(verifyPayload?.error || 'Payment verification failed');
                                }

                                await onRefreshPaymentStatus?.();
                                toast.success('Payment successful');
                                resolve();
                            } catch (error) {
                                reject(error instanceof Error ? error : new Error('Payment verification failed'));
                            }
                        },
                        modal: {
                            ondismiss: () => reject(new Error('PAYMENT_CANCELLED_BY_USER')),
                        },
                    });

                    razorpay.on('payment.failed', (response) => {
                        const message = response?.error?.description || 'Payment failed. Please try again.';
                        reject(new Error(message));
                    });

                    razorpay.open();
                });
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : 'Payment failed';
                if (message === 'PAYMENT_CANCELLED_BY_USER') {
                    toast.error('Payment cancelled by user.');
                } else {
                    toast.error(message);
                }
            } finally {
                setPaying(false);
            }
        },
        [
            currentGuestName,
            hasCurrentUserPaid,
            isPaymentLocked,
            loadRazorpayScript,
            manualTable,
            normalizedCurrentGuestId,
            onRefreshPaymentStatus,
            resolveAmountForMode,
            restaurantId,
            restaurantName,
            sessionId,
        ]
    );

    const handleProceedToPay = () => {
        if (!manualTable.trim()) {
            setTableError('Please enter your table number before payment.');
            return;
        }
        if (hasCurrentUserPaid) {
            toast.info('You have already paid.');
            return;
        }
        if (isPaymentLocked) {
            toast.info('All payments are already completed.');
            return;
        }

        if (effectiveParticipantCount <= 1) {
            void openPayment('one_pays_all');
            return;
        }

        setShowPaymentModal(true);
    };

    if (!isCartOpen) return null;

    return (
        <div className="fixed inset-0 z-50">
            <button
                type="button"
                aria-label="Close cart overlay"
                onClick={() => setIsCartOpen(false)}
                className="absolute inset-0 bg-black/50"
            />
            <aside className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-stone-700 bg-[#101010] p-5 text-stone-100 shadow-2xl">
                <div className="mb-4 border-b border-stone-700 pb-3">
                    <div className="mb-2 flex items-center justify-between">
                        <h2 className="text-xl font-semibold tracking-wide">Your Cart</h2>
                        <p className="text-xs uppercase tracking-[0.14em] text-stone-400">{effectiveCart.length} items</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsCartOpen(false)}
                        className="border border-stone-600 px-3 py-1 text-xs uppercase tracking-[0.12em] hover:bg-stone-800"
                    >
                        Close
                    </button>
                </div>

                {effectiveCart.length === 0 ? (
                    <p className="rounded border border-stone-700 bg-black/30 p-4 text-sm text-stone-300">No items yet.</p>
                ) : (
                    <div className="space-y-3">
                        {effectiveCart.map((item) => (
                            <div key={item.id} className="border border-stone-700 bg-black/30 p-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <p className="font-medium">{item.name}</p>
                                        <p className="text-sm text-stone-400">{formatINR(item.price)}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => removeItem(item.id)}
                                        className="border border-rose-400/50 px-2 py-1 text-[11px] uppercase tracking-[0.1em] text-rose-300 hover:bg-rose-900/20"
                                    >
                                        Remove
                                    </button>
                                </div>
                                <div className="mt-3 flex items-center justify-between">
                                    <QuantitySelector
                                        quantity={item.quantity}
                                        onIncrease={() => increaseItem(item.id, item.quantity + 1)}
                                        onDecrease={() => decreaseItem(item.id, item.quantity - 1)}
                                    />
                                    <p className="text-sm font-semibold">{formatINR(item.price * item.quantity)}</p>
                                </div>
                                {sharedTableContext && Array.isArray(item.contributors) && item.contributors.length > 0 ? (
                                    <div className="mt-2 rounded border border-stone-700 bg-black/25 p-2">
                                        <p className="text-[10px] uppercase tracking-[0.12em] text-stone-500">Added by</p>
                                        <div className="mt-1 space-y-1">
                                            {item.contributors.map((contributor, idx) => (
                                                <p key={`${item.id}-contrib-${idx}`} className="text-xs text-stone-300">
                                                    {contributor.name}
                                                    {contributor.phone ? ` (${contributor.phone})` : ''}
                                                    {`: ${contributor.quantity}`}
                                                </p>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </div>
                )}

                {effectiveCart.length > 0 && (
                    <div className="mt-5 space-y-3 border-t border-stone-700 pt-4">
                        {sharedTableContext && splitBill.hasContributorData ? (
                            <div className="border border-stone-700 bg-black/25 p-3">
                                <p className="text-[10px] uppercase tracking-[0.14em] text-stone-500">Grouped by person</p>
                                <div className="mt-2 space-y-2">
                                    {splitBill.people.map((person) => (
                                        <div key={person.key} className="rounded border border-stone-700/80 bg-black/30 p-2">
                                            <div className="flex items-center justify-between">
                                                <p className="text-xs font-semibold text-stone-200">
                                                    {person.name}
                                                    {person.phone ? ` (${person.phone})` : ''}
                                                </p>
                                                <p className="text-xs font-semibold text-stone-100">{formatINR(person.subtotal)}</p>
                                            </div>
                                            <div className="mt-1 space-y-1">
                                                {person.lines.map((line) => (
                                                    <div key={`${person.key}-${line.itemId}`} className="flex items-center justify-between text-[11px] text-stone-400">
                                                        <span>{line.itemName} x {line.quantity}</span>
                                                        <span>{formatINR(line.lineTotal)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        {sharedTableContext && sharedOrderingLocked ? (
                            <UpgradeCard
                                title="Shared QR Checkout Is Disabled"
                                description="This restaurant is on Starter. Upgrade to Pro or Growth to accept shared QR table orders."
                                ctaLabel="Upgrade Plan"
                                onUpgrade={onUpgrade}
                            />
                        ) : null}

                        <div className="border border-stone-700 bg-black/30 p-3">
                            <label htmlFor="tableInput" className="mb-1 block text-xs uppercase tracking-wider text-stone-400">
                                Table Number
                            </label>
                            <input
                                id="tableInput"
                                value={manualTable}
                                onChange={(e) => {
                                    setManualTable(e.target.value);
                                    if (tableError) setTableError(null);
                                }}
                                readOnly={Boolean(tableId)}
                                placeholder="e.g. T-05"
                                className="w-full rounded border border-stone-600 bg-[#171717] px-3 py-2 text-sm outline-none focus:border-emerald-500"
                            />
                            {tableError ? <p className="mt-2 text-xs text-rose-300">{tableError}</p> : null}
                        </div>

                        <div className="flex items-center justify-between">
                            <span className="text-sm text-stone-300">Total</span>
                            <span className="text-lg font-bold">{formatINR(effectiveTotalPrice)}</span>
                        </div>

                        {enableSplitBilling ? (
                            <div className="rounded border border-stone-700 bg-black/30 p-3">
                                <p className="text-[10px] uppercase tracking-[0.14em] text-stone-500">Participants</p>
                                <div className="mt-2 space-y-1.5">
                                    {participants.length > 0 ? participants.map((participant) => {
                                        const paid = paidSet.has(String(participant.guestId || '').toLowerCase());
                                        const isCurrent = normalizedCurrentGuestId && String(participant.guestId || '').toLowerCase() === normalizedCurrentGuestId;
                                        return (
                                            <div key={participant.guestId} className={`flex items-center justify-between rounded px-2 py-1 text-xs ${isCurrent ? 'bg-emerald-500/10 text-emerald-100' : 'bg-black/20 text-stone-300'}`}>
                                                <span>{participant.name}{isCurrent ? ' (You)' : ''}</span>
                                                <span>{paid ? 'Paid ✅' : 'Pending ⏳'}</span>
                                            </div>
                                        );
                                    }) : (
                                        <p className="text-xs text-stone-400">No participants yet.</p>
                                    )}
                                </div>
                            </div>
                        ) : null}

                        {enableSplitBilling && hasCurrentUserPaid ? (
                            <p className="rounded border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">You have already paid for this table session.</p>
                        ) : null}

                        {enableSplitBilling && isPaymentLocked ? (
                            <p className="rounded border border-sky-300/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-200">All payments completed. Ordering is locked.</p>
                        ) : null}

                        {enableSplitBilling ? (
                            <button
                                type="button"
                                onClick={handleProceedToPay}
                                disabled={paying || !manualTable.trim() || (sharedTableContext && sharedOrderingLocked) || hasCurrentUserPaid || isPaymentLocked}
                                className="w-full bg-emerald-600 px-4 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-55"
                            >
                                {paying ? 'Processing Payment...' : 'Proceed to Pay'}
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={goCheckout}
                                disabled={!manualTable.trim() || (sharedTableContext && sharedOrderingLocked)}
                                className="w-full bg-emerald-600 px-4 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-55"
                            >
                                Proceed to Checkout
                            </button>
                        )}
                    </div>
                )}
            </aside>

            <PaymentMethodModal
                open={showPaymentModal}
                loading={paying}
                onClose={() => setShowPaymentModal(false)}
                onSelect={(mode) => {
                    void openPayment(mode);
                }}
            />
        </div>
    );
}
