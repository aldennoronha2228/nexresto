'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
    ShoppingBag, History, UtensilsCrossed, QrCode,
    ChevronLeft, Bell, Search, Menu, X, LogOut, UserCircle,
    BarChart3, Package, Palette, Sparkles, Lock,
    AlertTriangle, Shield, LogIn, ArrowLeft, Users
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useSuperAdminAuth } from '@/context/SuperAdminAuthContext';
import { useRestaurant } from '@/hooks/useRestaurant';
import { GlobalSearch } from '@/components/dashboard/GlobalSearch';
import { NotificationBell } from '@/components/dashboard/NotificationBell';
import { UpgradeModal } from '@/components/dashboard/UpgradeModal';
import { SubscriptionGuard } from '@/components/dashboard/SubscriptionGuard';
import NexRestoLogo from '@/components/ui/NexRestoLogo';
import GeminiSupportChat from '@/components/dashboard/GeminiSupportChat';
import { hasPermission, getAllowedRoutes, ROUTE_PERMISSIONS, type PermissionType } from '@/components/dashboard/RoleGuard';
import { tenantAuth, adminAuth } from '@/lib/firebase';
import { toast } from 'sonner';


// Base navigation structure — paths are relative to /[storeId]
const baseNavigation = [
    { name: 'Live Orders', basePath: '/dashboard/orders', icon: ShoppingBag, shortName: 'Orders', proOnly: false, permission: 'can_view_orders' as PermissionType },
    { name: 'Order History', basePath: '/dashboard/history', icon: History, shortName: 'History', proOnly: false, permission: 'can_view_history' as PermissionType },
    { name: 'Customers', basePath: '/dashboard/customers', icon: Users, shortName: 'Customers', proOnly: false, permission: 'can_view_history' as PermissionType },
    { name: 'Menu Management', basePath: '/dashboard/menu', icon: UtensilsCrossed, shortName: 'Menu', proOnly: false, permission: 'can_view_menu' as PermissionType },
    { name: 'Tables & QR', basePath: '/dashboard/tables', icon: QrCode, shortName: 'Tables', proOnly: false, permission: 'can_view_tables' as PermissionType },
    { name: 'Analytics', basePath: '/dashboard/analytics', icon: BarChart3, shortName: 'Analytics', proOnly: true, permission: 'can_view_analytics' as PermissionType },
    { name: 'Inventory', basePath: '/dashboard/inventory', icon: Package, shortName: 'Inventory', proOnly: true, permission: 'can_view_inventory' as PermissionType },
    { name: 'Branding', basePath: '/dashboard/branding', icon: Palette, shortName: 'Brand', proOnly: true, permission: 'can_view_branding' as PermissionType },
    { name: 'Account Settings', basePath: '/dashboard/account', icon: UserCircle, shortName: 'Account', proOnly: false, permission: 'can_view_account' as PermissionType },
    { name: 'Members', basePath: '/dashboard/members', icon: Shield, shortName: 'Members', proOnly: false, permission: 'can_manage_admins' as PermissionType },
];

// Helper: build full nav href always scoped to the URL slug (not the session restId)
// This guarantees each tab stays in its own /[storeId]/ namespace.
function buildNavHref(urlSlug: string, basePath: string): string {
    return `/${urlSlug}${basePath}`;
}

function demoResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function buildDemoTables() {
    return [
        { id: 'T-01', name: 'Table 1', seats: 4, status: 'available', x: 180, y: 130 },
        { id: 'T-02', name: 'Table 2', seats: 2, status: 'busy', x: 360, y: 130 },
        { id: 'T-03', name: 'Table 3', seats: 6, status: 'available', x: 560, y: 140 },
        { id: 'T-04', name: 'Table 4', seats: 4, status: 'reserved', x: 220, y: 320 },
        { id: 'T-05', name: 'Table 5', seats: 8, status: 'busy', x: 460, y: 320 },
    ];
}

function buildDemoMenu() {
    const categories = [
        { id: 'cat-app', name: 'Appetizers' },
        { id: 'cat-main', name: 'Main Course' },
        { id: 'cat-bev', name: 'Beverages' },
    ];
    const menuItems = [
        { id: 'itm-1', name: 'Truffle Fries', price: 249, category_id: 'cat-app', categories: { name: 'Appetizers' }, type: 'veg', available: true },
        { id: 'itm-2', name: 'Smoked Paneer Bowl', price: 379, category_id: 'cat-main', categories: { name: 'Main Course' }, type: 'veg', available: true },
        { id: 'itm-3', name: 'Citrus Chicken', price: 439, category_id: 'cat-main', categories: { name: 'Main Course' }, type: 'non-veg', available: true },
        { id: 'itm-4', name: 'Cold Brew Tonic', price: 179, category_id: 'cat-bev', categories: { name: 'Beverages' }, type: 'veg', available: true },
    ];
    return { categories, menuItems };
}

function buildDemoOrders() {
    const now = Date.now();
    return [
        {
            id: 'ord-demo-1',
            table: 'T-02',
            status: 'new',
            total: 628,
            created_at: new Date(now - 6 * 60000).toISOString(),
            items: [{ name: 'Truffle Fries', qty: 1, price: 249 }, { name: 'Cold Brew Tonic', qty: 1, price: 179 }, { name: 'Citrus Chicken', qty: 1, price: 200 }],
            daily_order_number: 41,
        },
        {
            id: 'ord-demo-2',
            table: 'T-05',
            status: 'preparing',
            total: 958,
            created_at: new Date(now - 18 * 60000).toISOString(),
            items: [{ name: 'Smoked Paneer Bowl', qty: 2, price: 379 }, { name: 'Cold Brew Tonic', qty: 1, price: 200 }],
            daily_order_number: 40,
        },
        {
            id: 'ord-demo-3',
            table: 'T-01',
            status: 'paid',
            total: 1210,
            created_at: new Date(now - 86 * 60000).toISOString(),
            items: [{ name: 'Citrus Chicken', qty: 2, price: 439 }, { name: 'Truffle Fries', qty: 1, price: 332 }],
            daily_order_number: 39,
        },
    ];
}

