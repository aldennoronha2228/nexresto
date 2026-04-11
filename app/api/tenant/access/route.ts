import { NextRequest, NextResponse } from 'next/server';
import { adminFirestore } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const restaurantId = (searchParams.get('restaurantId') || '').trim();

    if (!restaurantId) {
        return NextResponse.json({ error: 'restaurantId required' }, { status: 400 });
    }

    try {
        const restDoc = await adminFirestore.doc(`restaurants/${restaurantId}`).get();
        if (!restDoc.exists) {
            return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
        }

        const data = restDoc.data() || {};
        return NextResponse.json({
            accountTemporarilyDisabled: Boolean(data.account_temporarily_disabled),
        });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Failed to resolve restaurant access' }, { status: 500 });
    }
}
