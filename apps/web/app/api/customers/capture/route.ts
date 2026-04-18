import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase-admin';

function normalizePhone(phone: string): string {
    return String(phone || '').replace(/\D/g, '').slice(-10);
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const restaurantId = String(body?.restaurantId || '').trim();
        const name = String(body?.name || '').trim().slice(0, 80);
        const phone = normalizePhone(body?.phone || '');
        const tableNumber = String(body?.tableNumber || '').trim().slice(0, 20);
        const incrementVisit = body?.incrementVisit !== false;

        if (!restaurantId) {
            return NextResponse.json({ error: 'Missing restaurantId' }, { status: 400 });
        }

        if (name.length < 2) {
            return NextResponse.json({ error: 'Please enter a valid name' }, { status: 400 });
        }

        if (!/^\d{10}$/.test(phone)) {
            return NextResponse.json({ error: 'Please enter a valid 10-digit phone number' }, { status: 400 });
        }

        const restaurantRef = adminFirestore.doc(`restaurants/${restaurantId}`);
        const restaurantSnap = await restaurantRef.get();
        if (!restaurantSnap.exists) {
            return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
        }

        const customerRef = adminFirestore.doc(`restaurants/${restaurantId}/customers/${phone}`);

        const updated = await adminFirestore.runTransaction(async (tx) => {
            const snap = await tx.get(customerRef);
            const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};
            const existingVisitCount = Number(data.visitCount || 0);
            const existingSpend = Number(data.totalSpend || 0);
            const existingOrders = Array.isArray(data.orders) ? data.orders : [];

            const visitCount = snap.exists
                ? (incrementVisit ? existingVisitCount + 1 : Math.max(existingVisitCount, 1))
                : 1;

            tx.set(
                customerRef,
                {
                    name,
                    phone,
                    lastTableNumber: tableNumber || null,
                    visitCount,
                    orders: existingOrders,
                    totalSpend: existingSpend,
                    lastVisited: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                },
                { merge: true }
            );

            return { name, phone, visitCount };
        });

        return NextResponse.json(updated);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not capture customer';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
