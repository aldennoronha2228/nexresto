import { NextRequest, NextResponse } from 'next/server';
import { adminFirestore } from '@/lib/firebase-admin';

/**
 * /api/admin/settings  (Firebase)
 * 
 * Handles site-wide settings like 'Global Access'.
 * Requires the ADMIN_ACCESS_KEY in the headers.
 */

function verifyKey(req: NextRequest) {
    const key = (req.headers.get('x-admin-key') || '').trim();
    const secret = (process.env.ADMIN_ACCESS_KEY || '').trim();

    if (!secret) return { isValid: false, reason: 'SERVER_CONFIG_MISSING' };

    const isValid = key === secret;
    return { isValid, reason: isValid ? null : 'KEY_MISMATCH' };
}

export async function GET(req: NextRequest) {
    const { isValid, reason } = verifyKey(req);
    if (!isValid) {
        if (reason === 'SERVER_CONFIG_MISSING') {
            return NextResponse.json({ error: 'Server Config Error: Secret Missing' }, { status: 500 });
        }
        return NextResponse.json({ error: 'Auth Error: Invalid Master Key (Settings-Get)' }, { status: 401 });
    }

    try {
        // Get the restaurant_id from query params or env
        const restaurantId = req.nextUrl.searchParams.get('restaurant_id') || process.env.NEXT_PUBLIC_RESTAURANT_ID || '';

        if (!restaurantId) {
            return NextResponse.json({ error: 'Missing restaurant_id' }, { status: 400 });
        }

        const settingsSnap = await adminFirestore
            .collection(`restaurants/${restaurantId}/settings`)
            .get();

        const data = settingsSnap.docs.map(doc => ({
            key: doc.id,
            ...doc.data(),
        }));

        return NextResponse.json(data);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const { isValid, reason } = verifyKey(req);
    if (!isValid) {
        if (reason === 'SERVER_CONFIG_MISSING') {
            return NextResponse.json({ error: 'Server Config Error: Secret Missing' }, { status: 500 });
        }
        return NextResponse.json({ error: 'Auth Error: Invalid Master Key (Settings-Set)' }, { status: 401 });
    }

    try {
        const { key, value, restaurant_id } = await req.json();
        const restaurantId = restaurant_id || process.env.NEXT_PUBLIC_RESTAURANT_ID || '';

        // Security check: Only allow updating certain keys
        const allowedKeys = ['is_site_public'];
        if (!allowedKeys.includes(key)) {
            return NextResponse.json({ error: 'Forbidden: Unauthorized Key Change' }, { status: 403 });
        }

        await adminFirestore
            .doc(`restaurants/${restaurantId}/settings/${key}`)
            .set({
                key,
                value,
                updated_at: new Date().toISOString(),
            }, { merge: true });

        return NextResponse.json({ message: 'Settings Updated Successfully' });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
