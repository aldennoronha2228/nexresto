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
            subscription_tier: 'starter',
            subscription_status: 'active',
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

        // 4. Seed default categories for this tenant
        const defaultCategories = [
            { name: 'Appetizers', display_order: 1 },
            { name: 'Main Course', display_order: 2 },
            { name: 'Desserts', display_order: 3 },
            { name: 'Beverages', display_order: 4 },
        ];

        const batch = adminFirestore.batch();
        for (const cat of defaultCategories) {
            const catRef = adminFirestore.collection(`restaurants/${tenantId}/categories`).doc();
            batch.set(catRef, { ...cat, created_at: FieldValue.serverTimestamp() });
        }
        await batch.commit(); // Non-fatal if this fails

        // 5. Create default settings
        await adminFirestore.doc(`restaurants/${tenantId}/settings/is_site_public`).set({
            key: 'is_site_public',
            value: true,
        });

        // 6. Create analytics document
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
