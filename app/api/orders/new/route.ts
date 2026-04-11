import { NextRequest, NextResponse } from 'next/server';
import { adminFirestore } from '@/lib/firebase-admin';
import { authorizeTenantAccess } from '@/lib/server/authz/tenant';

type TimestampLike = { toDate: () => Date };

function hasToDate(value: unknown): value is TimestampLike {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as { toDate?: unknown };
    return typeof candidate.toDate === 'function';
}

function toIsoDate(value: unknown): string {
    if (hasToDate(value)) {
        return value.toDate().toISOString();
    }
    return new Date(String(value || Date.now())).toISOString();
}

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
}

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
        const authz = await authorizeTenantAccess(idToken, restaurantId, 'read');
        if (!authz) {
            return NextResponse.json({
                error: `Forbidden: tenant mismatch. You are not allowed to read new orders for restaurantId=${restaurantId}.`,
            }, { status: 403 });
        }

        const ordersSnap = await adminFirestore
            .collection(`restaurants/${restaurantId}/orders`)
            .where('status', '==', 'new')
            .orderBy('created_at', 'desc')
            .limit(limitCount)
            .get();

        const orders = ordersSnap.docs.map((doc) => {
            const data = doc.data() as Record<string, unknown>;
            const createdAt = toIsoDate(data.created_at);

            return {
                id: doc.id,
                table_number: String(data.table_number || ''),
                created_at: createdAt,
            };
        });

        return NextResponse.json({ orders });
    } catch (error: unknown) {
        return NextResponse.json({ error: errorMessage(error, 'Invalid session') }, { status: 401 });
    }
}
