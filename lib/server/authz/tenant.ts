import { adminAuth, adminFirestore } from '@/lib/firebase-admin';

export type TenantAccessLevel = 'read' | 'manage';

export type TenantAuthorization = {
    uid: string;
    role: string;
    isSuperAdmin: boolean;
};

function normalizeRole(role: unknown): string {
    return String(role || '').trim().toLowerCase();
}

function isAllowedRole(role: string, level: TenantAccessLevel): boolean {
    if (role === 'super_admin') return true;
    if (level === 'manage') {
        return role === 'owner' || role === 'admin';
    }
    return role === 'owner' || role === 'admin' || role === 'staff';
}

export async function authorizeTenantAccess(
    idToken: string,
    restaurantId: string,
    level: TenantAccessLevel = 'read'
): Promise<TenantAuthorization | null> {
    const decoded = await adminAuth.verifyIdToken(idToken);
    const user = await adminAuth.getUser(decoded.uid);
    const claims = user.customClaims || {};

    const role = normalizeRole(claims.role);
    if (role === 'super_admin') {
        return { uid: decoded.uid, role, isSuperAdmin: true };
    }

    const claimRestaurantId = String(claims.restaurant_id || claims.tenant_id || '').trim();
    if (claimRestaurantId === restaurantId && isAllowedRole(role, level)) {
        return { uid: decoded.uid, role, isSuperAdmin: false };
    }

    // Stale-claims fallback: check live staff role inside requested tenant.
    const staffDoc = await adminFirestore.doc(`restaurants/${restaurantId}/staff/${decoded.uid}`).get();
    const staffRole = normalizeRole(staffDoc.data()?.role);
    if (staffDoc.exists && isAllowedRole(staffRole, level)) {
        return { uid: decoded.uid, role: staffRole, isSuperAdmin: false };
    }

    return null;
}
