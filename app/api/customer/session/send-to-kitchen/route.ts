import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase-admin';

type SendToKitchenBody = {
    sessionId?: unknown;
    restaurantId?: unknown;
    tableId?: unknown;
    customer?: {
        name?: unknown;
        phone?: unknown;
    };
};

type SessionBillItem = {
    id: string;
    name: string;
    description: string;
    price: number;
    image: string;
    category: string;
    quantity: number;
    contributors?: Array<{ name: string; phone: string; quantity: number }>;
};

function clean(value: unknown): string {
    return String(value || '').trim();
}

function normalizeTableKey(value: unknown): string {
    return clean(value).toLowerCase();
}

function normalizePhone(phone: unknown): string {
    return String(phone || '').replace(/\D/g, '').slice(-10);
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

function parseSharedItems(raw: unknown): SessionBillItem[] {
    if (!Array.isArray(raw)) return [];

    return raw
        .map((entry) => {
            const row = (entry || {}) as Record<string, unknown>;
            return {
                id: clean(row.id),
                name: clean(row.name),
                description: clean(row.description),
                price: Number(row.price || 0),
                image: clean(row.image),
                category: clean(row.category) || 'Others',
                quantity: Math.max(0, Math.floor(Number(row.quantity || 0))),
                contributors: Array.isArray(row.contributors)
                    ? row.contributors
                        .map((c) => ({
                            name: clean((c as Record<string, unknown>).name),
                            phone: clean((c as Record<string, unknown>).phone),
                            quantity: Math.max(0, Math.floor(Number((c as Record<string, unknown>).quantity || 0))),
                        }))
                        .filter((c) => c.name && c.quantity > 0)
                    : [],
            };
        })
        .filter((item) => item.id && item.name && Number.isFinite(item.price) && item.price >= 0 && item.quantity > 0);
}

function mergeBillItems(existing: SessionBillItem[], incoming: SessionBillItem[]): SessionBillItem[] {
    const merged = new Map<string, SessionBillItem>();

    const upsert = (item: SessionBillItem) => {
        const key = `${item.id}::${item.price}`;
        const current = merged.get(key);
        if (!current) {
            merged.set(key, {
                ...item,
                contributors: [...(item.contributors || [])],
            });
            return;
        }

        current.quantity += item.quantity;

        const contributorMap = new Map<string, { name: string; phone: string; quantity: number }>();
        for (const c of current.contributors || []) {
            const cKey = `${c.name.toLowerCase()}|${c.phone}`;
            contributorMap.set(cKey, { ...c });
        }
        for (const c of item.contributors || []) {
            const cKey = `${c.name.toLowerCase()}|${c.phone}`;
            const previous = contributorMap.get(cKey);
            if (previous) previous.quantity += c.quantity;
            else contributorMap.set(cKey, { ...c });
        }

        current.contributors = Array.from(contributorMap.values());
    };

    existing.forEach(upsert);
    incoming.forEach(upsert);

    return Array.from(merged.values());
}

function computeDailyOrderNumberFromSnap(snap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>): number {
    return snap.size + 1;
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json().catch(() => ({}))) as SendToKitchenBody;

        const sessionParsed = parseSessionId(clean(body.sessionId));
        const restaurantId = clean(body.restaurantId || sessionParsed?.restaurantId);
        const tableKey = normalizeTableKey(body.tableId || sessionParsed?.tableKey);

        if (!restaurantId || !tableKey) {
            return NextResponse.json({ error: 'sessionId/restaurantId/tableId are required' }, { status: 400 });
        }

        const sessionId = `${restaurantId}::${tableKey}`;
        const sessionRef = adminFirestore.doc(`restaurants/${restaurantId}/table_payment_sessions/${tableKey}`);
        const cartRef = adminFirestore.doc(`restaurants/${restaurantId}/shared_carts/${tableKey}`);
        const ordersCollection = adminFirestore.collection(`restaurants/${restaurantId}/orders`);

        const [sessionSnap, cartSnap] = await Promise.all([sessionRef.get(), cartRef.get()]);

        const sessionData = (sessionSnap.data() || {}) as Record<string, unknown>;
        const status = clean(sessionData.status) || (Boolean(sessionData.isCompleted) ? 'completed' : 'active');
        if (status !== 'active') {
            return NextResponse.json({ error: 'Session is not active for kitchen dispatch', status }, { status: 409 });
        }

        const cartData = (cartSnap.data() || {}) as Record<string, unknown>;
        const batchItems = parseSharedItems(cartData.items);
        if (batchItems.length === 0) {
            return NextResponse.json({ error: 'No items to send to kitchen' }, { status: 400 });
        }

        let dailyOrderNumber = 1;
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayTimestamp = Timestamp.fromDate(today);
            const countSnap = await ordersCollection.where('created_at', '>=', todayTimestamp).get();
            dailyOrderNumber = computeDailyOrderNumberFromSnap(countSnap);
        } catch {
            // best effort
        }

        const total = batchItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const customerName = clean(body.customer?.name).slice(0, 80);
        const customerPhone = normalizePhone(body.customer?.phone);

        const orderRef = await ordersCollection.add({
            table_number: tableKey,
            total,
            status: 'new',
            daily_order_number: dailyOrderNumber,
            customer_name: customerName || null,
            customer_phone: /^\d{10}$/.test(customerPhone) ? customerPhone : null,
            items: batchItems.map((item) => ({
                menu_item_id: null,
                item_name: item.name,
                item_price: item.price,
                quantity: item.quantity,
            })),
            created_at: FieldValue.serverTimestamp(),
        });

        const existingBillItems = parseSharedItems((sessionData as { billed_items?: unknown }).billed_items);
        const mergedBillItems = mergeBillItems(existingBillItems, batchItems);
        const billedTotal = mergedBillItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

        const batchRef = adminFirestore.collection(`restaurants/${restaurantId}/table_payment_sessions/${tableKey}/kitchen_batches`).doc();

        const writeBatch = adminFirestore.batch();
        writeBatch.set(
            sessionRef,
            {
                sessionId,
                restaurantId,
                tableKey,
                tableId: tableKey,
                status: 'active',
                isCompleted: false,
                billed_items: mergedBillItems,
                billed_total: billedTotal,
                kitchen_batch_count: Number(sessionData.kitchen_batch_count || 0) + 1,
                updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
        );

        writeBatch.set(batchRef, {
            sessionId,
            orderId: orderRef.id,
            items: batchItems,
            total,
            createdAt: FieldValue.serverTimestamp(),
        });

        writeBatch.set(
            cartRef,
            {
                items: [],
                updated_at: FieldValue.serverTimestamp(),
                cleared_at: FieldValue.serverTimestamp(),
            },
            { merge: true }
        );

        await writeBatch.commit();

        return NextResponse.json({
            success: true,
            sessionId,
            orderId: orderRef.id,
            dailyOrderNumber,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unable to send items to kitchen';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
