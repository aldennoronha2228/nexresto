import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminFirestore } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

type OrderStatus = 'new' | 'preparing' | 'done' | 'paid' | 'cancelled';

function isValidStatus(status: unknown): status is OrderStatus {
    return typeof status === 'string' && ['new', 'preparing', 'done', 'paid', 'cancelled'].includes(status);
}

export async function POST(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.replace('Bearer ', '');

    try {
        const body = await request.json();
        const action = body?.action;
        const restaurantId = String(body?.restaurantId || '').trim();
        const orderId = String(body?.orderId || '').trim();

        if (!restaurantId || !orderId) {
            return NextResponse.json({ error: 'restaurantId and orderId are required' }, { status: 400 });
        }

        const decoded = await adminAuth.verifyIdToken(idToken);
        const user = await adminAuth.getUser(decoded.uid);
        const claims = user.customClaims || {};

        const claimRestaurantId = String(claims.restaurant_id || claims.tenant_id || '');
        if (claims.role !== 'super_admin' && claimRestaurantId !== restaurantId) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const orderRef = adminFirestore.doc(`restaurants/${restaurantId}/orders/${orderId}`);

        if (action === 'update_status') {
            const status = body?.status;
            if (!isValidStatus(status)) {
                return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
            }

            await orderRef.update({
                status,
                updated_at: FieldValue.serverTimestamp(),
            });

            return NextResponse.json({ success: true });
        }

        if (action === 'delete_order') {
            await orderRef.delete();
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Request failed' }, { status: 500 });
    }
}
