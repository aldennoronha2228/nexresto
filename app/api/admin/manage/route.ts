import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminFirestore } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const ADMIN_ACCESS_KEY = process.env.ADMIN_ACCESS_KEY ?? '';

// Team limits per tier
const TEAM_LIMITS: Record<string, number> = {
    starter: 2,
    '1k': 2,
    pro: 10,
    '2k': 10,
    '2.5k': 10,
};

// Role badge colors for UI reference
export const ROLE_COLORS = {
    owner: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Owner' },
    manager: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Manager' },
    staff: { bg: 'bg-slate-100', text: 'text-slate-700', label: 'Staff' },
};

/**
 * /api/admin/manage  (Firebase)
 * 
 * Handles management of admin/staff users.
 * Uses Firebase Admin SDK to manage users and Firestore staff sub-collections.
 * Requires the ADMIN_ACCESS_KEY in the headers for all operations.
 */

function verifyKey(req: NextRequest) {
    const key = (req.headers.get('x-admin-key') || '').trim();
    const secret = (process.env.ADMIN_ACCESS_KEY || '').trim();

    if (!secret) return { isValid: false, reason: 'SERVER_CONFIG_MISSING' };

    const isValid = key === secret;
    return { isValid, reason: isValid ? null : 'KEY_MISMATCH' };
}

