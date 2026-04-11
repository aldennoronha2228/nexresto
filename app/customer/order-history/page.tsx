'use client';

import React, { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCart } from '@/context/CartContext';

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
                            <article key={order.id} className="border border-white/10 bg-black/30 p-4">
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
                                <div className="mt-3 border-t border-white/10 pt-2 text-right text-sm font-semibold">
                                    Total: {formatINR(order.totalPrice)}
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function CustomerOrderHistoryPage() {
    return (
        <Suspense>
            <HistoryContent />
        </Suspense>
    );
}
