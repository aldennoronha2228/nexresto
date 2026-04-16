import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase-admin';

type SharedCartMutationBody = {
    restaurantId?: unknown;
    tableId?: unknown;
    item?: {
        id?: unknown;
        name?: unknown;
        description?: unknown;
        price?: unknown;
        image?: unknown;
        category?: unknown;
    };
    quantity?: unknown;
};

type SharedCartItem = {
    id: string;
    name: string;
    description: string;
    price: number;
    image: string;
    category: string;
    quantity: number;
};

function normalizeId(value: unknown): string {
    return String(value || '').trim();
}

function normalizeTableKey(value: unknown): string {
    return String(value || '').trim().toLowerCase();
}

function parseItems(raw: unknown): SharedCartItem[] {
    if (!Array.isArray(raw)) return [];

    return raw
        .map((entry) => {
            const row = (entry || {}) as Record<string, unknown>;
            return {
                id: String(row.id || '').trim(),
                name: String(row.name || '').trim(),
                description: String(row.description || '').trim(),
                price: Number(row.price || 0),
                image: String(row.image || '').trim(),
                category: String(row.category || 'Others').trim() || 'Others',
                quantity: Math.max(0, Math.floor(Number(row.quantity || 0))),
            };
        })
        .filter((item) => item.id && item.name && Number.isFinite(item.price) && item.price >= 0 && item.quantity > 0);
}

function getCartRef(restaurantId: string, tableKey: string) {
    return adminFirestore.doc(`restaurants/${restaurantId}/shared_carts/${tableKey}`);
}

export async function GET(request: NextRequest) {
    try {
        const restaurantId = normalizeId(request.nextUrl.searchParams.get('restaurantId'));
        const tableKey = normalizeTableKey(request.nextUrl.searchParams.get('tableId'));

        if (!restaurantId || !tableKey) {
            return NextResponse.json({ error: 'restaurantId and tableId are required' }, { status: 400 });
        }

        const snap = await getCartRef(restaurantId, tableKey).get();
        if (!snap.exists) {
            return NextResponse.json({ items: [] });
        }

        const data = (snap.data() || {}) as Record<string, unknown>;
        return NextResponse.json({ items: parseItems(data.items) });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to load shared cart';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as SharedCartMutationBody;
        const restaurantId = normalizeId(body.restaurantId);
        const tableKey = normalizeTableKey(body.tableId);

        if (!restaurantId || !tableKey) {
            return NextResponse.json({ error: 'restaurantId and tableId are required' }, { status: 400 });
        }

        const itemId = String(body.item?.id || '').trim();
        if (!itemId) {
            return NextResponse.json({ error: 'item.id is required' }, { status: 400 });
        }

        const quantity = Math.max(0, Math.floor(Number(body.quantity || 0)));
        const nextItem: SharedCartItem = {
            id: itemId,
            name: String(body.item?.name || '').trim().slice(0, 140),
            description: String(body.item?.description || '').trim().slice(0, 280),
            price: Math.max(0, Number(body.item?.price || 0)),
            image: String(body.item?.image || '').trim().slice(0, 500),
            category: String(body.item?.category || 'Others').trim().slice(0, 80) || 'Others',
            quantity,
        };

        const ref = getCartRef(restaurantId, tableKey);

        const updatedItems = await adminFirestore.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const data = (snap.data() || {}) as Record<string, unknown>;
            const existing = parseItems(data.items);

            const map = new Map(existing.map((item) => [item.id, item]));
            if (nextItem.quantity <= 0) {
                map.delete(nextItem.id);
            } else {
                map.set(nextItem.id, nextItem);
            }

            const items = Array.from(map.values());

            tx.set(
                ref,
                {
                    table_id: tableKey,
                    restaurant_id: restaurantId,
                    items,
                    updated_at: FieldValue.serverTimestamp(),
                },
                { merge: true }
            );

            return items;
        });

        return NextResponse.json({ items: updatedItems });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to update shared cart';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
