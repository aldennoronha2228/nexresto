import { NextRequest, NextResponse } from 'next/server';
import { adminFirestore } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { authorizeTenantAccess } from '@/lib/server/authz/tenant';

type OrderStatus = 'new' | 'preparing' | 'done' | 'paid' | 'cancelled';

function isValidStatus(status: unknown): status is OrderStatus {
    return typeof status === 'string' && ['new', 'preparing', 'done', 'paid', 'cancelled'].includes(status);
}

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
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

        const authz = await authorizeTenantAccess(idToken, restaurantId, 'manage');
        if (!authz) {
            return NextResponse.json({
                error: `Forbidden: tenant mismatch. You are not allowed to manage orders for restaurantId=${restaurantId}.`,
            }, { status: 403 });
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
    } catch (error: unknown) {
        return NextResponse.json({ error: errorMessage(error, 'Request failed') }, { status: 500 });
    }
}
