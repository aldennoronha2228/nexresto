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
    const limitParam = Number(searchParams.get('limit') || 20);
    const limitCount = Number.isFinite(limitParam) ? Math.max(1, Math.min(50, Math.floor(limitParam))) : 20;

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

        const ordersSnap = await adminFirestore
            .collection(`restaurants/${restaurantId}/orders`)
            .where('status', '==', 'new')
            .orderBy('created_at', 'desc')
            .limit(limitCount)
            .get();

        const orders = ordersSnap.docs.map((doc) => {
            const data = doc.data() as Record<string, unknown>;
            const createdAt = (data.created_at as any)?.toDate?.()
                ? (data.created_at as any).toDate().toISOString()
                : new Date(String(data.created_at || Date.now())).toISOString();

            return {
                id: doc.id,
                table_number: String(data.table_number || ''),
                created_at: createdAt,
            };
        });

        return NextResponse.json({ orders });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Invalid session' }, { status: 401 });
    }
}