export async function GET(req: NextRequest) {
    console.log('[admin-manage] GET request received');

    try {
        const { isValid, reason } = verifyKey(req);
        if (!isValid) {
            if (reason === 'SERVER_CONFIG_MISSING') {
                return NextResponse.json({
                    error: 'Server Misconfigured: Missing ADMIN_ACCESS_KEY',
                    detail: 'Please add ADMIN_ACCESS_KEY to your hosting environment variables.'
                }, { status: 500 });
            }
            return NextResponse.json({ error: 'Auth Error: Invalid Master Key (Manage)' }, { status: 401 });
        }

        const tenantId =
            req.nextUrl.searchParams.get('tenant_id') ||
            req.nextUrl.searchParams.get('tenantId') ||
            req.nextUrl.searchParams.get('restaurantId') ||
            '';
        if (!tenantId) {
            return NextResponse.json({ error: 'Missing tenant_id parameter' }, { status: 400 });
        }

        console.log(`[admin-manage] Fetching staff list for tenant: ${tenantId}`);
        const staffSnap = await adminFirestore
            .collection(`restaurants/${tenantId}/staff`)
            .get();

        const data = staffSnap.docs.map(doc => {
            const row = doc.data() as Record<string, unknown>;
            return {
                id: doc.id,
                ...row,
                // Backward compatibility: older staff docs may not have is_active.
                // Missing flag should be treated as active.
                is_active: row.is_active !== false,
            };
        });

        console.log('[admin-manage] Success. Found', data.length, 'staff members');
        return NextResponse.json(data);
    } catch (err: any) {
        console.error('[admin-manage] GET CRASH:', err.message);
        return NextResponse.json({
            error: 'Server Error',
            detail: err.message,
        }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const { isValid, reason } = verifyKey(req);
    if (!isValid) {
        if (reason === 'SERVER_CONFIG_MISSING') {
            return NextResponse.json({ error: 'Server Config Error: Secret Missing' }, { status: 500 });
        }
        return NextResponse.json({ error: 'Auth Error: Invalid Master Key (Action)' }, { status: 401 });
    }

    try {
        const { email, action, role, tenantId, subscriptionTier } = await req.json();

        if (action === 'add' || action === 'invite') {
            // Server-side limit enforcement
            if (tenantId && subscriptionTier) {
                const limit = TEAM_LIMITS[subscriptionTier] || 2;

                // Count current staff members for this tenant
                const staffSnap = await adminFirestore
                    .collection(`restaurants/${tenantId}/staff`)
                    .get();

                const currentCount = staffSnap.size;

                if (currentCount >= limit) {
                    const tierName = subscriptionTier === 'pro' || subscriptionTier === '2k' ? 'Pro' : 'Starter';
                    return NextResponse.json({
                        error: `${tierName} tier allows maximum ${limit} team members. ${tierName === 'Starter' ? 'Upgrade to Pro for up to 10 staff accounts.' : 'Contact support if you need more.'}`
                    }, { status: 403 });
                }
            }

            // Determine final role (Starter tier only gets owner)
            const isStarterTier = ['starter', '1k'].includes(subscriptionTier || '');
            const finalRole = isStarterTier ? 'owner' : (role || 'staff');

            // Check if user already exists in Firebase Auth
            let existingUser;
            try {
                existingUser = await adminAuth.getUserByEmail(email);
            } catch {
                // User doesn't exist — that's fine
            }

            if (existingUser) {
                // User already exists - check if they're already staff for this tenant
                const existingStaffDoc = await adminFirestore
                    .doc(`restaurants/${tenantId}/staff/${existingUser.uid}`)
                    .get();

                if (existingStaffDoc.exists) {
                    return NextResponse.json({
                        error: 'This user is already a member of your restaurant.'
                    }, { status: 400 });
                }

                const tempPassword = `Welcome${Math.random().toString(36).slice(-6).toUpperCase()}!${Math.floor(Math.random() * 90 + 10)}`;

                // Reset password to a temporary one so owner can share deterministic credentials.
                await adminAuth.updateUser(existingUser.uid, { password: tempPassword });

                // Add existing user to this tenant's staff
                await adminFirestore
                    .doc(`restaurants/${tenantId}/staff/${existingUser.uid}`)
                    .set({
                        email: email.toLowerCase().trim(),
                        role: finalRole,
                        full_name: existingUser.displayName || email.split('@')[0],
                        is_active: true,
                        temp_password: tempPassword,
                        invited_at: FieldValue.serverTimestamp(),
                    });

                // Update custom claims
                const existingClaims = existingUser.customClaims || {};
                await adminAuth.setCustomUserClaims(existingUser.uid, {
                    ...existingClaims,
                    role: finalRole,
                    restaurant_id: tenantId,
                    tenant_id: tenantId,
                    must_change_password: true,
                });

                return NextResponse.json({
                    message: 'Team member added successfully! Share the temporary password below.',
                    tempPassword,
                });
            } else {
                // New user - create account with temporary password
                const tempPassword = `Welcome${Math.random().toString(36).slice(-6).toUpperCase()}!${Math.floor(Math.random() * 90 + 10)}`;

                const newUser = await adminAuth.createUser({
                    email: email,
                    password: tempPassword,
                    emailVerified: true,
                    displayName: email.split('@')[0],
                });

                // Add to tenant's staff sub-collection
                await adminFirestore
                    .doc(`restaurants/${tenantId}/staff/${newUser.uid}`)
                    .set({
                        email: email.toLowerCase().trim(),
                        role: finalRole,
                        full_name: email.split('@')[0],
                        is_active: true,
                        temp_password: tempPassword,
                        invited_at: FieldValue.serverTimestamp(),
                    });

                // Set custom claims
                await adminAuth.setCustomUserClaims(newUser.uid, {
                    role: finalRole,
                    restaurant_id: tenantId,
                    tenant_id: tenantId,
                    must_change_password: true,
                });

                return NextResponse.json({
                    message: 'Team member created successfully!',
                    tempPassword: tempPassword,
                    instructions: `Share this temporary password with ${email}. They should change it after first login.`
                });
            }
        } else if (action === 'remove') {
            // Deactivate: mark staff as inactive
            if (!tenantId) {
                return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });
            }

            // Find user by email in staff
            const staffSnap = await adminFirestore
                .collection(`restaurants/${tenantId}/staff`)
                .where('email', '==', email.toLowerCase().trim())
                .get();

            for (const docSnap of staffSnap.docs) {
                await docSnap.ref.update({ is_active: false });
            }

            return NextResponse.json({ message: 'Staff member deactivated' });
        } else if (action === 'reactivate') {
            if (!tenantId) {
                return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });
            }

            const staffSnap = await adminFirestore
                .collection(`restaurants/${tenantId}/staff`)
                .where('email', '==', email.toLowerCase().trim())
                .get();

            for (const docSnap of staffSnap.docs) {
                await docSnap.ref.update({ is_active: true });
            }

            return NextResponse.json({ message: 'Staff member reactivated' });
        } else if (action === 'delete') {
            // Fully delete user from auth and staff
            try {
                const user = await adminAuth.getUserByEmail(email);

                // Delete from staff sub-collection
                if (tenantId) {
                    await adminFirestore.doc(`restaurants/${tenantId}/staff/${user.uid}`).delete();
                }

                // Delete from Firebase Auth
                await adminAuth.deleteUser(user.uid);
            } catch {
                // User might not exist in auth
            }

            return NextResponse.json({ message: 'Staff member deleted' });
        } else if (action === 'issue_temp_password') {
            if (!tenantId) {
                return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });
            }

            const user = await adminAuth.getUserByEmail(email);
            const staffRef = adminFirestore.doc(`restaurants/${tenantId}/staff/${user.uid}`);
            const staffSnap = await staffRef.get();
            if (!staffSnap.exists) {
                return NextResponse.json({ error: 'User is not a staff member of this restaurant.' }, { status: 404 });
            }

            const tempPassword = `Welcome${Math.random().toString(36).slice(-6).toUpperCase()}!${Math.floor(Math.random() * 90 + 10)}`;
            await adminAuth.updateUser(user.uid, { password: tempPassword });

            const existingClaims = user.customClaims || {};
            await adminAuth.setCustomUserClaims(user.uid, {
                ...existingClaims,
                must_change_password: true,
                restaurant_id: tenantId,
                tenant_id: tenantId,
            });

            await staffRef.update({
                temp_password: tempPassword,
                is_active: true,
            });

            return NextResponse.json({
                message: 'Temporary password issued successfully.',
                tempPassword,
            });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
