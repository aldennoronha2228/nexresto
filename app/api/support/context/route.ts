import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminFirestore } from '@/lib/firebase-admin';

type Claims = {
    role?: string;
    restaurant_id?: string;
    tenant_id?: string;
};

async function requireAuthorizedRestaurant(request: NextRequest): Promise<{ restaurantId: string } | NextResponse> {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const restaurantId = (new URL(request.url).searchParams.get('restaurantId') || '').trim();

    if (!restaurantId) {
        return NextResponse.json({ error: 'restaurantId is required' }, { status: 400 });
    }

    const decoded = await adminAuth.verifyIdToken(token);
    const user = await adminAuth.getUser(decoded.uid);
    const claims = (user.customClaims || {}) as Claims;

    const claimRestaurantId = String(claims.restaurant_id || claims.tenant_id || '');
    if (claims.role !== 'super_admin' && claimRestaurantId !== restaurantId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return { restaurantId };
}

export async function GET(request: NextRequest) {
    try {
        const auth = await requireAuthorizedRestaurant(request);
        if (auth instanceof NextResponse) return auth;

        const { restaurantId } = auth;

        const restaurantRef = adminFirestore.doc(`restaurants/${restaurantId}`);
        const ordersCol = adminFirestore.collection(`restaurants/${restaurantId}/orders`);
        const menuCol = adminFirestore.collection(`restaurants/${restaurantId}/menu_items`);
        const categoriesCol = adminFirestore.collection(`restaurants/${restaurantId}/categories`);
        const layoutRef = adminFirestore.doc(`restaurants/${restaurantId}/settings/floor_layout`);

        const [
            restaurantSnap,
            menuSnap,
            categoriesSnap,
            layoutSnap,
            newSnap,
            preparingSnap,
            doneSnap,
            paidSnap,
            cancelledSnap,
        ] = await Promise.all([
            restaurantRef.get(),
            menuCol.get(),
            categoriesCol.get(),
            layoutRef.get(),
            ordersCol.where('status', '==', 'new').get(),
            ordersCol.where('status', '==', 'preparing').get(),
            ordersCol.where('status', '==', 'done').get(),
            ordersCol.where('status', '==', 'paid').get(),
            ordersCol.where('status', '==', 'cancelled').get(),
        ]);

        const restaurant = restaurantSnap.exists ? restaurantSnap.data() || {} : {};
        const menuItems = menuSnap.docs.map((d) => d.data() as Record<string, unknown>);
        const layout = layoutSnap.exists ? (layoutSnap.data() || {}) : {};
        const layoutTables = Array.isArray((layout as any).tables) ? (layout as any).tables : [];

        const unavailableCount = menuItems.filter((m) => m?.available === false).length;
        const activeOrderCount = newSnap.size + preparingSnap.size + doneSnap.size;

        const response = {
            restaurant: {
                id: restaurantId,
                name: String((restaurant as any).name || restaurantId),
                subscriptionTier: String((restaurant as any).subscription_tier || 'starter'),
                subscriptionStatus: String((restaurant as any).subscription_status || 'active'),
                subscriptionEndDate: (restaurant as any).subscription_end_date || null,
            },
            metrics: {
                orderCounts: {
                    active: activeOrderCount,
                    new: newSnap.size,
                    preparing: preparingSnap.size,
                    done: doneSnap.size,
                    paid: paidSnap.size,
                    cancelled: cancelledSnap.size,
                },
                menu: {
                    totalItems: menuSnap.size,
                    unavailableItems: unavailableCount,
                    categories: categoriesSnap.size,
                },
                tables: {
                    total: layoutTables.length,
                    busy: layoutTables.filter((t: any) => t?.status === 'busy').length,
                    available: layoutTables.filter((t: any) => t?.status === 'available').length,
                    reserved: layoutTables.filter((t: any) => t?.status === 'reserved').length,
                },
            },
            uiTips: {
                keyAreas: ['Live Orders', 'Order History', 'Menu Management', 'Tables & QR', 'Analytics', 'Inventory', 'Branding', 'Account Settings'],
            },
            generatedAt: new Date().toISOString(),
        };

        return NextResponse.json(response);
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Failed to load support context' }, { status: 500 });
    }
}
