'use client';

import React from 'react';
import Image from 'next/image';
import { motion } from 'motion/react';
import { Receipt, ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const formatINR = (value: number) => new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
}).format(value);

function CustomerOrderHistoryContent() {
    const { orderHistory } = useCart();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [expandedOrder, setExpandedOrder] = React.useState<string | null>(null);
    const toggleOrder = (orderId: string) => setExpandedOrder(expandedOrder === orderId ? null : orderId);

    const tableId = searchParams.get('table') ?? '';
    const restaurantId = searchParams.get('restaurant') ?? '';
    const menuUrl = (() => {
        const params = new URLSearchParams();
        if (tableId) params.set('table', tableId);
        if (restaurantId) params.set('restaurant', restaurantId);
        const qs = params.toString();
        return `/customer${qs ? `?${qs}` : ''}`;
    })();

    return (
        <div className="min-h-screen bg-[#FAF8F5]">
            <motion.header initial={{ y: -100 }} animate={{ y: 0 }} className="sticky top-0 z-30 bg-white/80 backdrop-blur-lg border-b border-gray-200/50 shadow-sm">
                <div className="max-w-4xl mx-auto px-4 md:px-8 py-4">
                    <div className="flex items-center gap-4">
                        <motion.button onClick={() => router.push(menuUrl)} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="w-10 h-10 rounded-xl bg-[#1B4332] text-white flex items-center justify-center">
                            <ArrowLeft className="w-5 h-5" />
                        </motion.button>
                        <div><h1 className="text-2xl md:text-3xl font-bold text-[#1B4332]">Order History</h1><p className="text-sm text-gray-600">View your previous orders</p></div>
                    </div>
                </div>
            </motion.header>

            <main className="max-w-4xl mx-auto px-4 md:px-8 py-8">
                {orderHistory.length === 0 ? (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-20">
                        <Receipt className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                        <h2 className="text-2xl font-bold text-gray-700 mb-2">No Orders Yet</h2>
                        <p className="text-gray-500 mb-6">Your order history will appear here</p>
                        <motion.button onClick={() => router.push(menuUrl)} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="bg-gradient-to-r from-[#1B4332] to-[#2D5F4C] text-white px-6 py-3 rounded-2xl font-semibold">Browse Menu</motion.button>
                    </motion.div>
                ) : (
                    <div className="space-y-4">
                        {orderHistory.map((order, index) => (
                            <motion.div key={order.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }} className="bg-white rounded-3xl shadow-lg overflow-hidden">
                                <button onClick={() => toggleOrder(order.id)} className="w-full p-6 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-gradient-to-br from-[#1B4332] to-[#2D5F4C] rounded-2xl flex items-center justify-center"><Receipt className="w-6 h-6 text-white" /></div>
                                        <div className="text-left"><p className="font-bold text-[#1B4332] text-lg">Order #{order.orderNumber}</p><p className="text-sm text-gray-600">{order.date} · {order.time}</p></div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-right"><p className="font-bold text-[#1B4332] text-lg">{formatINR(order.totalPrice)}</p><p className="text-sm text-gray-600">{order.items.reduce((sum, item) => sum + item.quantity, 0)} items</p></div>
                                        {expandedOrder === order.id ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                                    </div>
                                </button>
                                {expandedOrder === order.id && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-gray-200 p-6 space-y-4 bg-[#FAF8F5]">
                                        {order.items.map((item) => (
                                            <div key={item.id} className="flex items-center gap-4">
                                                <Image
                                                    src={item.image}
                                                    alt={`${item.name} from your previous order`}
                                                    width={64}
                                                    height={64}
                                                    unoptimized
                                                    className="h-16 w-16 rounded-xl object-cover"
                                                />
                                                <div className="flex-1"><p className="font-semibold text-[#1B4332]">{item.name}</p><p className="text-sm text-gray-600">{formatINR(item.price)} × {item.quantity}</p></div>
                                                <p className="font-bold text-[#1B4332]">{formatINR(item.price * item.quantity)}</p>
                                            </div>
                                        ))}
                                        <div className="pt-4 border-t border-gray-300 flex justify-between items-center">
                                            <span className="font-semibold text-gray-700">Total</span>
                                            <span className="font-bold text-xl text-[#1B4332]">{formatINR(order.totalPrice)}</span>
                                        </div>
                                    </motion.div>
                                )}
                            </motion.div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}

export default function CustomerOrderHistoryPage() {
    return <Suspense><CustomerOrderHistoryContent /></Suspense>;
}
