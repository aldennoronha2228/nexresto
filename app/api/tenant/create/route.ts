/**
 * POST /api/tenant/create  (Firebase)
 * ------------------------------------
 * Server-side endpoint that creates a new restaurant (tenant) in Firestore
 * and sets custom claims on the Firebase Auth user.
 *
 * Body: { userId, email, fullName, restaurantName, masterPin }
 * Returns: { tenantId }
 */

import { NextResponse } from 'next/server';
import { adminAuth, adminFirestore } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { userId, email, fullName, restaurantName, masterPin } = body;

        const now = new Date();
        const trialEnd = new Date(now);
        trialEnd.setDate(trialEnd.getDate() + 7);
        const trialStartYmd = now.toISOString().slice(0, 10);
        const trialEndYmd = trialEnd.toISOString().slice(0, 10);
        const trialExpiresAt = trialEnd.toISOString();

        if (!userId || !email || !restaurantName || !masterPin) {
            return NextResponse.json({ error: 'Missing required fields (including master PIN)' }, { status: 400 });
        }

        if (masterPin.length < 4 || masterPin.length > 20) {
            return NextResponse.json({ error: 'Master PIN must be 4-20 characters' }, { status: 400 });
        }

        // Generate a unique tenant ID from the restaurant name
        const baseSlug = slugify(restaurantName) || 'restaurant';
        const tenantId = `${baseSlug}-${Date.now().toString(36)}`;

        // 1. Create the restaurant document in Firestore
        await adminFirestore.doc(`restaurants/${tenantId}`).set({
            name: restaurantName,
            master_pin: masterPin,
            owner_email: email.toLowerCase().trim(),
            plan: 'starter',
            planStatus: 'trial',
            planExpiresAt: trialExpiresAt,
            subscription_tier: 'starter',
            subscription_status: 'trial',
            subscription_start_date: trialStartYmd,
            subscription_end_date: trialEndYmd,
            created_at: FieldValue.serverTimestamp(),
        });

        // 2. Add the user to the staff sub-collection as 'owner'
        await adminFirestore.doc(`restaurants/${tenantId}/staff/${userId}`).set({
            email: email.toLowerCase().trim(),
            full_name: fullName,
            role: 'owner',
            is_active: true,
            invited_at: FieldValue.serverTimestamp(),
        });

        // 3. Set custom claims on the Firebase Auth user
        await adminAuth.setCustomUserClaims(userId, {
            role: 'owner',
            restaurant_id: tenantId,
        });

        // 4. Create default settings
        await adminFirestore.doc(`restaurants/${tenantId}/settings/is_site_public`).set({
            key: 'is_site_public',
            value: true,
        });

        // 5. Create analytics document
        await adminFirestore.doc(`restaurants/${tenantId}/analytics/daily`).set({
            revenue: 0,
            order_count: 0,
            last_updated: FieldValue.serverTimestamp(),
        });

        return NextResponse.json({ tenantId, restaurantName }, { status: 201 });
    } catch (err: any) {
        console.error('[tenant/create] Unexpected error:', err);
        return NextResponse.json(
            { error: err.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
