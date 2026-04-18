import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminFirestore } from '@/lib/firebase-admin';

async function resolveOwnerUser(restaurantId: string): Promise<{ uid: string; email: string | null } | null> {
    const ownerStaffSnap = await adminFirestore
        .collection(`restaurants/${restaurantId}/staff`)
        .where('role', '==', 'owner')
        .limit(1)
        .get();

    if (!ownerStaffSnap.empty) {
        const ownerDoc = ownerStaffSnap.docs[0];
        const email = String(ownerDoc.data()?.email || '').trim().toLowerCase() || null;
        return { uid: ownerDoc.id, email };
    }

    const restaurantDoc = await adminFirestore.doc(`restaurants/${restaurantId}`).get();
    const ownerEmail = String(restaurantDoc.data()?.owner_email || '').trim().toLowerCase();
    if (!ownerEmail) {
        return null;
    }

    try {
        const user = await adminAuth.getUserByEmail(ownerEmail);
        return { uid: user.uid, email: user.email || ownerEmail };
    } catch {
        return null;
    }
}

export async function POST(request: NextRequest) {
    const authHeader = request.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.slice(7);

    try {
        const decoded = await adminAuth.verifyIdToken(idToken);
        const requestor = await adminAuth.getUser(decoded.uid);
        const role = String(requestor.customClaims?.role || '');

        if (role !== 'super_admin') {
            return NextResponse.json({ error: 'Only super admin can impersonate owners' }, { status: 403 });
        }

        const body = await request.json();
        const restaurantId = String(body.restaurantId || '').trim();
        if (!restaurantId) {
            return NextResponse.json({ error: 'restaurantId is required' }, { status: 400 });
        }

        const owner = await resolveOwnerUser(restaurantId);
        if (!owner) {
            return NextResponse.json({ error: 'Owner account not found for this hotel' }, { status: 404 });
        }

        const ownerUser = await adminAuth.getUser(owner.uid);
        const currentClaims = ownerUser.customClaims || {};
        const nextClaims: Record<string, unknown> = {
            ...currentClaims,
            role: 'owner',
            restaurant_id: restaurantId,
            tenant_id: restaurantId,
        };
        await adminAuth.setCustomUserClaims(owner.uid, nextClaims);

        const customToken = await adminAuth.createCustomToken(owner.uid, {
            role: 'owner',
            restaurant_id: restaurantId,
            tenant_id: restaurantId,
            impersonated_by_super_admin: true,
        });

        return NextResponse.json({
            customToken,
            ownerUid: owner.uid,
            ownerEmail: owner.email,
            redirectTo: `/${restaurantId}/dashboard`,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Failed to impersonate owner' }, { status: 500 });
    }
}
