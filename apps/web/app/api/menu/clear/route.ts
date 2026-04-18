import { NextRequest, NextResponse } from 'next/server';
import { adminFirestore } from '@/lib/firebase-admin';
import { authorizeTenantAccess } from '@/lib/server/authz/tenant';

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
}

export async function POST(request: NextRequest) {
    const authHeader = request.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.slice(7);

    try {
        const body = await request.json();
        const restaurantId = String(body.restaurantId || '').trim();

        if (!restaurantId) {
            return NextResponse.json({ error: 'restaurantId is required' }, { status: 400 });
        }

        const authz = await authorizeTenantAccess(idToken, restaurantId, 'manage');
        if (!authz) {
            return NextResponse.json({
                error: `Forbidden: tenant mismatch. You are not allowed to manage menu for restaurantId=${restaurantId}.`,
            }, { status: 403 });
        }

        const itemsRef = adminFirestore.collection(`restaurants/${restaurantId}/menu_items`);
        const itemsSnap = await itemsRef.get();

        if (itemsSnap.empty) {
            return NextResponse.json({ success: true, deletedItems: 0 });
        }

        const docs = itemsSnap.docs;
        const chunkSize = 400;
        for (let i = 0; i < docs.length; i += chunkSize) {
            const batch = adminFirestore.batch();
            for (const docSnap of docs.slice(i, i + chunkSize)) {
                batch.delete(docSnap.ref);
            }
            await batch.commit();
        }

        return NextResponse.json({ success: true, deletedItems: docs.length });
    } catch (error: unknown) {
        return NextResponse.json({ error: errorMessage(error, 'Failed to clear menu') }, { status: 500 });
    }
}
