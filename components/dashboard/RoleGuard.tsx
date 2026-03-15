'use client';

/**
 * RoleGuard Component
 * -------------------
 * Protects routes based on user role.
 * 
 * Role Permissions:
 * - Owner: Full access to everything
 * - Manager: Everything except billing
 * - Staff: Only orders and tables
 * 
 * Usage:
 * <RoleGuard requiredPermission="can_view_analytics">
 *   <AnalyticsPage />
 * </RoleGuard>
 */

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useSuperAdminAuth } from '@/context/SuperAdminAuthContext';

// Define permissions for each role
export const ROLE_PERMISSIONS = {
    super_admin: {
        can_view_orders: true,
        can_manage_orders: true,
        can_view_menu: true,
        can_manage_menu: true,
        can_view_tables: true,
        can_manage_tables: true,
        can_view_history: true,
        can_view_analytics: true,
        can_view_inventory: true,
        can_manage_inventory: true,
        can_view_branding: true,
        can_manage_branding: true,
        can_view_account: true,
        can_manage_admins: true,
        can_view_billing: true,
    },
    owner: {
        can_view_orders: true,
        can_manage_orders: true,
        can_view_menu: true,
        can_manage_menu: true,
        can_view_tables: true,
        can_manage_tables: true,
        can_view_history: true,
        can_view_analytics: true,
        can_view_inventory: true,
        can_manage_inventory: true,
        can_view_branding: true,
        can_manage_branding: true,
        can_view_account: true,
        can_manage_admins: true,
        can_view_billing: true,
    },
    admin: { // Legacy admin role - same as owner
        can_view_orders: true,
        can_manage_orders: true,
        can_view_menu: true,
        can_manage_menu: true,
        can_view_tables: true,
        can_manage_tables: true,
        can_view_history: true,
        can_view_analytics: true,
        can_view_inventory: true,
        can_manage_inventory: true,
        can_view_branding: true,
        can_manage_branding: true,
        can_view_account: true,
        can_manage_admins: true,
        can_view_billing: true,
    },
    manager: {
        can_view_orders: true,
        can_manage_orders: true,
        can_view_menu: true,
        can_manage_menu: true,
        can_view_tables: true,
        can_manage_tables: true,
        can_view_history: true,
        can_view_analytics: false,
        can_view_inventory: false,
        can_manage_inventory: false,
        can_view_branding: false,
        can_manage_branding: false,
        can_view_account: false,
        can_manage_admins: false,
        can_view_billing: false,
    },
    staff: {
        can_view_orders: true,
        can_manage_orders: true,
        can_view_menu: false,
        can_manage_menu: false,
        can_view_tables: true,
        can_manage_tables: false,
        can_view_history: false,
        can_view_analytics: false,
        can_view_inventory: false,
        can_manage_inventory: false,
        can_view_branding: false,
        can_manage_branding: false,
        can_view_account: false,
        can_manage_admins: false,
        can_view_billing: false,
    },
} as const;

export type RoleType = keyof typeof ROLE_PERMISSIONS;
export type PermissionType = keyof typeof ROLE_PERMISSIONS.owner;

// Map base routes to required permissions
export const ROUTE_PERMISSIONS: Record<string, PermissionType> = {
    '/dashboard/orders': 'can_view_orders',
    '/dashboard/history': 'can_view_history',
    '/dashboard/menu': 'can_view_menu',
    '/dashboard/tables': 'can_view_tables',
    '/dashboard/analytics': 'can_view_analytics',
    '/dashboard/inventory': 'can_view_inventory',
    '/dashboard/branding': 'can_view_branding',
    '/dashboard/account': 'can_view_account',
};

// Helper to check if a role has a permission
export function hasPermission(role: string | null, permission: PermissionType): boolean {
    if (!role) return false;
    if (role === 'super_admin') return true;
    const roleKey = role as RoleType;
    const permissions = ROLE_PERMISSIONS[roleKey];
    if (!permissions) return false;
    return permissions[permission] ?? false;
}

// Helper to get all allowed routes for a role
export function getAllowedRoutes(role: string | null): string[] {
    if (!role) return [];
    if (role === 'super_admin') {
        return Object.keys(ROUTE_PERMISSIONS);
    }
    const roleKey = role as RoleType;
    const permissions = ROLE_PERMISSIONS[roleKey];
    if (!permissions) return [];

    return Object.entries(ROUTE_PERMISSIONS)
        .filter(([_, permission]) => permissions[permission])
        .map(([route]) => route);
}

interface RoleGuardProps {
    children: React.ReactNode;
    requiredPermission?: PermissionType;
    fallbackRoute?: string;
    showToast?: boolean;
}

export function RoleGuard({
    children,
    requiredPermission = 'can_view_orders',
    fallbackRoute = '/dashboard/orders',
    showToast = true
}: RoleGuardProps) {
    const router = useRouter();
    const pathname = usePathname();
    const { userRole, loading, tenantId } = useAuth();
    const { session: superAdminSession, userRole: superAdminRole, loading: superAdminLoading } = useSuperAdminAuth();

    // God mode bypass
    const isSuperAdmin = superAdminSession && superAdminRole === 'super_admin';
    const activeRole = isSuperAdmin ? 'super_admin' : userRole;

    const hasAccess = isSuperAdmin || hasPermission(activeRole, requiredPermission);

    // Resolve dynamic fallback route
    const resolvedFallback = tenantId ? `/${tenantId}${fallbackRoute}` : fallbackRoute;

    useEffect(() => {
        if (loading || superAdminLoading) return;

        if (!hasAccess) {
            if (showToast) {
                toast.error('Access Denied: You do not have permission to view this page.');
            }
            router.replace(resolvedFallback);
        }
    }, [hasAccess, loading, superAdminLoading, router, resolvedFallback, showToast]);

    // Show nothing while checking permissions
    if (loading || superAdminLoading) {
        return (
            <div className="flex items-center justify-center min-h-[200px]">
                <div className="w-8 h-8 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
            </div>
        );
    }

    // If no access, don't render children (redirect will happen)
    if (!hasAccess) {
        return null;
    }

    return <>{children}</>;
}

// HOC for easier usage
export function withRoleGuard<P extends object>(
    Component: React.ComponentType<P>,
    requiredPermission: PermissionType
) {
    return function GuardedComponent(props: P) {
        return (
            <RoleGuard requiredPermission={requiredPermission}>
                <Component {...props} />
            </RoleGuard>
        );
    };
}