function buildDemoReports() {
    const today = new Date();
    return Array.from({ length: 7 }).map((_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() - i - 1);
        return {
            id: `demo-report-${i + 1}`,
            report_date: d.toISOString().slice(0, 10),
            total_orders: 32 + i * 3,
            total_revenue: 18500 + i * 2100,
            busiest_hour: 20,
        };
    });
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const [collapsed, setCollapsed] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [upgradeFeature, setUpgradeFeature] = useState<string>('');
    const pathname = usePathname();
    const params = useParams<{ storeId: string }>();
    const router = useRouter();
    const {
        user,
        session,
        loading,
        signOut,
        error,
        userRole,
        mustChangePassword,
        refreshTenant,
        subscriptionStatus,
        subscriptionEndDate,
        subscriptionDaysRemaining,
        isImpersonating,
    } = useAuth();
    const { sessionTenantId, isSuperAdmin, subscriptionTier, tenantName } = useRestaurant();
    const urlStoreId = params?.storeId || '';
    const [showConflict, setShowConflict] = useState(false);
    const [displayTenantName, setDisplayTenantName] = useState<string>('NexResto');
    const [isRestaurantTemporarilyDisabled, setIsRestaurantTemporarilyDisabled] = useState(false);
    const [isDemoMode, setIsDemoMode] = useState(false);

    // Get Super Admin state (God Mode check)
    const {
        session: superAdminSession,
        userRole: superAdminRole,
        loading: superAdminLoading
    } = useSuperAdminAuth();

    const isGodMode = !session && superAdminSession && superAdminRole === 'super_admin';
    const currentDashboardBase = Object.keys(ROUTE_PERMISSIONS).find((basePath) => {
        const fullBase = `/${urlStoreId}${basePath}`;
        return pathname === fullBase || pathname.startsWith(`${fullBase}/`);
    });
    const currentDashboardPermission = currentDashboardBase
        ? ROUTE_PERMISSIONS[currentDashboardBase as keyof typeof ROUTE_PERMISSIONS]
        : null;

    // Instead of redirecting super admins to /super-admin, we let them view this page!
    // But if a regular tenant user has no session, redirect them to login.
    useEffect(() => {
        if (!loading && !superAdminLoading) {
            if (!session && !isGodMode) {
                router.replace('/login');
            }

            if (session && !isGodMode && mustChangePassword) {
                router.replace('/change-password');
                return;
            }

            // Authenticated but no resolved claims/profile -> do not let dashboard query Firestore.
            if (session && !isGodMode && !userRole) {
                router.replace('/unauthorized');
                return;
            }

            if (
                session &&
                !isGodMode &&
                userRole &&
                !showConflict &&
                currentDashboardPermission &&
                !hasPermission(userRole, currentDashboardPermission)
            ) {
                const allowedRoutes = getAllowedRoutes(userRole);
                const fallbackBase = allowedRoutes[0] || '/dashboard/orders';
                router.replace(`/${urlStoreId}${fallbackBase}`);
            }
        }
    }, [
        loading,
        superAdminLoading,
        session,
        isGodMode,
        mustChangePassword,
        userRole,
        showConflict,
        currentDashboardPermission,
        urlStoreId,
        router,
    ]);

    // ── Session Guard (inline overlay — no redirect, no separate page) ───────────
    // If a non-super-admin user navigates to /restaurant-a/dashboard
    // while their session belongs to restaurant-b, show a conflict overlay.
    // No router.replace() = no new page = no prerender target in the build.
    useEffect(() => {
        // God Mode bypasses the conflict check entirely.
        if (isGodMode) {
            setShowConflict(false);
            return;
        }

        if (
            !loading &&
            userRole &&
            userRole !== 'super_admin' &&
            urlStoreId &&
            sessionTenantId &&
            urlStoreId !== sessionTenantId
        ) {
            setShowConflict(true);
        } else {
            setShowConflict(false);
        }
    }, [sessionTenantId, urlStoreId, loading, userRole, isGodMode]);

    // Check if user has Pro tier (strict): do not infer Pro access from impersonation.
    const isPro = isGodMode || isSuperAdmin || subscriptionTier === 'pro' || subscriptionTier === '2k' || subscriptionTier === '2.5k';
    const showEndingSoonReminder =
        !isGodMode &&
        !!subscriptionEndDate &&
        (subscriptionStatus === 'active' || subscriptionStatus === 'trial') &&
        typeof subscriptionDaysRemaining === 'number' &&
        subscriptionDaysRemaining >= 0 &&
        subscriptionDaysRemaining <= 5;

    // Resolve a stable display name for the current URL tenant.
    // This avoids showing slug fallbacks like `the-grand-...` in the sidebar.
    useEffect(() => {
        const fallbackName = tenantName || urlStoreId || 'NexResto';
        setDisplayTenantName(fallbackName);

        if (!urlStoreId) {
            setIsRestaurantTemporarilyDisabled(false);
            return;
        }

        let cancelled = false;

        (async () => {
            try {
                const token = adminAuth.currentUser
                    ? await adminAuth.currentUser.getIdToken(true)
                    : tenantAuth.currentUser
                        ? await tenantAuth.currentUser.getIdToken(true)
                        : isGodMode
                            ? superAdminSession?.access_token
                            : session?.access_token;

                if (!token) return;

                const res = await fetch(`/api/tenant/name?restaurantId=${encodeURIComponent(urlStoreId)}`, {
                    headers: { Authorization: `Bearer ${token}` },
                    cache: 'no-store',
                });

                if (!res.ok) {
                    return;
                }

                const data = await res.json();
                const nextName = (data?.name || '').toString().trim();
                if (!cancelled && nextName) {
                    setDisplayTenantName(nextName);
                }
                if (!cancelled) {
                    setIsRestaurantTemporarilyDisabled(Boolean(data?.accountTemporarilyDisabled));
                }
            } catch {
                // Keep fallback name if request fails.
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [tenantName, urlStoreId, isGodMode, session?.access_token, superAdminSession?.access_token]);

    // ── Navigation scoped to URL slug ───────────────────────────────────
    // Always build hrefs from `urlStoreId` (the slug in the address bar),
    // NOT from the session's tenantId. This ensures:
    //   • Each browser tab stays in its own /<slug>/ namespace.
    //   • Super-admins can have multiple tabs open for different restaurants.
    //   • Clicking a nav item never jumps you to a different restaurant.
    const navigation = baseNavigation.map(item => ({
        ...item,
        href: buildNavHref(urlStoreId, item.basePath),
    }));

    // Filter navigation based on user role permissions
    const activeRole = userRole || superAdminRole;

    const filteredNavigation = navigation.filter(item =>
        hasPermission(activeRole, item.permission)
    );

    const activeNavItem = navigation.find((item) =>
        pathname === item.href ||
        pathname.startsWith(`${item.href}/`) ||
        (pathname === `/${urlStoreId}/dashboard` && item.href === `/${urlStoreId}/dashboard/orders`)
    );
    const isKdsRoute = pathname === `/${urlStoreId}/dashboard/kds` || pathname.startsWith(`/${urlStoreId}/dashboard/kds/`);
    const desktopCollapsedWidth = isKdsRoute ? 72 : 80;
    const desktopExpandedWidth = isKdsRoute ? 200 : 240;
    const tabletRailWidthClass = isKdsRoute ? 'w-16' : 'w-20';
    const mobileDrawerWidthClass = isKdsRoute ? 'w-56 max-w-[78vw]' : 'w-72 max-w-[88vw]';
    const isGrandHotel = /grand/i.test(displayTenantName) || /grand/i.test(urlStoreId);

    useEffect(() => {
        if (!urlStoreId) return;
        const storageKey = `nexresto:demo-mode:${urlStoreId}`;
        const saved = localStorage.getItem(storageKey);
        setIsDemoMode(saved === '1');
    }, [urlStoreId]);

    useEffect(() => {
        if (!urlStoreId) return;
        const storageKey = `nexresto:demo-mode:${urlStoreId}`;
        if (!isGrandHotel) {
            setIsDemoMode(false);
            localStorage.removeItem(storageKey);
            return;
        }
        localStorage.setItem(storageKey, isDemoMode ? '1' : '0');
    }, [isDemoMode, isGrandHotel, urlStoreId]);

    useEffect(() => {
        if (!isGrandHotel || !isDemoMode) return;

        const originalFetch = window.fetch.bind(window);
        const demoTables = buildDemoTables();
        const demoMenu = buildDemoMenu();
        const demoOrders = buildDemoOrders();
        const demoReports = buildDemoReports();

        window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
            const raw = typeof input === 'string'
                ? input
                : input instanceof URL
                    ? input.toString()
                    : input.url;

            const method = (init?.method || (typeof input !== 'string' && !(input instanceof URL) ? input.method : 'GET') || 'GET').toUpperCase();
            const url = raw.startsWith('http') ? new URL(raw).pathname + new URL(raw).search : raw;

            if (url.includes('/api/tables/layout')) {
                if (method === 'GET') {
                    return demoResponse({
                        found: true,
                        layout: {
                            tables: demoTables,
                            walls: [],
                            desks: [],
                            floorPlans: [{ id: 'demo-layout', name: 'Grand Demo Layout', tables: demoTables, walls: [], desks: [] }],
                        },
                    });
                }
                return demoResponse({ ok: true, simulated: true });
            }

            if (url.includes('/api/orders/live')) {
                return demoResponse({ orders: demoOrders.filter((o) => ['new', 'preparing', 'done', 'paid'].includes(o.status)) });
            }

            if (url.includes('/api/orders/history')) {
                return demoResponse({ orders: demoOrders });
            }

            if (url.includes('/api/orders/manage')) {
                return demoResponse({ ok: true, simulated: true });
            }

            if (url.includes('/api/menu/list')) {
                return demoResponse({ menuItems: demoMenu.menuItems, categories: demoMenu.categories });
            }

            if (url.includes('/api/menu/categories')) {
                return demoResponse({ ok: true, categories: demoMenu.categories, simulated: true });
            }

            if (url.includes('/api/reports?')) {
                return demoResponse({ reports: demoReports });
            }

            if (url.includes('/api/reports') && method === 'POST') {
                return demoResponse({ report: demoReports[0] });
            }

            if (url.includes('/api/reports/settings')) {
                return demoResponse({ ok: true, simulated: true });
            }

            if (url.includes('/api/branding/settings')) {
                return demoResponse({
                    settings: {
                        primaryColor: '#0f172a',
                        accentColor: '#38bdf8',
                        logoUrl: '',
                    },
                    simulated: true,
                });
            }

            if (url.includes('/api/branding/upload')) {
                return demoResponse({ url: '', simulated: true });
            }

            if (url.includes('/api/') && method !== 'GET') {
                return demoResponse({ ok: true, simulated: true });
            }

            return originalFetch(input, init);
        };

        return () => {
            window.fetch = originalFetch;
        };
    }, [isDemoMode, isGrandHotel]);
    const isProRouteBlocked = Boolean(activeNavItem?.proOnly) && !isPro;

    const mobilePrimaryNavigation = filteredNavigation.filter((item) =>
        item.basePath === '/dashboard/orders' ||
        item.basePath === '/dashboard/menu' ||
        item.basePath === '/dashboard/analytics'
    );

    const membersNavigation = filteredNavigation.filter((item) => item.basePath === '/dashboard/members');
    const primaryNavigation = filteredNavigation.filter((item) => item.basePath !== '/dashboard/members');

    // Handle clicking on a Pro-only feature when on Starter tier
    const handleNavClick = (item: typeof navigation[0]) => {
        // Check role permission first (super admins bypass)
        if (!isSuperAdmin && !hasPermission(userRole, item.permission)) {
            toast.error('Access Denied: You do not have permission to view this page.');
            return;
        }

        // Then check Pro tier
        if (item.proOnly && !isPro) {
            setUpgradeFeature(item.name);
            setShowUpgradeModal(true);
            return;
        }
        router.push(item.href);
    };

    // Refresh session on route change to prevent stale state
    useEffect(() => {
        tenantAuth.currentUser?.getIdToken(true).catch(() => { });
    }, [pathname]);

    // Refresh tenant profile when tab regains focus/visibility.
    // This keeps subscription tier/status in sync after super-admin changes.
    useEffect(() => {
        if (!session || isGodMode) return;

        const onVisibilityOrFocus = () => {
            if (document.visibilityState === 'visible') {
                refreshTenant().catch(() => { });
            }
        };

        window.addEventListener('focus', onVisibilityOrFocus);
        document.addEventListener('visibilitychange', onVisibilityOrFocus);

        return () => {
            window.removeEventListener('focus', onVisibilityOrFocus);
            document.removeEventListener('visibilitychange', onVisibilityOrFocus);
        };
    }, [session, isGodMode, refreshTenant]);



    // Force redirect if auth error
    useEffect(() => {
        if (error) {
            console.warn('[DashboardLayout] Auth error, redirecting to login:', error);
            router.replace('/login');
        }
    }, [error, router]);

    // Provide a localized sign out for the God Mode header
    const { signOut: superAdminSignOut } = useSuperAdminAuth();

    const handleSignOut = async () => {
        // If they are exclusively relying on God Mode without a tenant session,
        // sign them out of their super admin session. Otherwise sign out of tenant.
        if (isGodMode && !session) {
            await superAdminSignOut();
        } else {
            await signOut();
        }
        router.push('/login');
    };

    if (loading || superAdminLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin"></div>
                    <p className="text-slate-400 text-sm font-medium">Verifying session...</p>
                </div>
            </div>
        );
    }

    // If no tenant session AND no god mode session, block render
    if (!session && !isGodMode) {
        return null; // Will redirect via useEffect
    }

    if (session && !isGodMode && !userRole) {
        return null; // Will redirect via useEffect
    }

    if (session && !isGodMode && mustChangePassword) {
        return null; // Will redirect via useEffect
    }

    if (isRestaurantTemporarilyDisabled) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
                <div className="max-w-md w-full rounded-3xl border border-slate-700 bg-slate-900 p-8 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-rose-500/20 flex items-center justify-center">
                        <Lock className="w-8 h-8 text-rose-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Account Temporarily Disabled</h1>
                    <p className="text-slate-400 text-sm mb-6">
                        This restaurant account has been temporarily disabled by platform administration.
                    </p>
                    <div className="space-y-3">
                        <button
                            onClick={handleSignOut}
                            className="w-full h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold transition-colors"
                        >
                            Sign Out
                        </button>
                        {isGodMode && (
                            <button
                                onClick={() => router.replace('/super-admin/restaurants')}
                                className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
                            >
                                Back to Super Admin
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ── Inline Session Conflict Overlay ────────────────────────────────────────
    // Renders as a full-screen takeover instead of navigating to a separate page.
    // Keeps the build prerender-safe: no new routes, no useSearchParams, nothing.
    if (showConflict) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-950 relative overflow-hidden">
                {/* Background orbs */}
                <div className="absolute inset-0">
                    <div className="absolute inset-0 bg-slate-950" />
                    {[
                        { cx: '20%', cy: '30%', r: 350, color: '#7c3aed' },
                        { cx: '80%', cy: '70%', r: 300, color: '#be123c' },
                    ].map((orb, i) => (
                        <motion.div key={i}
                            animate={{ scale: [1, 1.15, 1], opacity: [0.1, 0.2, 0.1] }}
                            transition={{ duration: 10, delay: i * 3, repeat: Infinity, ease: 'easeInOut' }}
                            style={{
                                position: 'absolute', left: orb.cx, top: orb.cy,
                                width: orb.r * 2, height: orb.r * 2,
                                transform: 'translate(-50%, -50%)', borderRadius: '50%',
                                background: `radial-gradient(circle, ${orb.color}44 0%, transparent 70%)`,
                                filter: 'blur(60px)',
                            }}
                        />
                    ))}
                </div>

                <div className="relative z-10 w-full max-w-lg px-4">
                    <motion.div
                        initial={{ opacity: 0, y: 24, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                        className="bg-slate-900/90 backdrop-blur-2xl border border-slate-700/50 rounded-3xl shadow-2xl overflow-hidden"
                    >
                        <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500" />
                        <div className="p-8">
                            {/* Icon */}
                            <div className="flex justify-center mb-6">
                                <motion.div animate={{ rotate: [0, -3, 3, -3, 0] }} transition={{ duration: 0.6, delay: 0.3 }}
                                    className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500/20 to-rose-500/20 border border-amber-500/30 flex items-center justify-center"
                                >
                                    <AlertTriangle className="w-10 h-10 text-amber-400" />
                                </motion.div>
                            </div>
                            {/* Title */}
                            <div className="text-center mb-6">
                                <h1 className="text-2xl font-bold text-white mb-2">Session Conflict</h1>
                                <p className="text-slate-400 text-sm leading-relaxed">
                                    You tried to access{' '}
                                    <code className="px-1.5 py-0.5 bg-slate-800 text-amber-300 rounded text-xs font-mono">/{urlStoreId}/dashboard</code>
                                    , but your active session belongs to a different restaurant.
                                </p>
                            </div>
                            {/* Session info */}
                            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 mb-6">
                                <div className="flex items-center gap-2 mb-3">
                                    <Shield className="w-4 h-4 text-blue-400" />
                                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Session</span>
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <p className="text-slate-500 text-xs">Restaurant</p>
                                        <p className="text-white font-medium truncate">{tenantName ?? '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-500 text-xs">Restaurant ID</p>
                                        <p className="text-blue-300 font-mono text-xs truncate">{sessionTenantId ?? '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-500 text-xs">Attempted URL</p>
                                        <p className="text-amber-300 font-mono text-xs truncate">/{urlStoreId}/...</p>
                                    </div>
                                </div>
                            </div>
                            {/* Actions */}
                            <div className="space-y-3">
                                {sessionTenantId && (
                                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                        onClick={() => router.replace(`/${sessionTenantId}/dashboard/orders`)}
                                        className="w-full h-12 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-blue-500/25 transition-all"
                                    >
                                        <Shield className="w-4 h-4" />
                                        Go to My Restaurant ({tenantName ?? sessionTenantId})
                                    </motion.button>
                                )}
                                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                    onClick={async () => { await signOut(); router.replace('/login'); }}
                                    className="w-full h-12 flex items-center justify-center gap-2 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 text-white rounded-xl font-medium text-sm transition-all"
                                >
                                    <LogIn className="w-4 h-4" />
                                    Sign in as a Different Account
                                </motion.button>
                                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                    onClick={() => router.back()}
                                    className="w-full h-10 flex items-center justify-center gap-2 text-slate-500 hover:text-slate-300 text-sm transition-colors"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                    Go Back
                                </motion.button>
                            </div>
                            <p className="text-center text-xs text-slate-600 mt-6">
                                Each browser tab maintains an isolated session.
                            </p>
                        </div>
                    </motion.div>
                </div>
            </div>
        );
    }

    const activeUser = user || superAdminSession?.user;

    const tenantInitial = (
        (displayTenantName || urlStoreId || activeUser?.displayName || activeUser?.email || 'R')
            .trim()
            .match(/[A-Za-z0-9]/)?.[0] || 'R'
    ).toUpperCase();

    return (
        <SubscriptionGuard>
                <div className="min-h-screen bg-[linear-gradient(115deg,#f3f4f6_0%,#eef2f7_48%,#dfebe8_100%)]">
                {/* Desktop Sidebar */}
                <motion.aside
                    initial={false}
                    animate={{ width: collapsed ? desktopCollapsedWidth : desktopExpandedWidth }}
                    className="hidden lg:block fixed left-0 top-0 h-full premium-sidebar border-r border-white/10 z-30"
                >
                    <div className="flex flex-col h-full">
                        {/* Logo */}
                            <div className="h-16 flex items-center px-6 border-b border-white/10">
                            <motion.div initial={false} animate={{ opacity: collapsed ? 0 : 1 }} className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-xl bg-white/10 ring-1 ring-white/20 flex items-center justify-center shadow-lg shadow-amber-500/30">
                                    <NexRestoLogo variant="mark" className="w-5 h-5" priority />
                                </div>
                                    {!collapsed && <span className="font-semibold text-slate-100 truncate max-w-[140px]" title={displayTenantName}>{displayTenantName}</span>}
                            </motion.div>
                        </div>

                        {/* Navigation */}
                        <nav className="flex-1 px-3 py-4 space-y-1">
                            {primaryNavigation.map((item) => {
                                const isActive = pathname === item.href || (pathname === `/${urlStoreId}/dashboard` && item.href === `/${urlStoreId}/dashboard/orders`);
                                const isLocked = item.proOnly && !isPro;
                                return (
                                    <button
                                        key={item.name}
                                        onClick={() => handleNavClick(item)}
                                        className="w-full text-left"
                                    >
                                        <motion.div
                                            whileHover={{ x: 4 }}
                                            className={cn(
                                                    "flex items-center gap-3 px-3 py-2.5 rounded-full transition-all duration-200 premium-sidebar-text",
                                                    isActive ? "bg-white/12 border border-white/15 text-white" : "hover:bg-white/5 hover:text-white",
                                                isLocked && "opacity-60"
                                            )}
                                        >
                                            <item.icon className="w-5 h-5 flex-shrink-0" />
                                            {!collapsed && (
                                                <>
                                                    <span className="text-sm font-medium flex-1">{item.name}</span>
                                                    {isLocked && (
                                                        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[9px] font-bold uppercase tracking-wider rounded-full">
                                                            <Sparkles className="w-2.5 h-2.5" />
                                                            Pro
                                                        </span>
                                                    )}
                                                </>
                                            )}
                                        </motion.div>
                                    </button>
                                );
                            })}

                            {membersNavigation.length > 0 && !collapsed && (
                                <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400/80">Members</div>
                            )}

                            {membersNavigation.map((item) => {
                                const isActive = pathname === item.href || (pathname === `/${urlStoreId}/dashboard` && item.href === `/${urlStoreId}/dashboard/orders`);
                                const isLocked = item.proOnly && !isPro;
                                return (
                                    <button
                                        key={item.name}
                                        onClick={() => handleNavClick(item)}
                                        className="w-full text-left"
                                    >
                                        <motion.div
                                            whileHover={{ x: 4 }}
                                            className={cn(
                                                "flex items-center gap-3 px-3 py-2.5 rounded-full transition-all duration-200 premium-sidebar-text",
                                                isActive ? "bg-white/12 border border-white/15 text-white" : "hover:bg-white/5 hover:text-white",
                                                isLocked && "opacity-60"
                                            )}
                                        >
                                            <item.icon className="w-5 h-5 flex-shrink-0" />
                                            {!collapsed && (
                                                <>
                                                    <span className="text-sm font-medium flex-1">{item.name}</span>
                                                    {isLocked && (
                                                        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[9px] font-bold uppercase tracking-wider rounded-full">
                                                            <Sparkles className="w-2.5 h-2.5" />
                                                            Pro
                                                        </span>
                                                    )}
                                                </>
                                            )}
                                        </motion.div>
                                    </button>
                                );
                            })}

                            <button
                                onClick={handleSignOut}
                                className="w-full text-left"
                            >
                                <motion.div
                                    whileHover={{ x: 4 }}
                                    className="flex items-center gap-3 px-3 py-2.5 rounded-full transition-all duration-200 text-rose-200 hover:bg-rose-500/20 hover:text-rose-100"
                                >
                                    <LogOut className="w-5 h-5 flex-shrink-0" />
                                    {!collapsed && <span className="text-sm font-medium flex-1">Sign Out</span>}
                                </motion.div>
                            </button>

                        </nav>

                        {/* Collapse Button */}
                            <div className="p-3 border-t border-white/10">
                            <motion.button
                                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                onClick={() => setCollapsed(!collapsed)}
                                    className="w-full h-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 transition-colors"
                            >
                                <motion.div animate={{ rotate: collapsed ? 180 : 0 }} transition={{ duration: 0.3 }}>
                                        <ChevronLeft className="w-5 h-5 text-slate-100" />
                                </motion.div>
                            </motion.button>
                        </div>
                    </div>
                </motion.aside>

                {/* Tablet Sidebar Rail (icon-only) */}
                <aside className={cn('hidden md:flex lg:hidden fixed left-0 top-0 h-full premium-sidebar border-r border-white/10 z-30', tabletRailWidthClass)}>
                    <div className="flex flex-col h-full w-full">
                        <div className="h-16 flex items-center justify-center border-b border-white/10">
                            <div className="w-8 h-8 rounded-xl bg-white/10 ring-1 ring-white/20 flex items-center justify-center shadow-lg shadow-amber-500/30">
                                <NexRestoLogo variant="mark" className="w-5 h-5" priority />
                            </div>
                        </div>

                        <nav className="flex-1 px-2 py-4 space-y-2">
                            {primaryNavigation.map((item) => {
                                const isActive = pathname === item.href || (pathname === `/${urlStoreId}/dashboard` && item.href === `/${urlStoreId}/dashboard/orders`);
                                const isLocked = item.proOnly && !isPro;

                                return (
                                    <button
                                        key={`tablet-${item.name}`}
                                        onClick={() => handleNavClick(item)}
                                        className="w-full"
                                        title={item.name}
                                    >
                                        <div
                                            className={cn(
                                                'h-11 rounded-2xl flex items-center justify-center transition-all premium-sidebar-text',
                                                isActive ? 'bg-white/12 border border-white/15 text-white' : 'hover:bg-white/5 hover:text-white',
                                                isLocked && 'opacity-60'
                                            )}
                                        >
                                            <item.icon className="w-5 h-5" />
                                        </div>
                                    </button>
                                );
                            })}

                            {membersNavigation.length > 0 && (
                                <div className="mx-2 my-1 h-px bg-white/10" />
                            )}

                            {membersNavigation.map((item) => {
                                const isActive = pathname === item.href || (pathname === `/${urlStoreId}/dashboard` && item.href === `/${urlStoreId}/dashboard/orders`);
                                const isLocked = item.proOnly && !isPro;

                                return (
                                    <button
                                        key={`tablet-${item.name}`}
                                        onClick={() => handleNavClick(item)}
                                        className="w-full"
                                        title={item.name}
                                    >
                                        <div
                                            className={cn(
                                                'h-11 rounded-2xl flex items-center justify-center transition-all premium-sidebar-text',
                                                isActive ? 'bg-white/12 border border-white/15 text-white' : 'hover:bg-white/5 hover:text-white',
                                                isLocked && 'opacity-60'
                                            )}
                                        >
                                            <item.icon className="w-5 h-5" />
                                        </div>
                                    </button>
                                );
                            })}

                            <button
                                onClick={handleSignOut}
                                className="w-full"
                                title="Sign Out"
                            >
                                <div className="h-11 rounded-2xl flex items-center justify-center transition-all text-rose-200 hover:bg-rose-500/20 hover:text-rose-100">
                                    <LogOut className="w-5 h-5" />
                                </div>
                            </button>
                        </nav>
                    </div>
                </aside>

                {/* Mobile Menu Overlay */}
                <AnimatePresence>
                    {mobileMenuOpen && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                            className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
                            onClick={() => setMobileMenuOpen(false)}
                        >
                            <motion.div
                                initial={{ x: '-100%' }}
                                animate={{ x: 0 }}
                                exit={{ x: '-100%' }}
                                transition={{ type: 'spring', stiffness: 320, damping: 34, mass: 0.85 }}
                                onClick={(e) => e.stopPropagation()}
                                className={cn('absolute left-0 top-0 h-full premium-sidebar shadow-2xl will-change-transform', mobileDrawerWidthClass)}
                            >
                                <div className="flex flex-col h-full">
                                        <div className="h-16 flex items-center justify-between px-6 border-b border-white/10 premium-sidebar">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-xl bg-white/10 ring-1 ring-white/20 flex items-center justify-center shadow-lg shadow-amber-500/30">
                                            <NexRestoLogo variant="mark" className="w-5 h-5" priority />
                                            </div>
                                                <span className="font-semibold text-slate-100 truncate max-w-[170px]" title={displayTenantName}>{displayTenantName}</span>
                                        </div>
                                            <button onClick={() => setMobileMenuOpen(false)} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="Close menu">
                                                <X className="w-5 h-5 text-slate-100" />
                                            </button>
                                    </div>
                                        <nav className="flex-1 px-3 py-4 space-y-1 premium-sidebar">
                                        {isGrandHotel && (
                                            <div className="mb-3 px-1">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const next = !isDemoMode;
                                                        setIsDemoMode(next);
                                                        toast.success(next ? 'Demo mode enabled for The Grand' : 'Demo mode disabled');
                                                    }}
                                                    className={cn(
                                                        'w-full flex items-center justify-between px-3 py-2.5 rounded-2xl border text-sm font-medium transition-colors',
                                                        isDemoMode
                                                            ? 'bg-emerald-500/15 border-emerald-300/40 text-emerald-100'
                                                            : 'bg-white/5 border-white/15 text-slate-200'
                                                    )}
                                                >
                                                    <span>Demo Mode</span>
                                                    <span className={cn('w-7 h-4 rounded-full relative', isDemoMode ? 'bg-emerald-500' : 'bg-slate-500')}>
                                                        <span className={cn('absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all', isDemoMode ? 'left-3.5' : 'left-0.5')} />
                                                    </span>
                                                </button>
                                            </div>
                                        )}
                                        {primaryNavigation.map((item) => {
                                            const isActive = pathname === item.href;
                                            const isLocked = item.proOnly && !isPro;
                                            return (
                                                <button
                                                    key={item.name}
                                                    onClick={() => { setMobileMenuOpen(false); handleNavClick(item); }}
                                                    className="w-full text-left"
                                                >
                                                    <div className={cn(
                                                            "flex items-center gap-3 px-3 py-2.5 rounded-full transition-all duration-200 premium-sidebar-text",
                                                            isActive ? "bg-white/12 border border-white/15 text-white" : "hover:bg-white/5 hover:text-white",
                                                        isLocked && "opacity-60"
                                                    )}>
                                                        <item.icon className="w-5 h-5 flex-shrink-0" />
                                                        <span className="text-sm font-medium flex-1">{item.name}</span>
                                                        {isLocked && (
                                                            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[9px] font-bold uppercase tracking-wider rounded-full">
                                                                <Sparkles className="w-2.5 h-2.5" />
                                                                Pro
                                                            </span>
                                                        )}
                                                    </div>
                                                </button>
                                            );
                                        })}

                                        {membersNavigation.length > 0 && (
                                            <div className="pt-2 mt-2 border-t border-white/10 space-y-1">
                                                <div className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400/80">Members</div>
                                                {membersNavigation.map((item) => {
                                                    const isActive = pathname === item.href;
                                                    const isLocked = item.proOnly && !isPro;
                                                    return (
                                                        <button
                                                            key={`mobile-${item.name}`}
                                                            onClick={() => { setMobileMenuOpen(false); handleNavClick(item); }}
                                                            className="w-full text-left"
                                                        >
                                                            <div className={cn(
                                                                "flex items-center gap-3 px-3 py-2.5 rounded-full transition-all duration-200 premium-sidebar-text",
                                                                isActive ? "bg-white/12 border border-white/15 text-white" : "hover:bg-white/5 hover:text-white",
                                                                isLocked && "opacity-60"
                                                            )}>
                                                                <item.icon className="w-5 h-5 flex-shrink-0" />
                                                                <span className="text-sm font-medium flex-1">{item.name}</span>
                                                                {isLocked && (
                                                                    <span className="flex items-center gap-1 px-1.5 py-0.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[9px] font-bold uppercase tracking-wider rounded-full">
                                                                        <Sparkles className="w-2.5 h-2.5" />
                                                                        Pro
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        <button
                                            onClick={() => { setMobileMenuOpen(false); handleSignOut(); }}
                                            className="w-full text-left"
                                        >
                                            <div className="flex items-center gap-3 px-3 py-2.5 rounded-full transition-all duration-200 text-rose-200 hover:bg-rose-500/20 hover:text-rose-100">
                                                <LogOut className="w-5 h-5 flex-shrink-0" />
                                                <span className="text-sm font-medium flex-1">Sign Out</span>
                                            </div>
                                        </button>

                                    </nav>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Main Content */}
                <div className={cn('md:pl-20 lg:pl-60', isKdsRoute && 'md:pl-16 lg:pl-[12.5rem]')}>
                    <motion.div initial={false} animate={{ paddingLeft: collapsed ? desktopCollapsedWidth : desktopExpandedWidth }} className="hidden lg:block" />

                    {/* Top Navbar */}
                    <header className="h-14 md:h-16 sticky top-0 z-20 bg-white/75 backdrop-blur-xl border-b border-white/40">
                        <div className="h-full px-3 md:px-4 lg:px-6 flex items-center justify-between gap-3">
                            <div className="md:hidden text-[17px] font-bold tracking-tight text-slate-800">Dashboard</div>
                            <div className={cn('hidden md:block flex-1 max-w-md', isKdsRoute && 'md:hidden')}>
                                {!isKdsRoute ? <GlobalSearch /> : null}
                            </div>
                            <div className="flex items-center gap-2 lg:gap-3">
                                {isGrandHotel && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const next = !isDemoMode;
                                            setIsDemoMode(next);
                                            toast.success(next ? 'Demo mode enabled for The Grand' : 'Demo mode disabled');
                                        }}
                                        className={cn(
                                            'hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors',
                                            isDemoMode
                                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                        )}
                                        title="Toggle demo simulation mode"
                                    >
                                        <span
                                            className={cn(
                                                'w-7 h-4 rounded-full relative transition-colors',
                                                isDemoMode ? 'bg-emerald-500' : 'bg-slate-300'
                                            )}
                                        >
                                            <span
                                                className={cn(
                                                    'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all',
                                                    isDemoMode ? 'left-3.5' : 'left-0.5'
                                                )}
                                            />
                                        </span>
                                        Demo Mode
                                    </button>
                                )}
                                <NotificationBell />
                                <div className="relative">
                                    <motion.button
                                        whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                        onClick={() => setShowUserMenu(p => !p)}
                                        className="hidden md:flex w-10 h-10 rounded-xl bg-gradient-to-br from-[#ff4757] to-[#ff6b81] items-center justify-center text-white font-bold text-sm shadow-lg shadow-rose-500/35"
                                        title={displayTenantName || 'Restaurant'}
                                        aria-label={`Tenant avatar ${displayTenantName || ''}`.trim()}
                                    >
                                        {tenantInitial}
                                    </motion.button>
                                    <AnimatePresence>
                                        {showUserMenu && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.95, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -8 }}
                                                className="absolute right-0 top-12 w-56 bg-white rounded-2xl shadow-xl border border-slate-200/60 z-50 overflow-hidden"
                                            >
                                                <div className="px-4 py-3 border-b border-slate-100">
                                                    <p className="text-xs font-semibold text-slate-900 truncate">{user?.displayName ?? 'Admin'}</p>
                                                    <p className="text-xs text-slate-500 truncate mt-0.5">{user?.email}</p>
                                                    {tenantName && <p className="text-[10px] text-blue-600 font-medium mt-0.5 truncate">🏨 {tenantName}</p>}
                                                </div>
                                                <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-rose-600 hover:bg-rose-50 transition-colors">
                                                    <LogOut className="w-4 h-4" />
                                                    Sign Out
                                                </button>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>
                        </div>
                    </header>

                    {showEndingSoonReminder && (
                        <div className="px-4 lg:px-6 pt-4">
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="text-sm font-semibold text-amber-900">
                                        {subscriptionDaysRemaining === 0
                                            ? 'Your subscription ends today.'
                                            : `Your subscription ends in ${subscriptionDaysRemaining} day${subscriptionDaysRemaining === 1 ? '' : 's'}.`}
                                    </p>
                                    <p className="text-xs text-amber-700 mt-0.5">
                                        End date: {subscriptionEndDate}. Please renew before expiry to keep your plan active.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Page Content */}
                    <div className="p-4 sm:p-5 lg:p-8 pb-[calc(6.25rem+env(safe-area-inset-bottom))] lg:pb-8" key={pathname}>
                        {isGrandHotel && isDemoMode && (
                            <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                                Demo Mode is ON for The Grand. Dashboard data and actions are simulated.
                            </div>
                        )}
                        {isProRouteBlocked ? (
                            <div className="max-w-2xl mx-auto rounded-3xl border border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50 p-8 text-center">
                                <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center mb-4">
                                    <Lock className="w-7 h-7 text-white" />
                                </div>
                                <h2 className="text-2xl font-bold text-slate-900">Pro Feature Locked</h2>
                                <p className="text-slate-600 mt-2">
                                    {activeNavItem?.name || 'This feature'} is available on Pro plan only.
                                </p>
                                <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                                    <button
                                        onClick={() => {
                                            setUpgradeFeature(activeNavItem?.name || 'Pro Feature');
                                            setShowUpgradeModal(true);
                                        }}
                                        className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-colors"
                                    >
                                        Upgrade Plan
                                    </button>
                                    <button
                                        onClick={() => router.push(`/${urlStoreId}/dashboard/orders`)}
                                        className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-white transition-colors"
                                    >
                                        Back to Orders
                                    </button>
                                </div>
                            </div>
                        ) : (
                            children
                        )}

                        {/* Database Connection Status Footer */}
                        <div className="mt-8 pt-4 border-t border-slate-200/60">
                            <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span>Database Connected: <span className="font-medium text-slate-700">{tenantName || 'Loading...'}</span></span>
                                {urlStoreId && <span className="text-slate-400">({urlStoreId})</span>}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Mobile Bottom Navigation - Shows top allowed features */}
                <nav className="md:hidden fixed bottom-0 left-0 right-0 h-[72px] pb-[env(safe-area-inset-bottom)] bg-white/85 backdrop-blur-xl border-t border-slate-200/70 shadow-[0_-6px_18px_rgba(15,23,42,0.08)] z-30">
                    <div className="h-full px-2 flex items-center justify-around gap-1">
                        {mobilePrimaryNavigation.map((item) => {
                            const isActive = pathname === item.href;
                            return (
                                <button
                                    key={item.name}
                                    onClick={() => handleNavClick(item)}
                                    className="flex-1"
                                >
                                    <motion.div
                                        whileTap={{ scale: 0.95 }}
                                        className={cn(
                                            "mx-auto w-full max-w-[104px] rounded-xl flex flex-col items-center justify-center gap-1 py-2 transition-all",
                                            isActive ? "text-blue-600 bg-blue-50/90" : "text-slate-600"
                                        )}
                                    >
                                        <item.icon className={cn("w-5 h-5", isActive && "drop-shadow-[0_0_6px_rgba(37,99,235,0.3)]")} />
                                        <span className={cn("text-[11px] font-medium", isActive && "font-semibold")}>{item.shortName}</span>
                                    </motion.div>
                                </button>
                            );
                        })}

                        <button
                            onClick={() => setMobileMenuOpen(true)}
                            className="flex-1"
                            aria-label="Open more options"
                        >
                            <motion.div
                                whileTap={{ scale: 0.95 }}
                                className={cn(
                                    "mx-auto w-full max-w-[104px] rounded-xl flex flex-col items-center justify-center gap-1 py-2 transition-all",
                                    mobileMenuOpen ? "text-blue-600 bg-blue-50/90" : "text-slate-600"
                                )}
                            >
                                <Menu className={cn("w-5 h-5", mobileMenuOpen && "drop-shadow-[0_0_6px_rgba(37,99,235,0.3)]")} />
                                <span className={cn("text-[11px] font-medium", mobileMenuOpen && "font-semibold")}>More</span>
                            </motion.div>
                        </button>
                    </div>
                </nav>

                {/* Upgrade Modal */}
                <UpgradeModal
                    isOpen={showUpgradeModal}
                    onClose={() => setShowUpgradeModal(false)}
                    featureName={upgradeFeature}
                />

                <GeminiSupportChat />
            </div>
        </SubscriptionGuard>
    );
}
