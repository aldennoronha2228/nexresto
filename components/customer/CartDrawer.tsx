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
    paymentEnabled?: boolean;
    sessionStatus?: 'active' | 'billing' | 'completed';
    onProceedToPay?: () => Promise<{ billTotal?: number } | void>;
    onRefreshPaymentStatus?: () => Promise<void> | void;
    sharedTableContext?: boolean;
    sharedOrderingLocked?: boolean;
    onUpgrade?: () => void;
    externalCartItems?: CartItem[];
    sentItems?: CartItem[];
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
    paymentEnabled = true,
    sessionStatus = 'active',
    onProceedToPay,
    onRefreshPaymentStatus,
    sharedTableContext = false,
    sharedOrderingLocked = false,
    onUpgrade,
    externalCartItems,
    sentItems,
    externalTotalPrice,
    onExternalIncrease,
    onExternalDecrease,
    onExternalRemove,
}: CartDrawerProps) {
    const { cart, isCartOpen, setIsCartOpen, totalPrice, updateQuantity, removeFromCart, clearCart } = useCart();
    const router = useRouter();
    const [manualTable, setManualTable] = React.useState('');
    const [tableError, setTableError] = React.useState<string | null>(null);
    const [showPaymentModal, setShowPaymentModal] = React.useState(false);
    const [paying, setPaying] = React.useState(false);
    const [proceedingToPay, setProceedingToPay] = React.useState(false);
    const [sendingOrder, setSendingOrder] = React.useState(false);
    const [finalBillTotal, setFinalBillTotal] = React.useState<number | null>(null);

    const effectiveCart = externalCartItems ?? cart;
    const effectiveTotalPrice = typeof externalTotalPrice === 'number' ? externalTotalPrice : totalPrice;
    const splitBill = React.useMemo(() => buildSplitBill(effectiveCart), [effectiveCart]);
    const paidSet = React.useMemo(() => new Set(payments.map((entry) => String(entry || '').toLowerCase())), [payments]);
    const normalizedCurrentGuestId = String(currentGuestId || '').toLowerCase();
    const hasCurrentUserPaid = Boolean(normalizedCurrentGuestId && paidSet.has(normalizedCurrentGuestId));
    const effectiveParticipantCount = Math.max(1, participants.length || splitBill.people.length || 1);
    const isPaymentLocked = paymentSessionCompleted;
    const isBilling = sessionStatus === 'billing';
    const isCompleted = sessionStatus === 'completed';
    const cartInteractionLocked = sharedTableContext && (isBilling || isCompleted);
    const showBillingSummary = enableSplitBilling && (isBilling || isCompleted);
    const showCheckoutSection = effectiveCart.length > 0 || showBillingSummary;
    const useOnlinePaymentFlow = enableSplitBilling && paymentEnabled && isBilling;
    const kitchenSentItems = React.useMemo(
        () => (enableSplitBilling && sessionStatus === 'active' ? (sentItems || []) : []),
        [enableSplitBilling, sentItems, sessionStatus]
    );
    const hasCartContext = effectiveCart.length > 0 || kitchenSentItems.length > 0;
    const kitchenSentTotal = React.useMemo(
        () => kitchenSentItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
        [kitchenSentItems]
    );
    const displayTotal = showBillingSummary ? effectiveTotalPrice : effectiveTotalPrice + kitchenSentTotal;
    const displayedItemCount = effectiveCart.length + kitchenSentItems.length;
    const payableTotal = finalBillTotal !== null && finalBillTotal > 0 ? finalBillTotal : effectiveTotalPrice;

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
        if ((window as Window & { Razorpay?: new (options: RazorpayOptions) => RazorpayInstance }).Razorpay) return;

        await new Promise<void>((resolve, reject) => {
            const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay="true"]');
            if (existing) {
                if ((window as Window & { Razorpay?: new (options: RazorpayOptions) => RazorpayInstance }).Razorpay) resolve();
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
                return payableTotal;
            }

            if (mode === 'split_equally') {
                return Number((payableTotal / effectiveParticipantCount).toFixed(2));
            }

            if (!normalizedCurrentGuestId) {
                return Number((payableTotal / effectiveParticipantCount).toFixed(2));
            }

            const person = splitBill.people.find((entry) => String(entry.key || '').toLowerCase() === normalizedCurrentGuestId);
            if (person && person.subtotal > 0) {
                return Number(person.subtotal.toFixed(2));
            }

            return Number((payableTotal / effectiveParticipantCount).toFixed(2));
        },
        [effectiveParticipantCount, normalizedCurrentGuestId, payableTotal, splitBill.people]
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

                const RazorpayCtor = (window as Window & { Razorpay?: new (options: RazorpayOptions) => RazorpayInstance }).Razorpay;
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

    const handleProceedToPay = async () => {
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

        if (!isBilling) {
            if (!onProceedToPay) {
                toast.error('Unable to finalize this table right now.');
                return;
            }

            try {
                setProceedingToPay(true);
                toast.info('Finalizing your order...');
                const result = await onProceedToPay();
                const nextTotal = Number(result?.billTotal || 0);
                if (Number.isFinite(nextTotal) && nextTotal > 0) {
                    setFinalBillTotal(nextTotal);
                }
                await onRefreshPaymentStatus?.();
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : 'Unable to finalize order';
                toast.error(message);
                return;
            } finally {
                setProceedingToPay(false);
            }
        }

        if (effectiveParticipantCount <= 1) {
            void openPayment('one_pays_all');
            return;
        }

        setShowPaymentModal(true);
    };

    const handleSendToKitchen = async () => {
        const finalTable = manualTable.trim();
        if (!restaurantId || !finalTable) {
            setTableError('Please enter your table number before sending order.');
            return;
        }

        if (sessionStatus !== 'active') {
            toast.info('You can send to kitchen only while the session is active.');
            return;
        }

        if (effectiveCart.length === 0) {
            toast.info('Cart is empty. Add items first.');
            return;
        }

        const customerPhone = String((normalizedCurrentGuestId.split('|')[1] || '')).trim();

        try {
            setSendingOrder(true);
            const response = await fetch('/api/customer/session/send-to-kitchen', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    restaurantId,
                    tableId: finalTable,
                    customer: currentGuestName
                        ? {
                            name: currentGuestName,
                            phone: customerPhone,
                        }
                        : undefined,
                }),
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(String(payload?.error || 'Unable to send order to kitchen'));
            }

            // Shared cart is cleared by API; local cart needs manual clear.
            if (!onExternalIncrease && !onExternalDecrease && !onExternalRemove) {
                clearCart();
            }

            await onRefreshPaymentStatus?.();
            toast.success('Order sent to kitchen');
            setIsCartOpen(false);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unable to send order to kitchen';
            toast.error(message);
        } finally {
            setSendingOrder(false);
        }
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
                        <p className="text-xs uppercase tracking-[0.14em] text-stone-400">{displayedItemCount} items</p>
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
                    <p className="rounded border border-stone-700 bg-black/30 p-4 text-sm text-stone-300">
                        {kitchenSentItems.length > 0 ? 'No pending items in cart. Sent items are shown below.' : 'No items yet.'}
                    </p>
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
                                        onClick={() => {
                                            if (cartInteractionLocked) return;
                                            removeItem(item.id);
                                        }}
                                        disabled={cartInteractionLocked}
                                        className="border border-rose-400/50 px-2 py-1 text-[11px] uppercase tracking-[0.1em] text-rose-300 hover:bg-rose-900/20 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        Remove
                                    </button>
                                </div>
                                <div className="mt-3 flex items-center justify-between">
                                    <QuantitySelector
                                        quantity={item.quantity}
                                        onIncrease={() => {
                                            if (cartInteractionLocked) return;
                                            increaseItem(item.id, item.quantity + 1);
                                        }}
                                        onDecrease={() => {
                                            if (cartInteractionLocked) return;
                                            decreaseItem(item.id, item.quantity - 1);
                                        }}
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

                {kitchenSentItems.length > 0 ? (
                    <div className="mt-4 space-y-2 rounded border border-stone-700 bg-black/25 p-3">
                        <div className="flex items-center justify-between">
                            <p className="text-[10px] uppercase tracking-[0.14em] text-stone-500">Already Sent to Kitchen</p>
                            <p className="text-xs font-semibold text-stone-300">{formatINR(kitchenSentTotal)}</p>
                        </div>
                        {kitchenSentItems.map((item) => (
                            <div key={`sent-${item.id}`} className="flex items-center justify-between text-sm text-stone-300">
                                <span>{item.name} x {item.quantity}</span>
                                <span>{formatINR(item.price * item.quantity)}</span>
                            </div>
                        ))}
                    </div>
                ) : null}

                {(showCheckoutSection || hasCartContext) && (
                    <div className="mt-5 space-y-3 border-t border-stone-700 pt-4">
                        {showBillingSummary && effectiveCart.length === 0 ? (
                            <p className="rounded border border-stone-600 bg-black/20 px-3 py-2 text-xs text-stone-300">
                                Bill details are syncing. You can still proceed with payment using the generated bill total.
                            </p>
                        ) : null}

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
                            <span className="text-lg font-bold">{formatINR(displayTotal)}</span>
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

                        {enableSplitBilling && sessionStatus === 'active' ? (
                            <button
                                type="button"
                                onClick={() => {
                                    void handleSendToKitchen();
                                }}
                                disabled={sendingOrder || proceedingToPay || !manualTable.trim() || effectiveCart.length === 0}
                                className="w-full rounded-xl border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-55"
                            >
                                {sendingOrder ? 'Sending...' : 'Send to Kitchen'}
                            </button>
                        ) : null}

                        {enableSplitBilling && sessionStatus === 'billing' ? (
                            <p className="rounded border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">🧾 Bill generated. Please complete payment.</p>
                        ) : null}

                        {enableSplitBilling && sessionStatus === 'completed' ? (
                            <p className="rounded border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">✅ Payment completed. Thank you!</p>
                        ) : null}

                        {useOnlinePaymentFlow && hasCurrentUserPaid ? (
                            <p className="rounded border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">You have already paid for this table session.</p>
                        ) : null}

                        {useOnlinePaymentFlow && isPaymentLocked ? (
                            <p className="rounded border border-sky-300/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-200">All payments completed. Ordering is locked.</p>
                        ) : null}

                        {enableSplitBilling && !paymentEnabled ? (
                            <p className="rounded border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                                Online payment is currently disabled by the restaurant. Your order will be sent now and payment can be collected later.
                            </p>
                        ) : null}

                        {enableSplitBilling ? (
                            <button
                                type="button"
                                onClick={() => {
                                    void handleProceedToPay();
                                }}
                                disabled={
                                    proceedingToPay ||
                                    paying ||
                                    !manualTable.trim() ||
                                    (sharedTableContext && sharedOrderingLocked) ||
                                    hasCurrentUserPaid ||
                                    isPaymentLocked ||
                                    (!hasCartContext && sessionStatus === 'active')
                                }
                                className="w-full bg-emerald-600 px-4 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-55"
                            >
                                {proceedingToPay ? 'Finalizing Your Order...' : paying ? 'Processing Payment...' : 'Proceed to Pay'}
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={goCheckout}
                                disabled={!manualTable.trim() || (sharedTableContext && sharedOrderingLocked) || (paymentEnabled && isPaymentLocked)}
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
                loading={paying || proceedingToPay}
                onClose={() => setShowPaymentModal(false)}
                onSelect={(mode) => {
                    void openPayment(mode);
                }}
            />
        </div>
    );
}
