'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { QuantitySelector } from '@/components/customer/QuantitySelector';
import { getTenantCheckoutSnapshotKey, getTenantTableStorageKey } from '@/lib/client/storage/tenantKeys';

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
};

export function CartDrawer({ tableId = '', restaurantId }: CartDrawerProps) {
    const { cart, isCartOpen, setIsCartOpen, totalPrice, updateQuantity, removeFromCart } = useCart();
    const router = useRouter();
    const [manualTable, setManualTable] = React.useState('');
    const [tableError, setTableError] = React.useState<string | null>(null);

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
                        items: cart,
                        subtotal: totalPrice,
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
        setIsCartOpen(false);
        router.push(`/customer/order-summary${params.toString() ? `?${params.toString()}` : ''}`);
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
                        <p className="text-xs uppercase tracking-[0.14em] text-stone-400">{cart.length} items</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsCartOpen(false)}
                        className="border border-stone-600 px-3 py-1 text-xs uppercase tracking-[0.12em] hover:bg-stone-800"
                    >
                        Close
                    </button>
                </div>

                {cart.length === 0 ? (
                    <p className="rounded border border-stone-700 bg-black/30 p-4 text-sm text-stone-300">No items yet.</p>
                ) : (
                    <div className="space-y-3">
                        {cart.map((item) => (
                            <div key={item.id} className="border border-stone-700 bg-black/30 p-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <p className="font-medium">{item.name}</p>
                                        <p className="text-sm text-stone-400">{formatINR(item.price)}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => removeFromCart(item.id)}
                                        className="border border-rose-400/50 px-2 py-1 text-[11px] uppercase tracking-[0.1em] text-rose-300 hover:bg-rose-900/20"
                                    >
                                        Remove
                                    </button>
                                </div>
                                <div className="mt-3 flex items-center justify-between">
                                    <QuantitySelector
                                        quantity={item.quantity}
                                        onIncrease={() => updateQuantity(item.id, item.quantity + 1)}
                                        onDecrease={() => updateQuantity(item.id, item.quantity - 1)}
                                    />
                                    <p className="text-sm font-semibold">{formatINR(item.price * item.quantity)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {cart.length > 0 && (
                    <div className="mt-5 space-y-3 border-t border-stone-700 pt-4">
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
                            <span className="text-lg font-bold">{formatINR(totalPrice)}</span>
                        </div>

                        <button
                            type="button"
                            onClick={goCheckout}
                            disabled={!manualTable.trim()}
                            className="w-full bg-emerald-600 px-4 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-55"
                        >
                            Proceed to Checkout
                        </button>
                    </div>
                )}
            </aside>
        </div>
    );
}
