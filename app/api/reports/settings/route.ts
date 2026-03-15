import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminFirestore } from '@/lib/firebase-admin';

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

    // Verify user token
    let decodedToken;
    try {
        decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch {
        return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const userRecord = await adminAuth.getUser(decodedToken.uid);
    const claims = userRecord.customClaims || {};

    // Verify user belongs to this restaurant
    const claimRestaurantId = String(claims.restaurant_id || claims.tenant_id || '');
    if (claims.role !== 'super_admin' && claimRestaurantId !== restaurantId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get restaurant settings
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

    // Verify user token
    let decodedToken;
    try {
        decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch {
        return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const userRecord = await adminAuth.getUser(decodedToken.uid);
    const claims = userRecord.customClaims || {};

    // Verify user belongs to this restaurant and is owner
    const claimRestaurantId = String(claims.restaurant_id || claims.tenant_id || '');
    if (claims.role !== 'super_admin' && claimRestaurantId !== restaurantId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (claims.role !== 'owner' && claims.role !== 'super_admin') {
        return NextResponse.json({ error: 'Only owners can change report settings' }, { status: 403 });
    }

    // Check subscription tier
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

    // Update setting
    await adminFirestore.doc(`restaurants/${restaurantId}`).update({
        email_reports_enabled: emailReportsEnabled,
    });

    return NextResponse.json({ success: true, emailReportsEnabled });
}
