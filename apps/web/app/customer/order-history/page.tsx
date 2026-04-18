'use client';

import React, { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import type { Order } from '@/context/CartContext';
import { buildSplitBill } from '@/lib/split-bill';

function formatINR(value: number): string {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
    }).format(value);
}

function HistoryContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { orderHistory } = useCart();

    const table = (searchParams.get('table') || '').trim();
    const restaurant = (searchParams.get('restaurant') || '').trim();

    const menuUrl = React.useMemo(() => {
        const params = new URLSearchParams();
        if (table) params.set('table', table);
        if (restaurant) params.set('restaurant', restaurant);
        return `/customer${params.toString() ? `?${params.toString()}` : ''}`;
    }, [table, restaurant]);

    return (
        <div className="min-h-screen bg-[#131313] px-4 py-10 text-stone-200">
            <div className="mx-auto max-w-3xl">
                <button
                    type="button"
                    onClick={() => router.push(menuUrl)}
                    className="mb-4 rounded border border-white/20 px-3 py-2 text-xs uppercase tracking-wider hover:bg-white/10"
                >
                    Back to Menu
                </button>

                <h1 className="mb-4 text-2xl font-bold text-white">Order History</h1>

                {orderHistory.length === 0 ? (
                    <div className="border border-white/10 bg-black/30 p-5 text-sm text-stone-300">No past orders yet.</div>
                ) : (
                    <div className="space-y-3">
                        {orderHistory.map((order) => (
                            <OrderHistoryCard key={order.id} order={order} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function OrderHistoryCard({ order }: { order: Order }) {
    const splitBill = React.useMemo(() => buildSplitBill(order.items), [order.items]);
    const serviceCharge = Math.max(0, Number(order.totalPrice || 0) - splitBill.totalFromPeople);

    return (
        <article className="border border-white/10 bg-black/30 p-4">
            <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-white">Order #{order.orderNumber}</p>
                <p className="text-xs text-stone-400">{order.date} {order.time}</p>
            </div>
            <div className="space-y-1 text-sm">
                {order.items.map((item) => (
                    <div key={`${order.id}-${item.id}`} className="flex items-center justify-between">
                        <span>{item.name} x {item.quantity}</span>
                        <span>{formatINR(item.price * item.quantity)}</span>
                    </div>
                ))}
            </div>

            {splitBill.hasContributorData ? (
                <div className="mt-3 rounded border border-white/10 bg-black/25 p-3">
                    <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-stone-400">Bill split by person</p>
                    <div className="space-y-2">
                        {splitBill.people.map((person) => (
                            <div key={`${order.id}-${person.key}`} className="rounded border border-white/10 bg-black/30 p-2">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-semibold text-stone-200">
                                        {person.name}
                                        {person.phone ? ` (${person.phone})` : ''}
                                    </p>
                                    <p className="text-xs font-semibold text-white">{formatINR(person.subtotal)}</p>
                                </div>
                                <div className="mt-1 space-y-1 text-xs text-stone-400">
                                    {person.lines.map((line) => (
                                        <div key={`${order.id}-${person.key}-${line.itemId}`} className="flex items-center justify-between">
                                            <span>{line.itemName} x {line.quantity}</span>
                                            <span>{formatINR(line.lineTotal)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-3 space-y-1 border-t border-white/10 pt-3 text-sm">
                        <div className="flex items-center justify-between text-stone-300">
                            <span>Items total</span>
                            <span>{formatINR(splitBill.totalFromPeople)}</span>
                        </div>
                        <div className="flex items-center justify-between text-stone-300">
                            <span>Service charge</span>
                            <span>{formatINR(serviceCharge)}</span>
                        </div>
                        <div className="flex items-center justify-between font-semibold text-white">
                            <span>Grand total</span>
                            <span>{formatINR(order.totalPrice)}</span>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="mt-3 border-t border-white/10 pt-2 text-right text-sm font-semibold">
                    Total: {formatINR(order.totalPrice)}
                </div>
            )}
        </article>
    );
}

export default function CustomerOrderHistoryPage() {
    return (
        <Suspense>
            <HistoryContent />
        </Suspense>
    );
}
