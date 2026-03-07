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
 *   Then in every Supabase query:
 *     .eq('restaurant_id', storeId)    ← always URL-scoped, tab-safe
 */

import { useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export function useRestaurant() {
    const params = useParams<{ storeId: string }>();
    const { tenantId, userRole, tenantName, subscriptionTier, tenantLoading } = useAuth();

    // ── 1. URL slug is the primary data-scoping key ──────────────────────
    // For super-admins navigating /[any-slug]/dashboard, the URL slug is
    // exactly the restaurant they want to inspect. For normal users, the URL
    // slug MUST match their session tenantId (enforced by the layout guard).
    const urlStoreId = params?.storeId || '';

    const isSuperAdmin = userRole === 'super_admin';

    // ── 2. Authorization check ────────────────────────────────────────────
    // Super-admins can navigate anywhere. Regular users are only authorized
    // when the URL slug matches their authenticated tenantId.
    const isAuthorized = isSuperAdmin || urlStoreId === tenantId;

    // ── 3. Active storeId for queries ─────────────────────────────────────
    // For super-admins: always use the URL slug (multi-tab safe).
    // For normal users: use their authenticated tenantId (safe default).
    //
    // Fallback chain: urlStoreId → tenantId → empty string
    // The layout guard ensures a normal user's urlStoreId === tenantId,
    // so this is effectively the same value in the normal case.
    const activeStoreId = isSuperAdmin
        ? (urlStoreId || tenantId)   // super-admin: URL slug first
        : (tenantId || urlStoreId);  // normal user: session tenantId first (verified against URL by layout guard)

    return {
        /** The restaurant_id to use in ALL Supabase queries — always URL-slug scoped */
        storeId: activeStoreId,
        /** The raw storeId from the URL (useful for building nav hrefs) */
        urlStoreId,
        isAuthorized,
        isSuperAdmin,
        // Super-admins get full 'pro' tier UI access for administrative purposes
        subscriptionTier: isSuperAdmin ? 'pro' : subscriptionTier,
        // Super-admins see the restaurant they're viewing, not "Admin View"
        tenantName: isSuperAdmin && urlStoreId
            ? `[Admin] ${urlStoreId}`
            : tenantName,
        loading: tenantLoading,
    };
}
