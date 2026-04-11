import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminFirestore } from '@/lib/firebase-admin';

/**
 * /api/admin/confirm-user  (Firebase)
 * ------------------------------------
 * EMERGENCY TOOL: Manually confirms a Firebase user if they aren't receiving the email.
 * This uses the Firebase Admin SDK to bypass normal auth requirements.
 * 
 * SECURITY: Protected by the tenant's master_pin (set during signup).
 */

async function verifyTenantPin(email: string, providedPin: string): Promise<{ valid: boolean; reason?: string }> {
    try {
        // Find the user in Firebase Auth
        const user = await adminAuth.getUserByEmail(email.toLowerCase().trim());

        // Search all restaurants' staff sub-collections for this user
        const restaurantsSnap = await adminFirestore.collection('restaurants').get();
        for (const restDoc of restaurantsSnap.docs) {
            const staffDoc = await restDoc.ref.collection('staff').doc(user.uid).get();
            if (staffDoc.exists) {
                // Found the user's restaurant — verify the master PIN
                const restData = restDoc.data();
                if (!restData.master_pin) {
                    return { valid: false, reason: 'No master PIN set for this restaurant' };
                }
                return { valid: restData.master_pin === providedPin };
            }
        }

        return { valid: false, reason: 'User not found in any restaurant staff' };
    } catch (err: any) {
        if (err.code === 'auth/user-not-found') {
            return { valid: false, reason: 'User not found' };
        }
        return { valid: false, reason: err.message };
    }
}

export async function POST(req: NextRequest) {
    try {
        const { email } = await req.json();
        const providedPin = (req.headers.get('x-admin-key') || '').trim();

        if (!email) {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }

        if (!providedPin) {
            return NextResponse.json({ error: 'Master PIN is required' }, { status: 400 });
        }

        console.log(`[ConfirmUser] Manually confirming email: ${email}`);

        // 1. Find the user in Firebase Auth
        let user;
        try {
            user = await adminAuth.getUserByEmail(email);
        } catch (err: any) {
            if (err.code === 'auth/user-not-found') {
                return NextResponse.json({ error: 'User not found in Firebase Auth' }, { status: 404 });
            }
            throw err;
        }

        // 2. Verify the master PIN against the user's tenant
        const pinCheck = await verifyTenantPin(email, providedPin);
        if (!pinCheck.valid) {
            return NextResponse.json({ error: pinCheck.reason || 'Invalid Master PIN' }, { status: 401 });
        }

        // 3. Update the user to mark their email as verified
        await adminAuth.updateUser(user.uid, { emailVerified: true });

        return NextResponse.json({
            message: `Successfully confirmed ${email}! You can now sign in.`,
            userId: user.uid
        });

    } catch (err: any) {
        console.error('[ConfirmUser] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
