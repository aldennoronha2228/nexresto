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
    actor?: {
        name?: unknown;
        phone?: unknown;
    };
};

type SharedCartContributor = {
    name: string;
    phone: string;
    quantity: number;
};

type SharedCartItem = {
    id: string;
    name: string;
    description: string;
    price: number;
    image: string;
    category: string;
    quantity: number;
    contributors?: SharedCartContributor[];
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
                contributors: Array.isArray(row.contributors)
                    ? (row.contributors as Array<Record<string, unknown>>)
                        .map((c) => ({
                            name: String(c.name || '').trim().slice(0, 80),
                            phone: String(c.phone || '').trim().slice(0, 20),
                            quantity: Math.max(0, Math.floor(Number(c.quantity || 0))),
                        }))
                        .filter((c) => c.name && c.quantity > 0)
                    : [],
            };
        })
        .filter((item) => item.id && item.name && Number.isFinite(item.price) && item.price >= 0 && item.quantity > 0);
}

function normalizeActor(raw: SharedCartMutationBody['actor']): { name: string; phone: string } | null {
    if (!raw) return null;
    const name = String(raw.name || '').trim().slice(0, 80);
    const phone = String(raw.phone || '').trim().slice(0, 20);
    if (!name) return null;
    return { name, phone };
}

function applyContributorDelta(
    existing: SharedCartContributor[],
    actor: { name: string; phone: string } | null,
    delta: number,
    nextQuantity: number
): SharedCartContributor[] {
    const contributors = [...existing];

    if (delta > 0 && actor) {
        const idx = contributors.findIndex((c) => c.name === actor.name && c.phone === actor.phone);
        if (idx >= 0) {
            contributors[idx] = {
                ...contributors[idx],
                quantity: contributors[idx].quantity + delta,
            };
        } else {
            contributors.push({ name: actor.name, phone: actor.phone, quantity: delta });
        }
    }

    if (delta < 0) {
        let removeLeft = Math.abs(delta);

        if (actor) {
            const idx = contributors.findIndex((c) => c.name === actor.name && c.phone === actor.phone);
            if (idx >= 0 && removeLeft > 0) {
                const take = Math.min(removeLeft, contributors[idx].quantity);
                contributors[idx] = { ...contributors[idx], quantity: contributors[idx].quantity - take };
                removeLeft -= take;
            }
        }

        for (let i = contributors.length - 1; i >= 0 && removeLeft > 0; i--) {
            if (contributors[i].quantity <= 0) continue;
            const take = Math.min(removeLeft, contributors[i].quantity);
            contributors[i] = { ...contributors[i], quantity: contributors[i].quantity - take };
            removeLeft -= take;
        }
    }

    const cleaned = contributors.filter((c) => c.quantity > 0);
    const sum = cleaned.reduce((acc, c) => acc + c.quantity, 0);

    if (nextQuantity > 0 && cleaned.length === 0 && actor) {
        return [{ name: actor.name, phone: actor.phone, quantity: nextQuantity }];
    }

    if (sum !== nextQuantity && cleaned.length > 0) {
        cleaned[0] = {
            ...cleaned[0],
            quantity: Math.max(1, cleaned[0].quantity + (nextQuantity - sum)),
        };
    }

    return cleaned;
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

        const sessionRef = adminFirestore.doc(`restaurants/${restaurantId}/table_payment_sessions/${tableKey}`);
        const sessionSnap = await sessionRef.get();
        const sessionData = (sessionSnap.data() || {}) as Record<string, unknown>;
        const status = String(sessionData.status || '').trim().toLowerCase() || (Boolean(sessionData.isCompleted) ? 'completed' : 'active');

        if (status !== 'active') {
            return NextResponse.json({ error: 'This table session is locked for ordering.', status }, { status: 423 });
        }

        const quantity = Math.max(0, Math.floor(Number(body.quantity || 0)));
        const actor = normalizeActor(body.actor);
        const nextItem: SharedCartItem = {
            id: itemId,
            name: String(body.item?.name || '').trim().slice(0, 140),
            description: String(body.item?.description || '').trim().slice(0, 280),
            price: Math.max(0, Number(body.item?.price || 0)),
            image: String(body.item?.image || '').trim().slice(0, 500),
            category: String(body.item?.category || 'Others').trim().slice(0, 80) || 'Others',
            quantity,
            contributors: [],
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
                const prev = map.get(nextItem.id);
                const prevQty = prev?.quantity || 0;
                const delta = nextItem.quantity - prevQty;
                const contributors = applyContributorDelta(prev?.contributors || [], actor, delta, nextItem.quantity);

                map.set(nextItem.id, {
                    ...(prev || {}),
                    ...nextItem,
                    contributors,
                });
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

            tx.set(
                sessionRef,
                {
                    sessionId: `${restaurantId}::${tableKey}`,
                    restaurantId,
                    tableKey,
                    tableId: tableKey,
                    status: 'active',
                    isCompleted: false,
                    updatedAt: FieldValue.serverTimestamp(),
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
