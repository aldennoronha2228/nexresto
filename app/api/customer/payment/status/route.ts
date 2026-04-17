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

        const participantMap = collectParticipantsFromCartItems((cartSnap.data() || {}).items);
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
        const isCompleted = Boolean((sessionSnap.data() || {}).isCompleted) || allPaid;

        if (allPaid && !Boolean((sessionSnap.data() || {}).isCompleted)) {
            await sessionRef.set(
                {
                    sessionId,
                    restaurantId: parsed.restaurantId,
                    tableKey: parsed.tableKey,
                    isCompleted: true,
                    completedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                },
                { merge: true }
            );
        }

        return NextResponse.json({
            sessionId,
            participants,
            payments: Array.from(paidBy.values()),
            allPaid,
            isCompleted,
            paymentEnabled,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unable to load payment status';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
