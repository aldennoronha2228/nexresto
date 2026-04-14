'use client';

import React, { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import type { CartItem } from '@/context/CartContext';
import { submitOrderToFirestore } from '@/lib/firebase-submit-order';
import { getTenantCheckoutSnapshotKey, getTenantCustomerStorageKey, getTenantTableStorageKey } from '@/lib/client/storage/tenantKeys';
import { isValidPhone, normalizePhone } from '@/lib/customer-tracking';

type CheckoutSnapshot = {
    items: CartItem[];
    subtotal: number;
    tableId?: string;
    createdAt?: number;
};

function readCheckoutSnapshot(restaurantId: string): CheckoutSnapshot | null {
    if (typeof window === 'undefined' || !restaurantId) return null;

    try {
        const raw = sessionStorage.getItem(getTenantCheckoutSnapshotKey(restaurantId));
        if (!raw) return null;

        const parsed = JSON.parse(raw) as Partial<CheckoutSnapshot>;
        if (!Array.isArray(parsed.items) || parsed.items.length === 0) return null;

        const createdAt = Number(parsed.createdAt || 0);
        const ageMs = Date.now() - createdAt;
        if (!Number.isFinite(createdAt) || ageMs > 45 * 60 * 1000) return null;

        return {
            items: parsed.items,
            subtotal: Number(parsed.subtotal || 0),
            tableId: typeof parsed.tableId === 'string' ? parsed.tableId : undefined,
            createdAt,
        };
    } catch {
        return null;
    }
}

function formatINR(value: number): string {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
    }).format(value);
}

function OrderSummaryContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { cart, totalPrice, clearCart, saveOrder } = useCart();

    const restaurantId = (searchParams.get('restaurant') || '').trim();
    const queryTable = (searchParams.get('table') || searchParams.get('tableId') || '').trim();

    const [tableId, setTableId] = React.useState('');
    const [status, setStatus] = React.useState<'submitting' | 'success' | 'error'>('submitting');
    const [error, setError] = React.useState('');
    const [orderNumber, setOrderNumber] = React.useState<number>(0);
    const [tableReady, setTableReady] = React.useState(false);
    const [customerProfile, setCustomerProfile] = React.useState<{ name: string; phone: string } | null>(null);
    const [submittedCart, setSubmittedCart] = React.useState<CartItem[]>(cart);
    const [submittedSubtotal, setSubmittedSubtotal] = React.useState<number>(totalPrice);

    const submittedRef = React.useRef(false);

    React.useEffect(() => {
        if (queryTable) {
            setTableId(queryTable);
            if (restaurantId) localStorage.setItem(getTenantTableStorageKey(restaurantId), queryTable);
            setTableReady(true);
            return;
        }

        if (!restaurantId) {
            setTableReady(true);
            return;
        }

        setTableId((localStorage.getItem(getTenantTableStorageKey(restaurantId)) || '').trim());
        setTableReady(true);
    }, [queryTable, restaurantId]);

    React.useEffect(() => {
        if (!restaurantId) {
            setCustomerProfile(null);
            return;
        }

        const raw = localStorage.getItem(getTenantCustomerStorageKey(restaurantId));
        if (!raw) {
            setCustomerProfile(null);
            return;
        }

        try {
            const parsed = JSON.parse(raw) as { name?: string; phone?: string };
            const normalizedPhone = normalizePhone(parsed.phone || '');
            const normalizedName = String(parsed.name || '').trim();
            if (normalizedName.length >= 2 && isValidPhone(normalizedPhone)) {
                setCustomerProfile({ name: normalizedName, phone: normalizedPhone });
                return;
            }
        } catch {
            // Ignore invalid local profile.
        }

        setCustomerProfile(null);
    }, [restaurantId]);

    const backToMenuUrl = React.useMemo(() => {
        const params = new URLSearchParams();
        if (tableId) params.set('table', tableId);
        if (restaurantId) params.set('restaurant', restaurantId);
        return `/customer${params.toString() ? `?${params.toString()}` : ''}`;
    }, [tableId, restaurantId]);

    const checkoutSnapshotKey = React.useMemo(
        () => (restaurantId ? getTenantCheckoutSnapshotKey(restaurantId) : ''),
        [restaurantId]
    );

    React.useEffect(() => {
        if (!tableReady) return;
        if (submittedRef.current) return;

        if (!restaurantId) {
            setStatus('error');
            setError('Missing restaurant context. Please return to menu and try again.');
            return;
        }

        if (!tableId) {
            setStatus('error');
            setError('Missing table number. Please return to menu and enter your table before checkout.');
            return;
        }

        const snapshot = readCheckoutSnapshot(restaurantId);
        const cartToSubmit = cart.length > 0 ? cart : (snapshot?.items || []);
        const subtotalToSubmit = cart.length > 0 ? totalPrice : Number(snapshot?.subtotal || 0);

        if (cartToSubmit.length === 0) {
            router.replace(backToMenuUrl);
            return;
        }

        setSubmittedCart(cartToSubmit);
        setSubmittedSubtotal(subtotalToSubmit);

        submittedRef.current = true;

        submitOrderToFirestore(
            cartToSubmit,
            tableId,
            subtotalToSubmit + 5,
            restaurantId,
            customerProfile || undefined
        )
            .then(({ orderId, dailyOrderNumber }) => {
                const now = new Date();
                saveOrder({
                    id: orderId,
                    orderNumber: dailyOrderNumber,
                    items: cartToSubmit,
                    totalPrice: subtotalToSubmit + 5,
                    date: now.toLocaleDateString('en-IN'),
                    time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
                });
                setOrderNumber(dailyOrderNumber);
                clearCart();
                if (checkoutSnapshotKey) {
                    sessionStorage.removeItem(checkoutSnapshotKey);
                }
                setStatus('success');
            })
            .catch((err: unknown) => {
                setStatus('error');
                setError(err instanceof Error ? err.message : 'Could not submit order');
            });
    }, [
        router,
        backToMenuUrl,
        clearCart,
        restaurantId,
        saveOrder,
        tableId,
        customerProfile,
        tableReady,
        cart,
        totalPrice,
        checkoutSnapshotKey,
    ]);

    const displayedCart = submittedCart.length > 0 ? submittedCart : cart;
    const displayedSubtotal = submittedCart.length > 0 ? submittedSubtotal : totalPrice;
    const displayedItemCount = displayedCart.reduce((sum, item) => sum + item.quantity, 0);

    return (
        <div className="min-h-screen bg-[#131313] px-4 py-10 text-stone-200">
            <div className="mx-auto max-w-2xl border border-white/10 bg-black/30 p-6">
                {status === 'submitting' && <p className="text-center text-sm">Submitting your order...</p>}

                {status === 'error' && (
                    <div className="space-y-4">
                        <p className="text-sm text-rose-300">{error || 'Order failed'}</p>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => window.location.reload()} className="rounded bg-rose-600 px-4 py-2 text-sm font-semibold text-white">
                                Retry
                            </button>
                            <button type="button" onClick={() => router.push(backToMenuUrl)} className="rounded border border-white/20 px-4 py-2 text-sm">
                                Back to Menu
                            </button>
                        </div>
                    </div>
                )}

                {status === 'success' && (
                    <div className="space-y-5">
                        <h1 className="text-2xl font-bold text-white">Order Placed</h1>
                        <p className="text-sm text-stone-300">Your order is now live in the dashboard queue.</p>
                        <div className="rounded border border-white/10 bg-black/25 p-4 text-sm">
                            <p>Order Number: #{orderNumber || '...'}</p>
                            <p>Items: {displayedCart.length}</p>
                            <p>Total: {formatINR(displayedSubtotal + 5)}</p>
                            <p>Table: {tableId || 'N/A'}</p>
                        </div>
                        <button type="button" onClick={() => router.push(backToMenuUrl)} className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
                            Back to Menu
                        </button>
                    </div>
                )}

                {displayedCart.length > 0 && (
                    <div className="mt-6 border-t border-white/10 pt-4">
                        <p className="mb-2 text-xs uppercase tracking-wider text-stone-400">Receipt</p>
                        <div className="space-y-2 text-sm">
                            {displayedCart.map((item) => (
                                <div key={item.id} className="flex items-center justify-between">
                                    <span>{item.name} x {item.quantity}</span>
                                    <span>{formatINR(item.price * item.quantity)}</span>
                                </div>
                            ))}
                        </div>
                        <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3 text-sm">
                            <span>Subtotal ({displayedItemCount} items)</span>
                            <span>{formatINR(displayedSubtotal)}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function CustomerOrderSummaryPage() {
    return (
        <Suspense>
            <OrderSummaryContent />
        </Suspense>
    );
}
