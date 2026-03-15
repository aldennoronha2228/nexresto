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

        const restDoc = await adminFirestore.doc(`restaurants/${restaurantId}`).get();
        if (!restDoc.exists) {
            return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
        }

        const name = (restDoc.data()?.name as string | undefined) || restaurantId;
        return NextResponse.json({ name });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Invalid session' }, { status: 401 });
    }
}
