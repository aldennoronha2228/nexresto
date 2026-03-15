'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
    ShoppingBag, History, UtensilsCrossed, QrCode,
    ChevronLeft, Bell, Search, Menu, X, LogOut, UserCircle,
    BarChart3, Package, Palette, Sparkles, Lock,
    AlertTriangle, Shield, LogIn, ArrowLeft
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useSuperAdminAuth } from '@/context/SuperAdminAuthContext';
import { useRestaurant } from '@/hooks/useRestaurant';
import { GlobalSearch } from '@/components/dashboard/GlobalSearch';
import { NotificationBell } from '@/components/dashboard/NotificationBell';
import { UpgradeModal } from '@/components/dashboard/UpgradeModal';
import { SubscriptionGuard } from '@/components/dashboard/SubscriptionGuard';
import GeminiSupportChat from '@/components/dashboard/GeminiSupportChat';
import { hasPermission, type PermissionType } from '@/components/dashboard/RoleGuard';
import { tenantAuth, adminAuth } from '@/lib/firebase';
import { toast } from 'sonner';


// Base navigation structure — paths are relative to /[storeId]
const baseNavigation = [
    { name: 'Live Orders', basePath: '/dashboard/orders', icon: ShoppingBag, shortName: 'Orders', proOnly: false, permission: 'can_view_orders' as PermissionType },
    { name: 'Order History', basePath: '/dashboard/history', icon: History, shortName: 'History', proOnly: false, permission: 'can_view_history' as PermissionType },
    { name: 'Menu Management', basePath: '/dashboard/menu', icon: UtensilsCrossed, shortName: 'Menu', proOnly: false, permission: 'can_view_menu' as PermissionType },
    { name: 'Tables & QR', basePath: '/dashboard/tables', icon: QrCode, shortName: 'Tables', proOnly: false, permission: 'can_view_tables' as PermissionType },
    { name: 'Analytics', basePath: '/dashboard/analytics', icon: BarChart3, shortName: 'Analytics', proOnly: true, permission: 'can_view_analytics' as PermissionType },
    { name: 'Inventory', basePath: '/dashboard/inventory', icon: Package, shortName: 'Inventory', proOnly: true, permission: 'can_view_inventory' as PermissionType },
    { name: 'Branding', basePath: '/dashboard/branding', icon: Palette, shortName: 'Brand', proOnly: true, permission: 'can_view_branding' as PermissionType },
    { name: 'Account Settings', basePath: '/dashboard/account', icon: UserCircle, shortName: 'Account', proOnly: false, permission: 'can_view_account' as PermissionType },
];

