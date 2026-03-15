/**
 * hooks/useRestaurant.ts
 * ─────────────────────
 * The authoritative hook for resolving WHICH restaurant's data to show.
 *
 * Design principles:
 *
 *   1. URL-slug is KING — for all data fetches the restaurant_id is derived
 *      from `params.storeId` (the URL), NOT the session's tenantId.
 *      This lets the Super-Admin open multiple tabs for different restaurants
 *      without them overriding each other.
 *
 *   2. Non-super-admin users are still validated against their session tenantId.
 *      If the URL slug !== session tenantId, the layout guard will redirect
 *      to /session-conflict before any data is fetched.
 *
 *   3. Super-admins always have `isAuthorized = true` regardless of the URL slug.
 *
 * Usage:
 *   const { storeId, isSuperAdmin, isAuthorized, tenantName, subscriptionTier, loading } = useRestaurant();
 *
 *   Then in every Firestore query:
 *     collection(db, 'restaurants', storeId, 'orders')  ← always URL-scoped, tab-safe
 */

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useSuperAdminAuth } from '@/context/SuperAdminAuthContext';
import { db, adminDb } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export function useRestaurant() {
    const params = useParams<{ storeId: string }>();
    const { tenantId, userRole: tenantRole, tenantName, subscriptionTier, tenantLoading } = useAuth();
    const { session: superAdminSession, userRole: adminRole, loading: adminLoading } = useSuperAdminAuth();

    // ── 1. URL slug is the primary data-scoping key ──────────────────────
    const urlStoreId = params?.storeId || '';

    const hasTenantSession = Boolean(tenantId && tenantRole && tenantRole !== 'super_admin');
    const hasSuperAdminSession = Boolean(superAdminSession && adminRole === 'super_admin');
    const isSuperAdmin = tenantRole === 'super_admin' || (!hasTenantSession && hasSuperAdminSession);
    const [resolvedTenantName, setResolvedTenantName] = useState<string | null>(null);

    // ── 2. Authorization check ────────────────────────────────────────────
    const isAuthorized = isSuperAdmin || urlStoreId === tenantId;

    // ── 3. Active storeId for queries ─────────────────────────────────────
    const activeStoreId = isSuperAdmin
        ? (urlStoreId || tenantId)   // super-admin: URL slug first
        : (tenantId || '');          // normal user: NEVER fall back to URL slug without claims

    // ── 4. Correct Firestore instance ─────────────────────────────────────
    // If we are in "God Mode" (authenticated via adminAuth), we MUST use adminDb
    // to ensure the outgoing Firestore request carries the super_admin token.
    const activeDb = isSuperAdmin && !hasTenantSession && superAdminSession ? adminDb : db;

    useEffect(() => {
        let cancelled = false;

        async function resolveRestaurantName() {
            if (!isSuperAdmin || !urlStoreId) {
                setResolvedTenantName(null);
                return;
            }

            try {
                const snap = await getDoc(doc(activeDb, 'restaurants', urlStoreId));
                const name = snap.exists() ? (snap.data().name as string | undefined) : undefined;
                if (!cancelled) {
                    setResolvedTenantName(name || null);
                }
            } catch {
                if (!cancelled) {
                    setResolvedTenantName(null);
                }
            }
        }

        resolveRestaurantName();
        return () => {
            cancelled = true;
        };
    }, [isSuperAdmin, urlStoreId, activeDb]);

    return {
        /** The firestore instance to use — switches to adminDb in God Mode */
        db: activeDb,
        /** The restaurant_id to use in ALL queries — always URL-slug scoped */
        storeId: activeStoreId,
        /** The raw storeId from the URL (useful for building nav hrefs) */
        urlStoreId,
        isAuthorized,
        isSuperAdmin,
        // Super-admins get full 'pro' tier UI access
        subscriptionTier: isSuperAdmin && !hasTenantSession ? 'pro' : subscriptionTier,
        // In super-admin mode, show the actual restaurant display name for the viewed slug.
        tenantName: isSuperAdmin && !hasTenantSession
            ? (resolvedTenantName || urlStoreId || tenantName)
            : tenantName,
        loading: tenantLoading || adminLoading,
    };
}
