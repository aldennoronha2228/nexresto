/**
 * lib/firebase-submit-order.ts
 * ---------------------------------
 * Customer-facing order submission using Firestore.
 * Replaces lib/submitOrder.ts.
 *
 * Orders are stored as:
 *   restaurants/{restaurantId}/orders/{auto-id}
 *
 * Items are embedded as an array in the order document (denormalized)
 * since Firestore doesn't support cross-collection joins.
 */

import { collection, addDoc, serverTimestamp, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { validateOrderPayload } from './validate';
import { securityLog } from './logger';
import { env } from './env';
import type { CartItem } from '@/context/CartContext';

export interface SubmitOrderResult {
    orderId: string;
    dailyOrderNumber: number;
}

export async function submitOrderToFirestore(
    cartItems: CartItem[],
    tableId: string,
    total: number,
    restaurantIdOverride?: string
): Promise<SubmitOrderResult> {
    const restaurantId = restaurantIdOverride ?? env.restaurantId;

    // ── Step 1: Validate all inputs before touching the database ─────────────
    const validation = validateOrderPayload({
        tableId,
        restaurantId,
        items: cartItems.map(i => ({
            id: i.id,
            name: i.name,
            quantity: i.quantity,
            price: i.price,
        })),
        total,
    });

    if (!validation.ok) {
        securityLog.warn('INPUT_VALIDATION_FAILED', { context: 'submitOrder', error: validation.error });
        throw new Error(`Invalid order data: ${validation.error}`);
    }

    const payload = validation.data!;

    // ── Step 2: Calculate daily order number ──────────────────────────────────
    // Count today's orders for this restaurant to generate a sequential number
    let dailyOrderNumber = 1;
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = Timestamp.fromDate(today);

        const ordersRef = collection(db, 'restaurants', payload.restaurantId, 'orders');
        const todayQuery = query(
            ordersRef,
            where('created_at', '>=', todayTimestamp)
        );
        const snapshot = await getDocs(todayQuery);
        dailyOrderNumber = snapshot.size + 1;
    } catch {
        // Non-critical, use default
    }

    // ── Step 3: Insert order document with embedded items ─────────────────────
    const orderItems = payload.items.map((item) => ({
        menu_item_id: null,
        item_name: item.name.slice(0, 200),
        item_price: item.price,
        quantity: item.quantity,
    }));

    const ordersRef = collection(db, 'restaurants', payload.restaurantId, 'orders');
    const orderDocRef = await addDoc(ordersRef, {
        table_number: payload.tableId,
        total: payload.total,
        status: 'new',
        daily_order_number: dailyOrderNumber,
        items: orderItems,
        created_at: serverTimestamp(),
    });

    securityLog.info('ORDER_SUBMITTED', {
        ok: true,
        orderId: orderDocRef.id,
        table: payload.tableId,
        total: payload.total,
    });

    return {
        orderId: orderDocRef.id,
        dailyOrderNumber,
    };
}
