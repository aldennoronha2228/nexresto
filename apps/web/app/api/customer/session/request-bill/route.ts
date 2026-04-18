import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase-admin';

type RequestBillBody = {
    sessionId?: unknown;
    restaurantId?: unknown;
    tableId?: unknown;
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

function parseItems(raw: unknown): SessionBillItem[] {
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

function mergeItems(existing: SessionBillItem[], incoming: SessionBillItem[]): SessionBillItem[] {
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
            const prev = contributorMap.get(cKey);
            if (prev) prev.quantity += c.quantity;
            else contributorMap.set(cKey, { ...c });
        }
        current.contributors = Array.from(contributorMap.values());
    };

    existing.forEach(upsert);
    incoming.forEach(upsert);
    return Array.from(merged.values());
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json().catch(() => ({}))) as RequestBillBody;

        const sessionParsed = parseSessionId(clean(body.sessionId));
        const restaurantId = clean(body.restaurantId || sessionParsed?.restaurantId);
        const tableKey = normalizeTableKey(body.tableId || sessionParsed?.tableKey);

        if (!restaurantId || !tableKey) {
            return NextResponse.json({ error: 'sessionId/restaurantId/tableId are required' }, { status: 400 });
        }

        const sessionRef = adminFirestore.doc(`restaurants/${restaurantId}/table_payment_sessions/${tableKey}`);
        const cartRef = adminFirestore.doc(`restaurants/${restaurantId}/shared_carts/${tableKey}`);
        const [sessionSnap, cartSnap] = await Promise.all([sessionRef.get(), cartRef.get()]);
        const current = (sessionSnap.data() || {}) as Record<string, unknown>;
        const cartData = (cartSnap.data() || {}) as Record<string, unknown>;

        const currentStatus = clean(current.status) || (Boolean(current.isCompleted) ? 'completed' : 'active');

        if (currentStatus === 'billing') {
            return NextResponse.json({ error: 'Bill has already been requested', status: 'billing' }, { status: 409 });
        }

        if (currentStatus === 'completed') {
            return NextResponse.json({ error: 'Session already completed', status: 'completed' }, { status: 409 });
        }

        const existingBillItems = parseItems((current as { billed_items?: unknown }).billed_items);
        const pendingCartItems = parseItems(cartData.items);
        const mergedItems = mergeItems(existingBillItems, pendingCartItems);
        const billedTotal = mergedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

        const batch = adminFirestore.batch();
        batch.set(
            sessionRef,
            {
                sessionId: `${restaurantId}::${tableKey}`,
                restaurantId,
                tableKey,
                tableId: tableKey,
                status: 'billing',
                billed_items: mergedItems,
                billed_total: billedTotal,
                billRequestedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
        );

        batch.set(
            cartRef,
            {
                items: [],
                updated_at: FieldValue.serverTimestamp(),
                cleared_at: FieldValue.serverTimestamp(),
            },
            { merge: true }
        );

        await batch.commit();

        return NextResponse.json({ success: true, status: 'billing' });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unable to request bill';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
