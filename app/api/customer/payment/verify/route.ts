import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase-admin';
import { decrypt } from '@/lib/crypto';

type VerifyBody = {
    paymentId?: unknown;
    razorpay_order_id?: unknown;
    razorpay_payment_id?: unknown;
    razorpay_signature?: unknown;
};

function clean(value: unknown): string {
    return String(value || '').trim();
}

function secureCompare(a: string, b: string): boolean {
    const aBuffer = Buffer.from(a, 'utf8');
    const bBuffer = Buffer.from(b, 'utf8');
    if (aBuffer.length !== bBuffer.length) return false;
    return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function parseSessionId(raw: string): { restaurantId: string; tableKey: string } | null {
    const [restaurantId, tablePart] = raw.split('::');
    const normalizedRestaurantId = clean(restaurantId);
    const normalizedTableKey = clean(tablePart).toLowerCase();
    if (!normalizedRestaurantId || !normalizedTableKey) return null;
    return {
        restaurantId: normalizedRestaurantId,
        tableKey: normalizedTableKey,
    };
}

function getContributorsFromItems(items: unknown): string[] {
    if (!Array.isArray(items)) return [];

    const ids = new Set<string>();
    for (const entry of items) {
        const row = (entry || {}) as Record<string, unknown>;
        const contributors = Array.isArray(row.contributors) ? row.contributors : [];
        for (const contributor of contributors) {
            const c = (contributor || {}) as Record<string, unknown>;
            const name = clean(c.name).toLowerCase();
            const phone = clean(c.phone);
            const quantity = Math.max(0, Math.floor(Number(c.quantity || 0)));
            if (!name || quantity <= 0) continue;
            ids.add(`${name}|${phone}`);
        }
    }
    return Array.from(ids);
}

async function markSessionCompletedIfAllPaid(restaurantId: string, tableKey: string, sessionId: string): Promise<boolean> {
    const cartRef = adminFirestore.doc(`restaurants/${restaurantId}/shared_carts/${tableKey}`);
    const sessionRef = adminFirestore.doc(`restaurants/${restaurantId}/table_payment_sessions/${tableKey}`);

    const [cartSnap, paidSnap] = await Promise.all([
        cartRef.get(),
        adminFirestore
            .collection(`restaurants/${restaurantId}/table_payment_sessions/${tableKey}/payments`)
            .where('sessionId', '==', sessionId)
            .where('status', '==', 'paid')
            .get(),
    ]);

    const participantIds = getContributorsFromItems((cartSnap.data() || {}).items);
    const paidBy = new Set<string>();
    paidSnap.forEach((doc) => {
        const row = (doc.data() || {}) as Record<string, unknown>;
        const guestId = clean(row.guestId).toLowerCase();
        if (guestId) paidBy.add(guestId);
    });

    const allPaid = participantIds.length > 0 && participantIds.every((id) => paidBy.has(id));

    if (allPaid) {
        await sessionRef.set(
            {
                isCompleted: true,
                completedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
        );
    }

    return allPaid;
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json().catch(() => ({}))) as VerifyBody;

        const paymentId = clean(body.paymentId);
        const razorpayOrderId = clean(body.razorpay_order_id);
        const razorpayPaymentId = clean(body.razorpay_payment_id);
        const razorpaySignature = clean(body.razorpay_signature);

        if (!paymentId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
            return NextResponse.json({ error: 'Missing payment verification fields' }, { status: 400 });
        }

        // Locate payment document by collection-group lookup.
        const paymentQuery = await adminFirestore
            .collectionGroup('payments')
            .where('paymentId', '==', paymentId)
            .limit(1)
            .get();

        if (paymentQuery.empty) {
            return NextResponse.json({ error: 'Payment record not found' }, { status: 404 });
        }

        const paymentDoc = paymentQuery.docs[0];
        const paymentData = (paymentDoc.data() || {}) as Record<string, unknown>;

        if (clean(paymentData.status) === 'paid') {
            return NextResponse.json({ success: true, alreadyPaid: true });
        }

        const sessionId = clean(paymentData.sessionId);
        const parsedSession = parseSessionId(sessionId);
        if (!parsedSession) {
            return NextResponse.json({ error: 'Invalid payment session' }, { status: 400 });
        }

        if (clean(paymentData.razorpayOrderId) !== razorpayOrderId) {
            return NextResponse.json({ error: 'Order mismatch for this payment' }, { status: 400 });
        }

        const restaurantSnap = await adminFirestore.doc(`restaurants/${parsedSession.restaurantId}`).get();
        if (!restaurantSnap.exists) {
            return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
        }

        const restaurantData = (restaurantSnap.data() || {}) as Record<string, unknown>;
        const encryptedSecret = clean(restaurantData.razorpayKeySecret);
        if (!encryptedSecret) {
            return NextResponse.json({ error: 'Restaurant payment secret missing' }, { status: 500 });
        }

        let razorpaySecret = '';
        try {
            razorpaySecret = decrypt(encryptedSecret);
        } catch {
            return NextResponse.json({ error: 'Restaurant payment secret invalid' }, { status: 500 });
        }

        const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
        const expectedSignature = crypto.createHmac('sha256', razorpaySecret).update(payload).digest('hex');

        if (!secureCompare(expectedSignature, razorpaySignature)) {
            await paymentDoc.ref.set(
                {
                    status: 'failed',
                    failureReason: 'invalid_signature',
                    updatedAt: FieldValue.serverTimestamp(),
                },
                { merge: true }
            );
            return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
        }

        await paymentDoc.ref.set(
            {
                status: 'paid',
                razorpayPaymentId,
                razorpaySignature,
                paidAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
        );

        const allPaid = await markSessionCompletedIfAllPaid(parsedSession.restaurantId, parsedSession.tableKey, sessionId);

        return NextResponse.json({
            success: true,
            paymentId,
            allPaid,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unable to verify customer payment';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
