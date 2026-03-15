import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminFirestore } from '@/lib/firebase-admin';

type OrderStatus = 'new' | 'preparing' | 'done' | 'paid' | 'cancelled';

function normalize(value: unknown): string {
    return String(value || '').trim().toLowerCase();
}

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.replace('Bearer ', '');
    const { searchParams } = new URL(request.url);
    const restaurantId = (searchParams.get('restaurantId') || '').trim();
    const query = (searchParams.get('q') || '').trim().toLowerCase();

    if (!restaurantId) {
        return NextResponse.json({ error: 'restaurantId required' }, { status: 400 });
    }

    if (!query) {
        return NextResponse.json({ orders: [], menuItems: [] });
    }

    try {
        const decoded = await adminAuth.verifyIdToken(idToken);
        const user = await adminAuth.getUser(decoded.uid);
        const claims = user.customClaims || {};

        const claimRestaurantId = String(claims.restaurant_id || claims.tenant_id || '');
        if (claims.role !== 'super_admin' && claimRestaurantId !== restaurantId) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const [ordersSnap, menuSnap] = await Promise.all([
            adminFirestore
                .collection(`restaurants/${restaurantId}/orders`)
                .orderBy('created_at', 'desc')
                .limit(80)
                .get(),
            adminFirestore
                .collection(`restaurants/${restaurantId}/menu_items`)
                .orderBy('name', 'asc')
                .limit(120)
                .get(),
        ]);

        const orders = ordersSnap.docs
            .map((doc) => {
                const data = doc.data() as Record<string, unknown>;
                return {
                    id: doc.id,
                    daily_order_number: Number(data.daily_order_number || 0) || undefined,
                    table_number: String(data.table_number || ''),
                    status: String(data.status || 'new') as OrderStatus,
                };
            })
            .filter((order) => {
                return normalize(order.table_number).includes(query) || normalize(order.status).includes(query);
            })
            .slice(0, 5);

        const menuItems = menuSnap.docs
            .map((doc) => {
                const data = doc.data() as Record<string, unknown>;
                return {
                    id: doc.id,
                    name: String(data.name || ''),
                    price: Number(data.price || 0),
                    available: data.available !== false,
                };
            })
            .filter((item) => normalize(item.name).includes(query))
            .slice(0, 5);

        return NextResponse.json({ orders, menuItems });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Invalid session' }, { status: 401 });
    }
}
