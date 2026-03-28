'use client';

import React from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Home, Receipt, Loader2, AlertCircle, Wifi } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { submitOrderToFirestore } from '@/lib/firebase-submit-order';
import { Suspense } from 'react';
import { getTenantTableStorageKey } from '@/lib/client/storage/tenantKeys';

const formatINR = (value: number) => new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
}).format(value);

function getScopedTableStorageKey(restaurantId?: string): string | null {
    if (!restaurantId) return null;
    return getTenantTableStorageKey(restaurantId);
}

function OrderSummaryContent() {
    const { cart, totalPrice, clearCart, totalItems } = useCart();
    const router = useRouter();
    const searchParams = useSearchParams();
    const queryTableId =
        searchParams.get('table') ??
        searchParams.get('tableId') ??
        searchParams.get('table_id') ??
        searchParams.get('t') ??
        '';
    const [tableId, setTableId] = React.useState('');
    const restaurantId = searchParams.get('restaurant') ?? undefined;

    React.useEffect(() => {
        const normalized = (queryTableId || '').trim();
        const storageKey = getScopedTableStorageKey(restaurantId);
        if (normalized) {
            setTableId(normalized);
            if (storageKey) {
                localStorage.setItem(storageKey, normalized);
            }
            return;
        }

        const remembered = storageKey
            ? (localStorage.getItem(storageKey) || '').trim()
            : '';
        setTableId(remembered);
    }, [queryTableId, restaurantId]);

    const buildMenuUrl = () => {
        const params = new URLSearchParams();
        if (tableId) params.set('table', tableId);
        if (restaurantId) params.set('restaurant', restaurantId);
        const qs = params.toString();
        return `/customer${qs ? `?${qs}` : ''}`;
    };

    const [status, setStatus] = React.useState<'submitting' | 'success' | 'error'>('submitting');
    const [orderId, setOrderId] = React.useState('');
    const [orderNumber, setOrderNumber] = React.useState(0);
    const [errorMsg, setErrorMsg] = React.useState('');
    const submitted = React.useRef(false);

    // Freeze a copy of the cart for the receipt after we clear the global cart
    const [receiptCart] = React.useState(cart);
    const [receiptTotal] = React.useState(totalPrice);
    const [receiptItemCount] = React.useState(totalItems || cart.length);

    React.useEffect(() => {
        if (submitted.current || cart.length === 0) {
            // Nothing in cart — go back to menu
            if (cart.length === 0 && !submitted.current) {
                router.replace(buildMenuUrl());
            }
            return;
        }
        submitted.current = true;

        const total = parseFloat((totalPrice + 5).toFixed(2));

        submitOrderToFirestore([...cart], tableId, total, restaurantId)
            .then(({ orderId, dailyOrderNumber }) => {
                setOrderId(orderId);
                setOrderNumber(dailyOrderNumber);
                setStatus('success');
                clearCart();
            })
            .catch((err: Error) => {
                console.error('Order submit failed:', err);
                setErrorMsg(err.message);
                setStatus('error');
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleBackToMenu = () => router.push(buildMenuUrl());
    const handleRetry = () => { submitted.current = false; setStatus('submitting'); setErrorMsg(''); };

    return (
        <div className="min-h-screen bg-[#FAF8F5] py-8 px-4">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto">

                {/* ── Submitting ── */}
                <AnimatePresence mode="wait">
                    {status === 'submitting' && (
                        <motion.div key="submitting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-24">
                            <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-[#1B4332] to-[#2D5F4C] rounded-full mb-6 shadow-2xl">
                                <Loader2 className="w-12 h-12 text-white animate-spin" />
                            </div>
                            <h1 className="text-3xl font-bold text-[#1B4332] mb-2">Sending your order…</h1>
                            <p className="text-gray-500">Talking to the kitchen right now</p>
                        </motion.div>
                    )}

                    {/* ── Error ── */}
                    {status === 'error' && (
                        <motion.div key="error" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="text-center py-20">
                            <div className="inline-flex items-center justify-center w-24 h-24 bg-rose-100 border-2 border-rose-300 rounded-full mb-6">
                                <AlertCircle className="w-12 h-12 text-rose-500" />
                            </div>
                            <h1 className="text-3xl font-bold text-rose-700 mb-2">Order failed</h1>
                            <p className="text-gray-500 mb-2 max-w-sm mx-auto">{errorMsg || 'Could not reach the server. Please try again.'}</p>
                            <p className="text-xs text-gray-400 mb-8">Check that the restaurant system is online and your internet connection is working.</p>
                            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleRetry}
                                    className="flex items-center justify-center gap-2 bg-rose-600 text-white px-8 py-3 rounded-2xl font-bold shadow-lg">
                                    <Wifi className="w-5 h-5" />Try Again
                                </motion.button>
                                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleBackToMenu}
                                    className="flex items-center justify-center gap-2 bg-white border border-gray-200 text-[#1B4332] px-8 py-3 rounded-2xl font-semibold">
                                    <Home className="w-5 h-5" />Back to Menu
                                </motion.button>
                            </div>
                        </motion.div>
                    )}

                    {/* ── Success ── */}
                    {status === 'success' && (
                        <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                            {/* Checkmark hero */}
                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.1, type: 'spring', stiffness: 200 }} className="text-center mb-8">
                                <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-green-400 to-green-600 rounded-full mb-6 shadow-2xl">
                                    <CheckCircle2 className="w-12 h-12 text-white" />
                                </div>
                                <h1 className="text-4xl font-bold text-[#1B4332] mb-2">Order Placed!</h1>
                                <p className="text-gray-600 text-lg">Your order is live in the kitchen 🍽️</p>
                            </motion.div>

                            {/* Order badge */}
                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-3xl p-6 shadow-lg mb-6">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Receipt className="w-6 h-6 text-[#D4AF37]" />
                                        <div>
                                            <p className="text-sm text-gray-600">Order #</p>
                                            <p className="text-2xl font-bold text-[#1B4332]">{orderNumber > 0 ? `#${orderNumber}` : `…${orderId.slice(-6)}`}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm text-gray-600">Items</p>
                                        <p className="text-2xl font-bold text-[#1B4332]">{receiptItemCount}</p>
                                    </div>
                                </div>
                            </motion.div>

                            {/* Live status strip */}
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-3 mb-6">
                                <span className="relative flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                                </span>
                                <p className="text-emerald-700 text-sm font-medium">Order is now visible on the kitchen dashboard</p>
                            </motion.div>

                            {/* Items list */}
                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-white rounded-3xl p-6 shadow-lg mb-6">
                                <h2 className="text-xl font-bold text-[#1B4332] mb-4">Your Order</h2>
                                <div className="space-y-3 mb-6">
                                    {receiptCart.length > 0 ? receiptCart.map((item, i) => (
                                        <motion.div key={item.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + i * 0.07 }}
                                            className="flex items-center gap-4 pb-3 border-b border-gray-100 last:border-0">
                                            <Image
                                                src={item.image}
                                                alt={`${item.name} in your confirmed order`}
                                                width={64}
                                                height={64}
                                                loading="lazy"
                                                quality={58}
                                                className="h-16 w-16 rounded-xl object-cover"
                                            />
                                            <div className="flex-1">
                                                <p className="font-semibold text-[#1B4332]">{item.name}</p>
                                                <p className="text-sm text-gray-500">× {item.quantity}</p>
                                            </div>
                                            <p className="font-bold text-[#1B4332]">{formatINR(item.price * item.quantity)}</p>
                                        </motion.div>
                                    )) : (
                                        <p className="text-gray-500 text-sm text-center py-4">Order submitted successfully</p>
                                    )}
                                </div>
                                <div className="pt-4 border-t-2 border-[#D4AF37]/30 space-y-2">
                                    <div className="flex justify-between text-sm"><span className="text-gray-600">Subtotal</span><span className="font-semibold">{formatINR(receiptTotal)}</span></div>
                                    <div className="flex justify-between text-sm"><span className="text-gray-600">Service Fee</span><span className="font-semibold">{formatINR(5)}</span></div>
                                    <div className="flex justify-between text-lg pt-2 border-t border-gray-200">
                                        <span className="font-bold text-[#1B4332]">Total</span>
                                        <span className="font-bold text-[#1B4332]">{formatINR(receiptTotal + 5)}</span>
                                    </div>
                                </div>
                            </motion.div>

                            {/* CTA */}
                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="space-y-3">
                                <motion.button onClick={handleBackToMenu} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                    className="w-full bg-gradient-to-r from-[#1B4332] to-[#2D5F4C] text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2">
                                    <Home className="w-5 h-5" />Order More
                                </motion.button>
                                <p className="text-center text-gray-500 text-sm">Staff will bring your order to {tableId ? `Table ${tableId}` : 'your table'}</p>
                            </motion.div>

                            {/* Thank you footer */}
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="text-center mt-8 p-6 bg-gradient-to-r from-[#D4AF37]/10 to-[#E8C96F]/10 rounded-3xl">
                                <p className="text-[#1B4332] font-semibold mb-1">Thank you for choosing us</p>
                                <p className="text-gray-500 text-sm">We hope you enjoy your dining experience 🌟</p>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    );
}

export default function CustomerOrderSummaryPage() {
    return <Suspense><OrderSummaryContent /></Suspense>;
}
