import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminFirestore } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { authorizeTenantAccess } from '@/lib/server/authz/tenant';

// Team limits per tier
const TEAM_LIMITS: Record<string, number> = {
    starter: 2,
    '1k': 2,
    pro: 10,
    '2k': 10,
    '2.5k': 10,
};

/**
 * /api/admin/manage  (Firebase)
 * 
 * Handles management of admin/staff users.
 * Uses Firebase Admin SDK to manage users and Firestore staff sub-collections.
 * Requires a valid owner Bearer token scoped to the current tenant.
 */

async function authorizeOwner(req: NextRequest, tenantId: string) {
    const authHeader = req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.replace('Bearer ', '').trim();

    try {
        const authz = await authorizeTenantAccess(idToken, tenantId, 'manage');
        if (!authz) {
            return NextResponse.json({
                error: `Forbidden: tenant mismatch. You are not allowed to manage members for tenantId=${tenantId}.`,
            }, { status: 403 });
        }

        if (authz.role !== 'owner') {
            return NextResponse.json({ error: 'Only the hotel owner can manage members.' }, { status: 403 });
        }

        return null;
    } catch {
        return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }
}

export async function GET(req: NextRequest) {
    console.log('[admin-manage] GET request received');

    try {
        const tenantId =
            req.nextUrl.searchParams.get('tenant_id') ||
            req.nextUrl.searchParams.get('tenantId') ||
            req.nextUrl.searchParams.get('restaurantId') ||
            '';
        if (!tenantId) {
            return NextResponse.json({ error: 'Missing tenant_id parameter' }, { status: 400 });
        }

        const authError = await authorizeOwner(req, tenantId);
        if (authError) return authError;

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
    try {
        const { email, action, role, tenantId } = await req.json();

        if (!tenantId) {
            return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });
        }

        const authError = await authorizeOwner(req, tenantId);
        if (authError) return authError;

        if (action === 'add' || action === 'invite') {
            const restDoc = await adminFirestore.doc(`restaurants/${tenantId}`).get();
            const restData = restDoc.data() || {};
            const effectiveTier = String(restData.subscription_tier || 'starter').toLowerCase();

            // Server-side limit enforcement
            const limit = TEAM_LIMITS[effectiveTier] || 2;

            // Count current staff members for this tenant
            const staffSnap = await adminFirestore
                .collection(`restaurants/${tenantId}/staff`)
                .get();

            const currentCount = staffSnap.size;

            if (currentCount >= limit) {
                const tierName = effectiveTier === 'pro' || effectiveTier === '2k' || effectiveTier === '2.5k' ? 'Pro' : 'Starter';
                return NextResponse.json({
                    error: `${tierName} tier allows maximum ${limit} team members. ${tierName === 'Starter' ? 'Upgrade to Pro for up to 10 staff accounts.' : 'Contact support if you need more.'}`
                }, { status: 403 });
            }

            // Validate requested role. Kitchen accounts are dedicated KDS users.
            const requestedRole = String(role || 'staff').toLowerCase();
            const allowedRoles = new Set(['owner', 'manager', 'staff', 'kitchen']);
            if (!allowedRoles.has(requestedRole)) {
                return NextResponse.json({ error: 'Invalid role. Allowed: owner, manager, staff, kitchen.' }, { status: 400 });
            }
            const finalRole = requestedRole;

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
