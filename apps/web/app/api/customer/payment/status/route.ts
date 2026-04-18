import { NextRequest, NextResponse } from 'next/server';
import { adminFirestore } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

type ParticipantStatus = {
    guestId: string;
    name: string;
    paid: boolean;
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

function collectParticipantsFromCartItems(items: unknown): Map<string, string> {
    const participants = new Map<string, string>();
    if (!Array.isArray(items)) return participants;

    for (const row of items) {
        const item = (row || {}) as Record<string, unknown>;
        const contributors = Array.isArray(item.contributors) ? item.contributors : [];

        for (const c of contributors) {
            const contributor = (c || {}) as Record<string, unknown>;
            const name = clean(contributor.name) || 'Guest';
            const phone = clean(contributor.phone);
            const quantity = Math.max(0, Math.floor(Number(contributor.quantity || 0)));
            if (quantity <= 0) continue;

            const guestId = `${name.toLowerCase()}|${phone}`;
            if (!participants.has(guestId)) {
                participants.set(guestId, name);
            }
        }
    }

    return participants;
}

function parseBillItems(raw: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(raw)) return [];
    return raw.filter((entry) => !!entry && typeof entry === 'object') as Array<Record<string, unknown>>;
}

export async function GET(request: NextRequest) {
    try {
        const sessionId = clean(request.nextUrl.searchParams.get('sessionId'));
        if (!sessionId) {
            return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
        }

        const parsed = parseSessionId(sessionId);
        if (!parsed) {
            return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 });
        }

        const sessionRef = adminFirestore.doc(`restaurants/${parsed.restaurantId}/table_payment_sessions/${parsed.tableKey}`);
        const cartRef = adminFirestore.doc(`restaurants/${parsed.restaurantId}/shared_carts/${parsed.tableKey}`);
        const restaurantRef = adminFirestore.doc(`restaurants/${parsed.restaurantId}`);

        const [sessionSnap, cartSnap, restaurantSnap, paymentsSnap] = await Promise.all([
            sessionRef.get(),
            cartRef.get(),
            restaurantRef.get(),
            adminFirestore
                .collection(`restaurants/${parsed.restaurantId}/table_payment_sessions/${parsed.tableKey}/payments`)
                .where('sessionId', '==', sessionId)
                .get(),
        ]);

        const cartItems = parseBillItems((cartSnap.data() || {}).items);
        const sessionData = (sessionSnap.data() || {}) as Record<string, unknown>;
        const billedItems = parseBillItems(sessionData.billed_items);
        const sourceItems = billedItems.length > 0 ? billedItems : cartItems;

        const participantMap = collectParticipantsFromCartItems(sourceItems);
        const paidBy = new Set<string>();

        paymentsSnap.forEach((doc) => {
            const row = (doc.data() || {}) as Record<string, unknown>;
            const guestId = clean(row.guestId).toLowerCase();
            const guestName = clean(row.guestName) || 'Guest';
            const status = clean(row.status);
            if (guestId && !participantMap.has(guestId)) {
                participantMap.set(guestId, guestName);
            }
            if (guestId && status === 'paid') {
                paidBy.add(guestId);
            }
        });

        const participants: ParticipantStatus[] = Array.from(participantMap.entries()).map(([guestId, name]) => ({
            guestId,
            name,
            paid: paidBy.has(guestId),
        }));

        const restaurantData = (restaurantSnap.data() || {}) as Record<string, unknown>;
        const paymentEnabled = Boolean(restaurantData.isPaymentConnected);

        const allPaid = participants.length > 0 && participants.every((participant) => participant.paid);

        const computedBillTotal = sourceItems.reduce((sum, item) => {
            const price = Number(item.price || 0);
            const quantity = Math.max(0, Math.floor(Number(item.quantity || 0)));
            if (!Number.isFinite(price) || quantity <= 0) return sum;
            return sum + price * quantity;
        }, 0);
        const sessionBilledTotal = Number(sessionData.billed_total || 0);
        const billTotal = computedBillTotal > 0
            ? computedBillTotal
            : (Number.isFinite(sessionBilledTotal) && sessionBilledTotal > 0 ? sessionBilledTotal : 0);

        const currentStatus = clean(sessionData.status) || (Boolean(sessionData.isCompleted) ? 'completed' : 'active');
        if (currentStatus === 'billing' && billedItems.length === 0 && billTotal <= 0) {
            await sessionRef.set(
                {
                    sessionId,
                    restaurantId: parsed.restaurantId,
                    tableKey: parsed.tableKey,
                    status: 'active',
                    updatedAt: FieldValue.serverTimestamp(),
                },
                { merge: true }
            );

            return NextResponse.json({
                sessionId,
                status: 'active',
                participants,
                payments: Array.from(paidBy.values()),
                allPaid: false,
                isCompleted: false,
                paymentEnabled,
                billItems: cartItems,
                billTotal: 0,
            });
        }

        const isCompleted = currentStatus === 'completed' || Boolean(sessionData.isCompleted) || allPaid;

        if (allPaid && !Boolean((sessionSnap.data() || {}).isCompleted)) {
            await sessionRef.set(
                {
                    sessionId,
                    restaurantId: parsed.restaurantId,
                    tableKey: parsed.tableKey,
                    status: 'completed',
                    isCompleted: true,
                    completedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                },
                { merge: true }
            );

            // Best-effort table release marker.
            await adminFirestore
                .doc(`restaurants/${parsed.restaurantId}/tables/${parsed.tableKey}`)
                .set(
                    {
                        status: 'free',
                        updated_at: FieldValue.serverTimestamp(),
                    },
                    { merge: true }
                )
                .catch(() => { });
        }

        return NextResponse.json({
            sessionId,
            status: allPaid ? 'completed' : currentStatus,
            participants,
            payments: Array.from(paidBy.values()),
            allPaid,
            isCompleted,
            paymentEnabled,
            billItems: sourceItems,
            billTotal,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unable to load payment status';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
