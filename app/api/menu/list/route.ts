import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminFirestore } from '@/lib/firebase-admin';

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
        const decoded = await adminAuth.verifyIdToken(idToken);
        const user = await adminAuth.getUser(decoded.uid);
        const claims = user.customClaims || {};

        const claimRestaurantId = String(claims.restaurant_id || claims.tenant_id || '');
        if (claims.role !== 'super_admin' && claimRestaurantId !== restaurantId) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const [categoriesSnap, itemsSnap] = await Promise.all([
            adminFirestore
                .collection(`restaurants/${restaurantId}/categories`)
                .orderBy('display_order')
                .get(),
            adminFirestore
                .collection(`restaurants/${restaurantId}/menu_items`)
                .orderBy('name')
                .get(),
        ]);

        const categories = categoriesSnap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));

        const menuItems = itemsSnap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));

        return NextResponse.json({ categories, menuItems });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Invalid session' }, { status: 401 });
    }
}
