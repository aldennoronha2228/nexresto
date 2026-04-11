import { NextRequest, NextResponse } from 'next/server';
import { adminFirestore } from '@/lib/firebase-admin';
import { authorizeTenantAccess } from '@/lib/server/authz/tenant';

function toIso(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null;
    const maybe = value as { toDate?: () => Date };
    if (typeof maybe.toDate !== 'function') return null;
    return maybe.toDate().toISOString();
}

export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization') || '';
        if (!authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const idToken = authHeader.replace('Bearer ', '').trim();
        const restaurantId = (request.nextUrl.searchParams.get('restaurantId') || '').trim();

        if (!restaurantId) {
            return NextResponse.json({ error: 'restaurantId is required' }, { status: 400 });
        }

        const authz = await authorizeTenantAccess(idToken, restaurantId, 'read');
        if (!authz) {
            return NextResponse.json({ error: 'Forbidden: tenant mismatch' }, { status: 403 });
        }

        const snap = await adminFirestore
            .collection(`restaurants/${restaurantId}/customers`)
            .orderBy('lastVisited', 'desc')
            .limit(1000)
            .get();

        const customers = snap.docs.map((doc) => {
            const data = doc.data() as Record<string, unknown>;
            return {
                id: doc.id,
                name: String(data.name || 'Guest'),
                phone: String(data.phone || doc.id),
                tableNumber: String(data.lastTableNumber || ''),
                visitCount: Number(data.visitCount || 0),
                totalSpend: Number(data.totalSpend || 0),
                lastVisited: toIso(data.lastVisited),
            };
        });

        return NextResponse.json({ customers });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load customers';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
