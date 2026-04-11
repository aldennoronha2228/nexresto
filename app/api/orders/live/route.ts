import { NextRequest, NextResponse } from 'next/server';
import { adminFirestore } from '@/lib/firebase-admin';
import { authorizeTenantAccess } from '@/lib/server/authz/tenant';

type OrderStatus = 'new' | 'preparing' | 'done' | 'paid' | 'cancelled';

type TimestampLike = { toDate: () => Date };

function hasToDate(value: unknown): value is TimestampLike {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as { toDate?: unknown };
    return typeof candidate.toDate === 'function';
}

function toDateValue(value: unknown): Date {
    if (hasToDate(value)) {
        return value.toDate();
    }
    return new Date(String(value || Date.now()));
}

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
}

function formatTimeAgo(dateInput: unknown): string {
    const date = dateInput instanceof Date
        ? dateInput
        : new Date(String(dateInput || Date.now()));

    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
}

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.replace('Bearer ', '');
    const { searchParams } = new URL(request.url);
    const restaurantId = (searchParams.get('restaurantId') || '').trim();

    if (!restaurantId) {
        return NextResponse.json({ error: 'restaurantId required' }, { status: 400 });
    }

    try {
        const authz = await authorizeTenantAccess(idToken, restaurantId, 'read');
        if (!authz) {
            return NextResponse.json({
                error: `Forbidden: tenant mismatch. You are not allowed to read orders for restaurantId=${restaurantId}.`,
            }, { status: 403 });
        }

        const ordersSnap = await adminFirestore
            .collection(`restaurants/${restaurantId}/orders`)
            .orderBy('created_at', 'desc')
            .get();

        const orders = ordersSnap.docs.map((doc) => {
            const data = doc.data() as Record<string, unknown>;
            const rawItems = Array.isArray(data.items) ? data.items : [];

            const items = rawItems.map((item, idx) => {
                const row = item as Record<string, unknown>;
                return {
                    id: String(row.id || `item-${idx}`),
                    name: String(row.item_name || row.name || 'Item'),
                    quantity: Number(row.quantity || 1),
                    price: Number(row.item_price || row.price || 0),
                };
            });

            const createdAtValue = toDateValue(data.created_at);

            return {
                id: doc.id,
                daily_order_number: Number(data.daily_order_number || 0) || undefined,
                table: String(data.table_number || ''),
                items,
                status: String(data.status || 'new') as OrderStatus,
                total: Number(data.total || 0),
                time: formatTimeAgo(createdAtValue),
                created_at: createdAtValue.toISOString(),
            };
        }).filter((order) => ['new', 'preparing', 'done'].includes(order.status));

        return NextResponse.json({ orders });
    } catch (error: unknown) {
        return NextResponse.json({ error: errorMessage(error, 'Invalid session') }, { status: 401 });
    }
}
