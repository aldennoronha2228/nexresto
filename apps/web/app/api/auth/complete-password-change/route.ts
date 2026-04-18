import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminFirestore } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Missing authorization' }, { status: 401 });
    }

    try {
        const idToken = authHeader.replace('Bearer ', '');
        const decoded = await adminAuth.verifyIdToken(idToken);
        const userRecord = await adminAuth.getUser(decoded.uid);

        const existingClaims = userRecord.customClaims || {};
        const nextClaims = { ...existingClaims } as Record<string, unknown>;

        delete nextClaims.must_change_password;

        await adminAuth.setCustomUserClaims(decoded.uid, nextClaims);

        const tenantId = String((decoded as any).restaurant_id || (decoded as any).tenant_id || '');
        if (tenantId) {
            await adminFirestore
                .doc(`restaurants/${tenantId}/staff/${decoded.uid}`)
                .update({ temp_password: FieldValue.delete() })
                .catch(() => { });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Failed to update password status' }, { status: 500 });
    }
}
