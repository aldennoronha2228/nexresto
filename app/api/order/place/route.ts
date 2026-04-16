import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase-admin';
import { validateOrderPayload } from '@/lib/validate';
import { hasFeature } from '@/lib/permissions';
import { resolvePlanFromRestaurantData } from '@/lib/plans';

type PlaceOrderBody = {
    tableId?: unknown;
    total?: unknown;
    restaurantId?: unknown;
    items?: unknown;
    sharedTableContext?: unknown;
    customer?: {
        name?: unknown;
        phone?: unknown;
    };
};

function normalizePhone(phone: unknown): string {
    return String(phone || '').replace(/\D/g, '').slice(-10);
}

function createdAtMillis(value: unknown): number {
    if (!value || typeof value !== 'object') return 0;
    const maybe = value as { toDate?: () => Date };
    if (typeof maybe.toDate !== 'function') return 0;
    const dt = maybe.toDate();
    return Number.isFinite(dt.getTime()) ? dt.getTime() : 0;
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as PlaceOrderBody;

        const validation = validateOrderPayload({
            tableId: body.tableId,
            total: body.total,
            restaurantId: body.restaurantId,
            items: body.items,
        });

        if (!validation.ok || !validation.data) {
            return NextResponse.json({ error: validation.error || 'Invalid order payload' }, { status: 400 });
        }

        const payload = validation.data;
        const restaurantRef = adminFirestore.doc(`restaurants/${payload.restaurantId}`);
        const restaurantSnap = await restaurantRef.get();
        if (!restaurantSnap.exists) {
            return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
        }

        const restaurantData = (restaurantSnap.data() || {}) as Record<string, unknown>;
        const plan = resolvePlanFromRestaurantData(restaurantData);
        const isSharedTableContext = body.sharedTableContext === true;

        if (isSharedTableContext && !hasFeature(plan, 'shared_table_ordering')) {
            return NextResponse.json(
                {
                    error: 'Shared table ordering is available on Pro and Growth plans.',
                    code: 'PLAN_UPGRADE_REQUIRED',
                    requiredFeature: 'shared_table_ordering',
                    currentPlan: plan,
                },
                { status: 403 }
            );
        }

        let dailyOrderNumber = 1;
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayTimestamp = Timestamp.fromDate(today);

            const countSnap = await adminFirestore
                .collection(`restaurants/${payload.restaurantId}/orders`)
                .where('created_at', '>=', todayTimestamp)
                .get();

            dailyOrderNumber = countSnap.size + 1;
        } catch {
            // Best-effort counter only.
        }

        const orderItems = payload.items.map((item) => ({
            menu_item_id: null,
            item_name: item.name.slice(0, 200),
            item_price: item.price,
            quantity: item.quantity,
        }));

        const customerName = String(body.customer?.name || '').trim().slice(0, 80);
        const customerPhone = normalizePhone(body.customer?.phone);

        const ordersCollection = adminFirestore.collection(`restaurants/${payload.restaurantId}/orders`);

        // In shared-table mode, append to the latest active table order so guests can order collaboratively.
        if (isSharedTableContext) {
            const activeSnap = await ordersCollection
                .where('table_number', '==', payload.tableId)
                .limit(50)
                .get();

            const activeDoc = activeSnap.docs
                .filter((doc) => {
                    const status = String((doc.data() as Record<string, unknown>).status || '').toLowerCase();
                    return status === 'new' || status === 'preparing';
                })
                .sort((a, b) => {
                    const aData = a.data() as Record<string, unknown>;
                    const bData = b.data() as Record<string, unknown>;
                    return createdAtMillis(bData.created_at) - createdAtMillis(aData.created_at);
                })[0];

            if (activeDoc) {
                const activeData = activeDoc.data() as Record<string, unknown>;
                const existingItems = Array.isArray(activeData.items)
                    ? (activeData.items as Array<Record<string, unknown>>)
                    : [];

                const mergedByKey = new Map<string, { menu_item_id: string | null; item_name: string; item_price: number; quantity: number }>();

                for (const row of existingItems) {
                    const name = String(row.item_name || '').slice(0, 200);
                    const price = Number(row.item_price || 0);
                    const qty = Math.max(0, Number(row.quantity || 0));
                    if (!name || !Number.isFinite(price) || qty <= 0) continue;
                    const key = `${name}::${price}`;
                    mergedByKey.set(key, {
                        menu_item_id: typeof row.menu_item_id === 'string' ? row.menu_item_id : null,
                        item_name: name,
                        item_price: price,
                        quantity: qty,
                    });
                }

                for (const row of orderItems) {
                    const key = `${row.item_name}::${row.item_price}`;
                    const existing = mergedByKey.get(key);
                    if (existing) {
                        existing.quantity += row.quantity;
                    } else {
                        mergedByKey.set(key, { ...row });
                    }
                }

                const mergedItems = Array.from(mergedByKey.values());
                const mergedTotal = mergedItems.reduce((sum, row) => sum + row.item_price * row.quantity, 0);

                await activeDoc.ref.set(
                    {
                        items: mergedItems,
                        total: mergedTotal,
                        customer_name: customerName || activeData.customer_name || null,
                        customer_phone: /^\d{10}$/.test(customerPhone)
                            ? customerPhone
                            : (typeof activeData.customer_phone === 'string' ? activeData.customer_phone : null),
                        updated_at: FieldValue.serverTimestamp(),
                    },
                    { merge: true }
                );

                const existingDailyOrderNumber = Number(activeData.daily_order_number || dailyOrderNumber) || dailyOrderNumber;

                return NextResponse.json({
                    orderId: activeDoc.id,
                    dailyOrderNumber: existingDailyOrderNumber,
                    merged: true,
                });
            }
        }

        const orderRef = await ordersCollection.add({
            table_number: payload.tableId,
            total: payload.total,
            status: 'new',
            daily_order_number: dailyOrderNumber,
            customer_name: customerName || null,
            customer_phone: /^\d{10}$/.test(customerPhone) ? customerPhone : null,
            items: orderItems,
            created_at: FieldValue.serverTimestamp(),
        });

        if (/^\d{10}$/.test(customerPhone)) {
            const customerRef = adminFirestore.doc(`restaurants/${payload.restaurantId}/customers/${customerPhone}`);
            await adminFirestore.runTransaction(async (tx) => {
                const snap = await tx.get(customerRef);
                const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};
                const previousOrders = Array.isArray(data.orders) ? data.orders : [];

                const uniqueOrders = previousOrders.includes(orderRef.id)
                    ? previousOrders
                    : [...previousOrders, orderRef.id];

                tx.set(
                    customerRef,
                    {
                        name: customerName || String(data.name || 'Guest').slice(0, 80),
                        phone: customerPhone,
                        lastTableNumber: payload.tableId,
                        lastVisited: FieldValue.serverTimestamp(),
                        visitCount: Math.max(1, Number(data.visitCount || 0)),
                        orders: uniqueOrders,
                        totalSpend: Math.max(0, Number(data.totalSpend || 0)) + payload.total,
                        updatedAt: FieldValue.serverTimestamp(),
                    },
                    { merge: true }
                );
            });
        }

        return NextResponse.json({
            orderId: orderRef.id,
            dailyOrderNumber,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Could not place order';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