// Helper: build full nav href always scoped to the URL slug (not the session restId)
// This guarantees each tab stays in its own /[storeId]/ namespace.
function buildNavHref(urlSlug: string, basePath: string): string {
    return `/${urlSlug}${basePath}`;
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
    } = useAuth();
    const { storeId: activeStoreId, isSuperAdmin, subscriptionTier, tenantName } = useRestaurant();
    const urlStoreId = params?.storeId || '';
    const [showConflict, setShowConflict] = useState(false);
    const [displayTenantName, setDisplayTenantName] = useState<string>('NexResto');

    // Get Super Admin state (God Mode check)
    const {
        session: superAdminSession,
        userRole: superAdminRole,
        loading: superAdminLoading
    } = useSuperAdminAuth();

    const isGodMode = !session && superAdminSession && superAdminRole === 'super_admin';

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
            }
        }
    }, [loading, superAdminLoading, session, isGodMode, mustChangePassword, userRole, router]);

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
            activeStoreId &&
            urlStoreId !== activeStoreId
        ) {
            setShowConflict(true);
        } else {
            setShowConflict(false);
        }
    }, [activeStoreId, urlStoreId, loading, userRole, isGodMode]);

    // Check if user has Pro tier
    const isPro = subscriptionTier === 'pro' || subscriptionTier === '2k' || subscriptionTier === '2.5k';
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

    const mobilePrimaryNavigation = filteredNavigation.filter((item) =>
        item.basePath === '/dashboard/orders' ||
        item.basePath === '/dashboard/menu' ||
        item.basePath === '/dashboard/analytics'
    );

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
        router.refresh();
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
                                        <p className="text-blue-300 font-mono text-xs truncate">{activeStoreId ?? '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-500 text-xs">Attempted URL</p>
                                        <p className="text-amber-300 font-mono text-xs truncate">/{urlStoreId}/...</p>
                                    </div>
                                </div>
                            </div>
                            {/* Actions */}
                            <div className="space-y-3">
                                {activeStoreId && (
                                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                        onClick={() => router.replace(`/${activeStoreId}/dashboard/orders`)}
                                        className="w-full h-12 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-blue-500/25 transition-all"
                                    >
                                        <Shield className="w-4 h-4" />
                                        Go to My Restaurant ({tenantName ?? activeStoreId})
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

    const userInitial = activeUser?.displayName?.[0]
        ?? activeUser?.email?.[0]?.toUpperCase()
        ?? 'A';

    return (
        <SubscriptionGuard>
                <div className="min-h-screen">
                {/* Desktop Sidebar */}
                <motion.aside
                    initial={false}
                    animate={{ width: collapsed ? 80 : 240 }}
                    className="hidden lg:block fixed left-0 top-0 h-full premium-sidebar border-r border-white/10 z-30"
                >
                    <div className="flex flex-col h-full">
                        {/* Logo */}
                            <div className="h-16 flex items-center px-6 border-b border-white/10">
                            <motion.div initial={false} animate={{ opacity: collapsed ? 0 : 1 }} className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#ff4757] to-[#ff6b81] flex items-center justify-center shadow-lg shadow-rose-500/40">
                                    <span className="text-white font-bold text-sm">{(displayTenantName?.[0] ?? 'R').toUpperCase()}</span>
                                </div>
                                    {!collapsed && <span className="font-semibold text-slate-100 truncate max-w-[140px]" title={displayTenantName}>{displayTenantName}</span>}
                            </motion.div>
                        </div>

                        {/* Navigation */}
                        <nav className="flex-1 px-3 py-4 space-y-1">
                            {filteredNavigation.map((item) => {
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
                                                    isActive ? "premium-sidebar-active text-white" : "hover:bg-white/5 hover:text-white",
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
                <aside className="hidden md:flex lg:hidden fixed left-0 top-0 h-full w-20 premium-sidebar border-r border-white/10 z-30">
                    <div className="flex flex-col h-full w-full">
                        <div className="h-16 flex items-center justify-center border-b border-white/10">
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#ff4757] to-[#ff6b81] flex items-center justify-center shadow-lg shadow-rose-500/40">
                                <span className="text-white font-bold text-sm">{(displayTenantName?.[0] ?? 'R').toUpperCase()}</span>
                            </div>
                        </div>

                        <nav className="flex-1 px-2 py-4 space-y-2">
                            {filteredNavigation.map((item) => {
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
                                                isActive ? 'premium-sidebar-active text-white' : 'hover:bg-white/5 hover:text-white',
                                                isLocked && 'opacity-60'
                                            )}
                                        >
                                            <item.icon className="w-5 h-5" />
                                        </div>
                                    </button>
                                );
                            })}
                        </nav>
                    </div>
                </aside>

                {/* Mobile Menu Overlay */}
                <AnimatePresence>
                    {mobileMenuOpen && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
                            onClick={() => setMobileMenuOpen(false)}
                        >
                            <motion.div
                                initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
                                onClick={(e) => e.stopPropagation()}
                                className="absolute left-0 top-0 h-full w-72 premium-sidebar shadow-2xl"
                            >
                                <div className="flex flex-col h-full">
                                        <div className="h-16 flex items-center justify-between px-6 border-b border-white/10 premium-sidebar">
                                        <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#ff4757] to-[#ff6b81] flex items-center justify-center shadow-lg shadow-rose-500/40">
                                                <span className="text-white font-bold text-sm">{(displayTenantName?.[0] ?? 'R').toUpperCase()}</span>
                                            </div>
                                                <span className="font-semibold text-slate-100 truncate max-w-[170px]" title={displayTenantName}>{displayTenantName}</span>
                                        </div>
                                            <button onClick={() => setMobileMenuOpen(false)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                                                <X className="w-5 h-5 text-slate-100" />
                                        </button>
                                    </div>
                                        <nav className="flex-1 px-3 py-4 space-y-1 premium-sidebar">
                                        {filteredNavigation.map((item) => {
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
                                                            isActive ? "premium-sidebar-active text-white" : "hover:bg-white/5 hover:text-white",
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

                                    </nav>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Main Content */}
                <div className="md:pl-20 lg:pl-60">
                    <motion.div initial={false} animate={{ paddingLeft: collapsed ? 80 : 240 }} className="hidden lg:block" />

                    {/* Top Navbar */}
                    <header className="h-16 sticky top-0 z-20 bg-white/45 backdrop-blur-xl border-b border-white/30">
                        <div className="h-full px-4 lg:px-6 flex items-center justify-between gap-4">
                            <div className="md:hidden text-sm font-semibold text-slate-800">Dashboard</div>
                            <div className="hidden md:block flex-1 max-w-md">
                                <GlobalSearch />
                            </div>
                            <div className="flex items-center gap-2 lg:gap-3">
                                <NotificationBell />
                                <button onClick={() => setMobileMenuOpen(true)} className="md:hidden p-2 hover:bg-slate-100 rounded-lg transition-colors" title="Open settings">
                                    <Menu className="w-5 h-5 text-slate-600" />
                                </button>
                                <div className="relative">
                                    <motion.button
                                        whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                        onClick={() => setShowUserMenu(p => !p)}
                                        className="hidden md:flex w-10 h-10 rounded-xl bg-gradient-to-br from-[#ff4757] to-[#ff6b81] items-center justify-center text-white font-bold text-sm shadow-lg shadow-rose-500/35"
                                    >
                                        {user?.photoURL ? (
                                            <img src={user.photoURL} alt="avatar" className="w-full h-full rounded-xl object-cover" />
                                        ) : userInitial}
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
                                        End date: {subscriptionEndDate}. Please renew before expiry to avoid dashboard interruption.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Page Content */}
                    <div className="p-6 lg:p-8 pb-24 lg:pb-8" key={pathname}>
                        {children}

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
                <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/70 backdrop-blur-xl border-t border-slate-200/60 z-30">
                    <div className="h-full px-2 flex items-center justify-around">
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
                                        className={cn("flex flex-col items-center justify-center gap-1 py-2 transition-all", isActive ? "text-blue-600" : "text-slate-600")}
                                    >
                                        <item.icon className="w-5 h-5" />
                                        <span className="text-[10px] font-medium">{item.shortName}</span>
                                    </motion.div>
                                </button>
                            );
                        })}
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
