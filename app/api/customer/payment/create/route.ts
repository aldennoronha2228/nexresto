import { randomUUID, createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase-admin';
import { decrypt } from '@/lib/crypto';

type CreatePaymentBody = {
    sessionId?: unknown;
    restaurantId?: unknown;
    tableId?: unknown;
    guestId?: unknown;
    guestName?: unknown;
    amount?: unknown;
    mode?: unknown;
};

function clean(value: unknown): string {
    return String(value || '').trim();
}

function normalizeTableKey(value: unknown): string {
    return clean(value).toLowerCase();
}

function parseSessionId(raw: string): { restaurantId: string; tableKey: string } | null {
    const [restaurantId, tablePart] = raw.split('::');
    const normalizedRestaurantId = clean(restaurantId);
    const normalizedTableKey = normalizeTableKey(tablePart);
    if (!normalizedRestaurantId || !normalizedTableKey) return null;
    return {
        restaurantId: normalizedRestaurantId,
        tableKey: normalizedTableKey,
    };
}

function buildSessionId(restaurantId: string, tableKey: string): string {
    return `${restaurantId}::${tableKey}`;
}

function toPositiveAmountPaise(amountInr: unknown): number {
    const inr = Number(amountInr);
    if (!Number.isFinite(inr)) return 0;
    const paise = Math.round(inr * 100);
    return paise > 0 ? paise : 0;
}

function toSafeGuestName(value: unknown): string {
    const raw = clean(value);
    return raw ? raw.slice(0, 80) : 'Guest';
}

function getSessionRef(restaurantId: string, tableKey: string) {
    return adminFirestore.doc(`restaurants/${restaurantId}/table_payment_sessions/${tableKey}`);
}

function parseBilledItems(raw: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(raw)) return [];
    return raw.filter((entry) => !!entry && typeof entry === 'object') as Array<Record<string, unknown>>;
}

