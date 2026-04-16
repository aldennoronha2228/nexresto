/**
 * lib/firebase-submit-order.ts
 * ---------------------------------
 * Customer-facing order submission through the backend API.
 */

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
    restaurantIdOverride?: string,
    customer?: { name: string; phone: string },
    options?: { sharedTableContext?: boolean }
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

    const response = await fetch('/api/order/place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            tableId: payload.tableId,
            total: payload.total,
            restaurantId: payload.restaurantId,
            items: payload.items,
            sharedTableContext: options?.sharedTableContext === true,
            customer: customer
                ? {
                    name: customer.name,
                    phone: customer.phone,
                }
                : undefined,
        }),
    });

    const body = await response.json().catch(() => ({} as Record<string, unknown>));
    if (!response.ok) {
        const code = typeof body?.code === 'string' ? body.code : '';
        const message = typeof body?.error === 'string' ? body.error : 'Could not submit order';
        if (code) {
            throw new Error(`${code}: ${message}`);
        }
        throw new Error(message);
    }

    const orderId = typeof body?.orderId === 'string' ? body.orderId : '';
    const dailyOrderNumber = Number(body?.dailyOrderNumber || 0);
    if (!orderId || !Number.isFinite(dailyOrderNumber) || dailyOrderNumber <= 0) {
        throw new Error('Order response is invalid');
    }

    securityLog.info('ORDER_SUBMITTED', {
        ok: true,
        orderId,
        table: payload.tableId,
        total: payload.total,
    });

    return {
        orderId,
        dailyOrderNumber,
    };
}
