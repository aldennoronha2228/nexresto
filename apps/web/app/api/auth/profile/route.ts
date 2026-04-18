export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminFirestore } from '@/lib/firebase-admin';

function normalizeYmd(value: unknown): string | null {
    const raw = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function getTodayYmdUtc(): string {
    return new Date().toISOString().slice(0, 10);
}

function daysUntilYmd(endDateYmd: string): number {
    const endDate = new Date(`${endDateYmd}T00:00:00Z`);
    const todayYmd = getTodayYmdUtc();
    const todayDate = new Date(`${todayYmd}T00:00:00Z`);
    return Math.round((endDate.getTime() - todayDate.getTime()) / 86400000);
}

/**
 * GET /api/auth/profile
 * Fetches the current user's profile using Firebase Admin SDK.
 * Reads custom claims and Firestore restaurant data.
 */
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Missing authorization' }, { status: 401 });
    }

    const idToken = authHeader.replace('Bearer ', '');

    try {
        // Verify the Firebase ID token
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        const uid = decodedToken.uid;

        // Fetch current claims and record
        const userRecord = await adminAuth.getUser(uid);
        const claims = {
            ...(userRecord.customClaims || {}),
            role: (decodedToken.role as string) || (userRecord.customClaims?.role as string),
            restaurant_id: (decodedToken.restaurant_id as string) || (userRecord.customClaims?.restaurant_id as string),
            tenant_id: (decodedToken.tenant_id as string) || (userRecord.customClaims?.tenant_id as string),
            must_change_password: Boolean(decodedToken.must_change_password || userRecord.customClaims?.must_change_password),
            impersonated_by_super_admin: Boolean(
                decodedToken.impersonated_by_super_admin || userRecord.customClaims?.impersonated_by_super_admin
            ),
        };
        const normalizedUserEmail = String(userRecord.email || '').trim().toLowerCase();

        // ─── Environment-based Super Admin Sync ────────────────────────────────
        const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
        const userEmail = userRecord.email;
        const currentRole = claims.role as string;

        if (superAdminEmail && userEmail === superAdminEmail) {
            // New email from ENV should be super_admin
            if (currentRole !== 'super_admin') {
                await adminAuth.setCustomUserClaims(uid, { role: 'super_admin' });
            }
            return NextResponse.json({
                profile: {
                    tenant_id: null,
                    tenant_name: 'Platform Admin',
                    role: 'super_admin',
                    must_change_password: false,
                    full_name: userRecord.displayName || userRecord.email,
                    subscription_tier: 'pro',
                    subscription_status: 'active',
                },
            });
        }

        if (currentRole === 'super_admin' && userEmail !== superAdminEmail) {
            // Keep existing super-admin sessions non-destructive even when ENV is updated.
            // This prevents login loops and accidental account deletion.
            console.warn(`[AuthSync] Super admin email mismatch for ${userEmail}; preserving access`);
            return NextResponse.json({
                profile: {
                    tenant_id: null,
                    tenant_name: 'Platform Admin',
                    role: 'super_admin',
                    must_change_password: false,
                    full_name: userRecord.displayName || userRecord.email,
                    subscription_tier: 'pro',
                    subscription_status: 'active',
                },
            });
        }
        // ───────────────────────────────────────────────────────────────────────

        // Check if user has a restaurant_id claim
        const tenantId = (claims.restaurant_id || claims.tenant_id) as string;
        if (tenantId && claims.role) {
            // Get restaurant data
            const restDoc = await adminFirestore.doc(`restaurants/${tenantId}`).get();
            const restData = restDoc.data();

            const endDate = normalizeYmd(restData?.subscription_end_date);
            const todayYmd = getTodayYmdUtc();

            let effectiveStatus = (restData?.subscription_status || 'active') as string;
            if (endDate && endDate < todayYmd) {
                effectiveStatus = 'expired';
                await adminFirestore.doc(`restaurants/${tenantId}`).update({
                    subscription_status: 'expired',
                    account_temporarily_disabled: true,
                    account_disabled_reason: 'subscription_expired',
                    account_temporarily_disabled_at: new Date().toISOString(),
                }).catch(() => { });
            }

            const daysUntilEnd = endDate ? daysUntilYmd(endDate) : null;
            const showEndingSoonReminder =
                effectiveStatus !== 'cancelled' &&
                effectiveStatus !== 'past_due' &&
                typeof daysUntilEnd === 'number' &&
                daysUntilEnd >= 0 &&
                daysUntilEnd <= 5;

            // Also check staff sub-collection for the user's info
            const staffDoc = await adminFirestore
                .doc(`restaurants/${tenantId}/staff/${uid}`)
                .get();
            const staffData = staffDoc.data();

            return NextResponse.json({
                profile: {
                    tenant_id: tenantId,
                    tenant_name: restData?.name || tenantId,
                    role: claims.role,
                    must_change_password: Boolean(claims.must_change_password),
                    full_name: staffData?.full_name || userRecord.displayName || userRecord.email,
                    is_impersonating: Boolean(claims.impersonated_by_super_admin),
                    subscription_tier: restData?.subscription_tier || 'starter',
                    subscription_status: effectiveStatus,
                    subscription_end_date: endDate,
                    subscription_days_remaining: daysUntilEnd,
                    subscription_ending_soon: showEndingSoonReminder,
                },
            });
        }

        // No claims set — check if there's a staff document anywhere
        // Search all restaurants' staff sub-collections for this user (by uid OR email)
        const restaurantsSnap = await adminFirestore.collection('restaurants').get();
        for (const restDoc of restaurantsSnap.docs) {
            const byUidDoc = await restDoc.ref.collection('staff').doc(uid).get();
            const byUidData = byUidDoc.exists ? byUidDoc.data()! : null;

            let matchedStaffData: Record<string, any> | null = byUidData;
            if (!matchedStaffData && normalizedUserEmail) {
                const byEmailSnap = await restDoc.ref
                    .collection('staff')
                    .where('email', '==', normalizedUserEmail)
                    .limit(1)
                    .get();
                if (!byEmailSnap.empty) {
                    matchedStaffData = byEmailSnap.docs[0].data() as Record<string, any>;
                }
            }

            // Extra fallback: some legacy rows may store mixed-case emails,
            // which won't match exact Firestore where() equality on normalized email.
            if (!matchedStaffData && normalizedUserEmail) {
                const staffSnap = await restDoc.ref.collection('staff').limit(200).get();
                const caseInsensitiveMatch = staffSnap.docs.find((staffDoc) => {
                    const email = String(staffDoc.data()?.email || '').trim().toLowerCase();
                    return email !== '' && email === normalizedUserEmail;
                });

                if (caseInsensitiveMatch) {
                    matchedStaffData = caseInsensitiveMatch.data() as Record<string, any>;
                }
            }

            const restData = restDoc.data();
            const normalizedOwnerEmail = String(restData?.owner_email || '').trim().toLowerCase();

            // If no staff match, treat owner_email as owner fallback.
            if (!matchedStaffData && normalizedUserEmail && normalizedOwnerEmail === normalizedUserEmail) {
                matchedStaffData = { role: 'owner', email: normalizedUserEmail };
            }

            if (matchedStaffData) {
                const restData = restDoc.data();
                const resolvedRole = String(matchedStaffData.role || 'staff').trim() || 'staff';

                const endDate = normalizeYmd(restData?.subscription_end_date);
                const todayYmd = getTodayYmdUtc();

                let effectiveStatus = (restData?.subscription_status || 'active') as string;
                if (endDate && endDate < todayYmd) {
                    effectiveStatus = 'expired';
                    await adminFirestore.doc(`restaurants/${restDoc.id}`).update({
                        subscription_status: 'expired',
                        account_temporarily_disabled: true,
                        account_disabled_reason: 'subscription_expired',
                        account_temporarily_disabled_at: new Date().toISOString(),
                    }).catch(() => { });
                }

                const daysUntilEnd = endDate ? daysUntilYmd(endDate) : null;
                const showEndingSoonReminder =
                    effectiveStatus !== 'cancelled' &&
                    effectiveStatus !== 'past_due' &&
                    typeof daysUntilEnd === 'number' &&
                    daysUntilEnd >= 0 &&
                    daysUntilEnd <= 5;

                // Set custom claims for faster future lookups
                const nextClaims: Record<string, unknown> = {
                    role: resolvedRole,
                    restaurant_id: restDoc.id,
                    tenant_id: restDoc.id,
                };
                if (claims.must_change_password) {
                    nextClaims.must_change_password = true;
                }
                await adminAuth.setCustomUserClaims(uid, {
                    ...nextClaims,
                });

                return NextResponse.json({
                    profile: {
                        tenant_id: restDoc.id,
                        tenant_name: restData.name || restDoc.id,
                        role: resolvedRole,
                        must_change_password: Boolean(claims.must_change_password),
                        full_name: matchedStaffData.full_name || userRecord.displayName || userRecord.email,
                        is_impersonating: Boolean(claims.impersonated_by_super_admin),
                        subscription_tier: restData.subscription_tier || 'starter',
                        subscription_status: effectiveStatus,
                        subscription_end_date: endDate,
                        subscription_days_remaining: daysUntilEnd,
                        subscription_ending_soon: showEndingSoonReminder,
                    },
                });
            }
        }

        // No profile found anywhere
        return NextResponse.json({ profile: null });
    } catch (error: any) {
        console.error('[/api/auth/profile] Error:', error);
        return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }
}