function computeBillTotalInr(items: Array<Record<string, unknown>>, fallbackTotal: unknown): number {
    if (items.length > 0) {
        return items.reduce((sum, item) => {
            const price = Number(item.price || 0);
            const quantity = Math.max(0, Math.floor(Number(item.quantity || 0)));
            if (!Number.isFinite(price) || quantity <= 0) return sum;
            return sum + price * quantity;
        }, 0);
    }

    const fallback = Number(fallbackTotal || 0);
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json().catch(() => ({}))) as CreatePaymentBody;

        const rawSessionId = clean(body.sessionId);
        const sessionFromId = rawSessionId ? parseSessionId(rawSessionId) : null;

        const restaurantId = clean(body.restaurantId || sessionFromId?.restaurantId);
        const tableKey = normalizeTableKey(body.tableId || sessionFromId?.tableKey);
        const sessionId = buildSessionId(restaurantId, tableKey);

        const guestId = clean(body.guestId).slice(0, 120);
        const guestName = toSafeGuestName(body.guestName);
        const mode = clean(body.mode).slice(0, 40) || 'split_equally';
        const amountPaise = toPositiveAmountPaise(body.amount);

        if (!restaurantId || !tableKey || !guestId || amountPaise <= 0) {
            return NextResponse.json({ error: 'sessionId/restaurantId/tableId, guestId and amount are required' }, { status: 400 });
        }

        const restaurantRef = adminFirestore.doc(`restaurants/${restaurantId}`);
        const restaurantSnap = await restaurantRef.get();
        if (!restaurantSnap.exists) {
            return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
        }

        const restaurantData = (restaurantSnap.data() || {}) as Record<string, unknown>;
        const paymentConnected = Boolean(restaurantData.isPaymentConnected);
        if (!paymentConnected) {
            return NextResponse.json({ error: 'Payments are currently disabled by the restaurant' }, { status: 403 });
        }

        const razorpayKeyId = clean(restaurantData.razorpayKeyId);
        const encryptedSecret = clean(restaurantData.razorpayKeySecret);
        if (!razorpayKeyId || !encryptedSecret) {
            return NextResponse.json({ error: 'Restaurant payment keys are not configured' }, { status: 500 });
        }

        let razorpaySecret = '';
        try {
            razorpaySecret = decrypt(encryptedSecret);
        } catch {
            return NextResponse.json({ error: 'Restaurant payment keys are invalid' }, { status: 500 });
        }

        const sessionRef = getSessionRef(restaurantId, tableKey);
        const sessionSnap = await sessionRef.get();
        const sessionData = (sessionSnap.data() || {}) as Record<string, unknown>;
        const sessionStatus = clean(sessionData.status) || (Boolean(sessionData.isCompleted) ? 'completed' : 'active');

        if (sessionStatus !== 'billing') {
            return NextResponse.json({ error: 'Bill must be requested before payment', status: sessionStatus }, { status: 409 });
        }

        const billedItems = parseBilledItems(sessionData.billed_items);
        const billedTotalInr = computeBillTotalInr(billedItems, sessionData.billed_total);
        const billedTotalPaise = Math.round(billedTotalInr * 100);

        if (billedTotalPaise <= 0) {
            return NextResponse.json({ error: 'No bill amount found for this table session' }, { status: 409 });
        }

        const paidSnapshot = await adminFirestore
            .collection(`restaurants/${restaurantId}/table_payment_sessions/${tableKey}/payments`)
            .where('sessionId', '==', sessionId)
            .where('status', '==', 'paid')
            .get();

        const paidPaise = paidSnapshot.docs.reduce((sum, doc) => {
            const row = (doc.data() || {}) as Record<string, unknown>;
            const value = Number(row.amountPaise || 0);
            return sum + (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
        }, 0);

        const remainingPaise = Math.max(0, billedTotalPaise - paidPaise);
        if (remainingPaise <= 0) {
            return NextResponse.json({ error: 'This bill is already settled' }, { status: 409 });
        }

        if (amountPaise > remainingPaise) {
            return NextResponse.json(
                {
                    error: 'Requested payment exceeds pending amount',
                    pendingAmountInr: Number((remainingPaise / 100).toFixed(2)),
                },
                { status: 409 }
            );
        }

        const alreadyPaid = await adminFirestore
            .collection(`restaurants/${restaurantId}/table_payment_sessions/${tableKey}/payments`)
            .where('sessionId', '==', sessionId)
            .where('guestId', '==', guestId)
            .where('status', '==', 'paid')
            .limit(1)
            .get();

        if (!alreadyPaid.empty) {
            return NextResponse.json({ error: 'You have already paid for this table session' }, { status: 409 });
        }

        const paymentId = randomUUID();
        const receiptHash = createHash('sha1').update(`${sessionId}:${guestId}:${Date.now()}`).digest('hex').slice(0, 10);
        const receipt = `nx_${tableKey.slice(0, 12)}_${receiptHash}`;

        const orderResponse = await fetch('https://api.razorpay.com/v1/orders', {
            method: 'POST',
            headers: {
                Authorization: `Basic ${Buffer.from(`${razorpayKeyId}:${razorpaySecret}`).toString('base64')}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                amount: amountPaise,
                currency: 'INR',
                receipt,
                notes: {
                    paymentId,
                    sessionId,
                    guestId,
                    tableKey,
                    mode,
                },
            }),
            cache: 'no-store',
        });

        const orderPayload = (await orderResponse.json().catch(() => ({}))) as Record<string, unknown>;
        if (!orderResponse.ok) {
            const errorMessage =
                typeof orderPayload?.error === 'object' && orderPayload.error && 'description' in orderPayload.error
                    ? String((orderPayload.error as { description?: string }).description || 'Failed to create payment order')
                    : 'Failed to create payment order';
            return NextResponse.json({ error: errorMessage }, { status: orderResponse.status || 502 });
        }

        const orderId = clean(orderPayload.id);
        if (!orderId) {
            return NextResponse.json({ error: 'Invalid payment order response' }, { status: 502 });
        }

        const paymentRef = adminFirestore.doc(`restaurants/${restaurantId}/table_payment_sessions/${tableKey}/payments/${paymentId}`);
        await paymentRef.set({
            paymentId,
            sessionId,
            restaurantId,
            tableKey,
            guestId,
            guestName,
            amountPaise,
            amountInr: amountPaise / 100,
            mode,
            status: 'created',
            razorpayOrderId: orderId,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });

        await sessionRef.set(
            {
                sessionId,
                restaurantId,
                tableKey,
                tableId: tableKey,
                status: 'billing',
                isCompleted: false,
                updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
        );

        return NextResponse.json({
            paymentId,
            order: orderPayload,
            keyId: razorpayKeyId,
            restaurant: {
                name: clean(restaurantData.name) || 'Restaurant',
            },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unable to create customer payment';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
