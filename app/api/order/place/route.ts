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

        const orderRef = await adminFirestore.collection(`restaurants/${payload.restaurantId}/orders`).add({
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
