import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase-admin';
import { authorizeTenantAccess } from '@/lib/server/authz/tenant';
import { encrypt } from '@/lib/crypto';

function clean(value: unknown): string {
    return String(value || '').trim();
}

function isOwnerLike(role: string): boolean {
    const normalized = clean(role).toLowerCase();
    return normalized === 'owner' || normalized === 'admin' || normalized === 'super_admin';
}

function getBearerToken(request: NextRequest): string {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw Object.assign(new Error('Unauthorized'), { status: 401 });
    }
    return authHeader.slice(7);
}

export async function GET(request: NextRequest) {
    try {
        const idToken = getBearerToken(request);
        const { searchParams } = new URL(request.url);
        const restaurantId = clean(searchParams.get('restaurantId'));

        if (!restaurantId) {
            return NextResponse.json({ error: 'restaurantId required' }, { status: 400 });
        }

        const authz = await authorizeTenantAccess(idToken, restaurantId, 'manage');
        if (!authz || !isOwnerLike(authz.role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const restDoc = await adminFirestore.doc(`restaurants/${restaurantId}`).get();
        if (!restDoc.exists) {
            return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
        }

        const data = restDoc.data() || {};

        return NextResponse.json({
            keyId: clean((data as Record<string, unknown>).razorpayKeyId),
            isPaymentConnected: Boolean((data as Record<string, unknown>).isPaymentConnected),
        });
    } catch (error: any) {
        const status = Number(error?.status || 500);
        return NextResponse.json({ error: error?.message || 'Unable to load payment settings' }, { status });
    }
}

export async function POST(request: NextRequest) {
    try {
        const idToken = getBearerToken(request);
        const body = await request.json().catch(() => ({}));

        const restaurantId = clean(body?.restaurantId);
        const keyId = clean(body?.keyId);
        const keySecret = clean(body?.keySecret);
        const requestedConnectionState = body?.isPaymentConnected;

        if (!restaurantId || !keyId || !keySecret) {
            return NextResponse.json({ error: 'restaurantId, keyId, and keySecret are required' }, { status: 400 });
        }

        if (requestedConnectionState !== undefined && typeof requestedConnectionState !== 'boolean') {
            return NextResponse.json({ error: 'isPaymentConnected must be a boolean' }, { status: 400 });
        }

        const authz = await authorizeTenantAccess(idToken, restaurantId, 'manage');
        if (!authz || !isOwnerLike(authz.role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const encryptedSecret = encrypt(keySecret);

        await adminFirestore.doc(`restaurants/${restaurantId}`).set(
            {
                razorpayKeyId: keyId,
                razorpayKeySecret: encryptedSecret,
                isPaymentConnected: requestedConnectionState ?? true,
                updated_at: FieldValue.serverTimestamp(),
                payment_settings_updated_by: authz.uid,
            },
            { merge: true }
        );

        return NextResponse.json({
            success: true,
            keyId,
            isPaymentConnected: requestedConnectionState ?? true,
        });
    } catch (error: any) {
        const status = Number(error?.status || 500);
        return NextResponse.json({ error: error?.message || 'Unable to save payment settings' }, { status });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const idToken = getBearerToken(request);
        const body = await request.json().catch(() => ({}));

        const restaurantId = clean(body?.restaurantId);
        const isPaymentConnected = body?.isPaymentConnected;

        if (!restaurantId || typeof isPaymentConnected !== 'boolean') {
            return NextResponse.json({ error: 'restaurantId and boolean isPaymentConnected are required' }, { status: 400 });
        }

        const authz = await authorizeTenantAccess(idToken, restaurantId, 'manage');
        if (!authz || !isOwnerLike(authz.role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const docRef = adminFirestore.doc(`restaurants/${restaurantId}`);
        const snapshot = await docRef.get();
        if (!snapshot.exists) {
            return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
        }

        const data = (snapshot.data() || {}) as Record<string, unknown>;
        const hasCredentials = Boolean(clean(data.razorpayKeyId) && clean(data.razorpayKeySecret));

        if (isPaymentConnected && !hasCredentials) {
            return NextResponse.json({ error: 'Connect Razorpay keys before activating payments' }, { status: 400 });
        }

        await docRef.set(
            {
                isPaymentConnected,
                updated_at: FieldValue.serverTimestamp(),
                payment_settings_updated_by: authz.uid,
            },
            { merge: true }
        );

        return NextResponse.json({ success: true, isPaymentConnected });
    } catch (error: any) {
        const status = Number(error?.status || 500);
        return NextResponse.json({ error: error?.message || 'Unable to update payment activation status' }, { status });
    }
}
