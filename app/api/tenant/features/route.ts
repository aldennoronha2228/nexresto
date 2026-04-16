import { NextRequest, NextResponse } from 'next/server';
import { adminFirestore } from '@/lib/firebase-admin';
import { resolvePlanFromRestaurantData } from '@/lib/plans';
import { hasFeature } from '@/lib/permissions';

export async function GET(request: NextRequest) {
    try {
        const restaurantId = (request.nextUrl.searchParams.get('restaurantId') || '').trim();
        if (!restaurantId) {
            return NextResponse.json({ error: 'restaurantId is required' }, { status: 400 });
        }

        const snap = await adminFirestore.doc(`restaurants/${restaurantId}`).get();
        if (!snap.exists) {
            return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
        }

        const data = (snap.data() || {}) as Record<string, unknown>;
        const plan = resolvePlanFromRestaurantData(data);

        return NextResponse.json({
            plan,
            features: {
                shared_table_ordering: hasFeature(plan, 'shared_table_ordering'),
                split_billing: hasFeature(plan, 'split_billing'),
            },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to resolve tenant features';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
