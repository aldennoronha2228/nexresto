import { NextRequest, NextResponse } from 'next/server';
import { adminFirestore } from '@/lib/firebase-admin';
import { authorizeTenantAccess } from '@/lib/server/authz/tenant';

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

    if (!restaurantId) {
        return NextResponse.json({ error: 'restaurantId required' }, { status: 400 });
    }

    try {
        const authz = await authorizeTenantAccess(idToken, restaurantId, 'read');
        if (!authz) {
            return NextResponse.json({
                error: `Forbidden: tenant mismatch. You are not allowed to read tenant profile for restaurantId=${restaurantId}.`,
            }, { status: 403 });
        }

        const restDoc = await adminFirestore.doc(`restaurants/${restaurantId}`).get();
        if (!restDoc.exists) {
            return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
        }

        const data = restDoc.data() || {};
        const name = (data?.name as string | undefined) || restaurantId;
        const accountTemporarilyDisabled = Boolean(data?.account_temporarily_disabled);
        return NextResponse.json({ name, accountTemporarilyDisabled });
    } catch (error: unknown) {
        return NextResponse.json({ error: errorMessage(error, 'Invalid session') }, { status: 401 });
    }
}
