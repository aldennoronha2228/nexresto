/**
 * POST /api/auth/signup-verify  (Firebase)
 * ------------------------------------------
 * Step 2 of signup: Verifies the OTP and creates the actual account.
 * Creates user in Firebase Auth, sets custom claims, and creates the
 * restaurant document with all sub-collections.
 *
 * Body: { email, otp }
 * Returns: { userId, tenantId }
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
        const { email, otp } = body;

        if (!email || !otp) {
            return NextResponse.json({ error: 'Email and OTP are required' }, { status: 400 });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // Get pending signup from Firestore
        const pendingDoc = await adminFirestore.doc(`pending_signups/${normalizedEmail}`).get();

        if (!pendingDoc.exists) {
            return NextResponse.json({
                error: 'No pending signup found. Please start over.'
            }, { status: 404 });
        }

        const pending = pendingDoc.data()!;

        // Verify OTP
        if (pending.otp !== otp) {
            return NextResponse.json({ error: 'Invalid verification code' }, { status: 401 });
        }

        // Check expiry
        if (new Date(pending.expires_at) < new Date()) {
            // Clean up expired signup
            await adminFirestore.doc(`pending_signups/${normalizedEmail}`).delete();
            return NextResponse.json({
                error: 'Verification code expired. Please start over.'
            }, { status: 410 });
        }

        // Create the user in Firebase Auth
        let userRecord;
        try {
            userRecord = await adminAuth.createUser({
                email: pending.email,
                password: pending.password,
                displayName: pending.full_name,
                emailVerified: true, // Auto-confirm since we verified via OTP
            });
        } catch (err: any) {
            console.error('[signup-verify] Create user error:', err);
            return NextResponse.json({ error: err.message }, { status: 500 });
        }

        const userId = userRecord.uid;

        // Generate tenant ID
        const baseSlug = slugify(pending.restaurant_name) || 'restaurant';
        const tenantId = `${baseSlug}-${Date.now().toString(36)}`;

        try {
            // Create restaurant document in Firestore
            await adminFirestore.doc(`restaurants/${tenantId}`).set({
                name: pending.restaurant_name,
                master_pin: pending.master_pin,
                owner_email: pending.email,
                subscription_tier: 'starter',
                subscription_status: 'active',
                created_at: FieldValue.serverTimestamp(),
            });

            // Add the user to the staff sub-collection as 'owner'
            await adminFirestore.doc(`restaurants/${tenantId}/staff/${userId}`).set({
                email: pending.email,
                full_name: pending.full_name,
                role: 'owner',
                invited_at: FieldValue.serverTimestamp(),
            });

            // Set custom claims on the Firebase Auth user
            await adminAuth.setCustomUserClaims(userId, {
                role: 'owner',
                restaurant_id: tenantId,
            });

            // Seed default categories
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
            await batch.commit();

            // Create default settings
            await adminFirestore.doc(`restaurants/${tenantId}/settings/is_site_public`).set({
                key: 'is_site_public',
                value: true,
            });

            // Create analytics document
            await adminFirestore.doc(`restaurants/${tenantId}/analytics/daily`).set({
                revenue: 0,
                order_count: 0,
                last_updated: FieldValue.serverTimestamp(),
            });

        } catch (err: any) {
            // Rollback: delete the user
            await adminAuth.deleteUser(userId);
            console.error('[signup-verify] Setup error:', err);
            return NextResponse.json({ error: err.message }, { status: 500 });
        }

        // Clean up pending signup
        await adminFirestore.doc(`pending_signups/${normalizedEmail}`).delete();

        console.log(`[signup-verify] Created user ${userId} for tenant ${tenantId}`);

        return NextResponse.json({
            userId,
            tenantId,
            message: 'Account created successfully! You can now sign in.'
        }, { status: 201 });

    } catch (err: any) {
        console.error('[signup-verify] Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
