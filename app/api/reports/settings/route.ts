import { NextRequest, NextResponse } from 'next/server';
import { adminFirestore } from '@/lib/firebase-admin';
import { authorizeTenantAccess } from '@/lib/server/authz/tenant';

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * GET /api/reports/settings  (Firebase)
 * Get report settings for a restaurant
 */
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.replace('Bearer ', '');
    const { searchParams } = new URL(request.url);
    const restaurantId = searchParams.get('restaurantId');

    if (!restaurantId) {
        return NextResponse.json({ error: 'restaurantId required' }, { status: 400 });
    }

    try {
        const authz = await authorizeTenantAccess(idToken, restaurantId, 'read');
        if (!authz) {
            return NextResponse.json({
                error: `Forbidden: tenant mismatch. You are not allowed to read report settings for restaurantId=${restaurantId}.`,
            }, { status: 403 });
        }

        const restDoc = await adminFirestore.doc(`restaurants/${restaurantId}`).get();
        const restData = restDoc.data();

        if (!restData) {
            return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
        }

        const isPro = restData.subscription_tier === 'pro' ||
            restData.subscription_tier === '2k' ||
            restData.subscription_tier === '2.5k';

        return NextResponse.json({
            emailReportsEnabled: restData.email_reports_enabled ?? false,
            isPro,
        });
    } catch (error: unknown) {
        return NextResponse.json({ error: errorMessage(error, 'Invalid session') }, { status: 401 });
    }
}

/**
 * POST /api/reports/settings  (Firebase)
 * Update report settings for a restaurant
 */
export async function POST(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.replace('Bearer ', '');

    const body = await request.json();
    const { restaurantId, emailReportsEnabled } = body;

    if (!restaurantId || typeof emailReportsEnabled !== 'boolean') {
        return NextResponse.json({ error: 'restaurantId and emailReportsEnabled required' }, { status: 400 });
    }

    try {
        const authz = await authorizeTenantAccess(idToken, restaurantId, 'read');
        if (!authz) {
            return NextResponse.json({
                error: `Forbidden: tenant mismatch. You are not allowed to manage report settings for restaurantId=${restaurantId}.`,
            }, { status: 403 });
        }

        if (authz.role !== 'owner' && !authz.isSuperAdmin) {
            return NextResponse.json({ error: 'Only owners can change report settings' }, { status: 403 });
        }

        const restDoc = await adminFirestore.doc(`restaurants/${restaurantId}`).get();
        const restData = restDoc.data();

        const isPro = restData?.subscription_tier === 'pro' ||
            restData?.subscription_tier === '2k' ||
            restData?.subscription_tier === '2.5k';

        if (!isPro) {
            return NextResponse.json({
                error: 'Email Reports are a Pro feature',
                upgrade: true
            }, { status: 403 });
        }

        await adminFirestore.doc(`restaurants/${restaurantId}`).update({
            email_reports_enabled: emailReportsEnabled,
        });

        return NextResponse.json({ success: true, emailReportsEnabled });
    } catch (error: unknown) {
        return NextResponse.json({ error: errorMessage(error, 'Invalid session') }, { status: 401 });
    }
}
