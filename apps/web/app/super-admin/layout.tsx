'use client';

/**
 * Super Admin Layout
 * Protected route that only allows users with role: 'super_admin'
 *
 * Uses SuperAdminAuthContext which watches the admin Firebase app.
 * That client creates an isolated session from the tenant dashboard's
 * Firebase app.
 *
 * Session seeding: the login page signs in with the admin Firebase instance
 * after confirming role === 'super_admin', so this context always has a
 * real session to read.
 *
 * Sign-out: only clears the admin Firebase session. Tenant sessions in
 * other tabs are unaffected.
 */

import { useSuperAdminAuth } from '@/context/SuperAdminAuthContext';
import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Geist, Geist_Mono } from 'next/font/google';
import {
    LayoutDashboard, Building2, ScrollText,
    ChevronLeft, LogOut, Menu, X, HardDrive, Mail, Inbox, Layers, WalletCards
} from 'lucide-react';
import { cn } from '@/lib/utils';
import NexRestoLogo from '@/components/ui/NexRestoLogo';

const geist = Geist({ subsets: ['latin'] });
const geistMono = Geist_Mono({ subsets: ['latin'] });


const navigation = [
    { name: 'Overview', href: '/super-admin', icon: LayoutDashboard },
    { name: 'Restaurants', href: '/super-admin/restaurants', icon: Building2 },
    { name: 'Payments', href: '/super-admin/payments', icon: WalletCards },
    { name: 'Subscription Tiers', href: '/super-admin/subscription-tiers', icon: Layers },
    { name: 'Emails', href: '/super-admin/emails', icon: Mail },
    { name: 'Demo Requests', href: '/super-admin/demo-requests', icon: Inbox },
    { name: 'Usage & Billing', href: '/super-admin/resource-monitor', icon: HardDrive },
    { name: 'Activity Logs', href: '/super-admin/logs', icon: ScrollText },
];

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
    const [collapsed, setCollapsed] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const pathname = usePathname();
    const router = useRouter();

    // Use the ADMIN-specific auth context.
    // This watches the admin Firebase app.
    // Completely isolated from the tenant dashboard's Firebase app.
    const { session, loading, roleLoading, signOut, userRole } = useSuperAdminAuth();

    const isSuperAdmin = userRole === 'super_admin';

    // Wait for BOTH session AND role to resolve before making redirect decisions.
    const isFullyLoaded = !loading && !roleLoading;

    // Redirect if not authenticated (after loading completes)
    useEffect(() => {
        if (isFullyLoaded && !session) {
            router.replace('/login');
        }
    }, [isFullyLoaded, session, router]);

    // Redirect if authenticated but not a super admin
    useEffect(() => {
        if (isFullyLoaded && session && userRole !== 'super_admin') {
            router.replace('/unauthorized');
        }
    }, [isFullyLoaded, session, userRole, router]);

    useEffect(() => {
        document.title = 'Super-Admin — NexResto';
    }, []);

    // Sign out from admin ONLY — does NOT touch the tenant session in other tabs
    const handleSignOut = async () => {
        await signOut();
        router.push('/login');
    };


    // Show spinner while auth is being resolved
    if (!isFullyLoaded) {
        return (
            <div className={cn("min-h-screen flex items-center justify-center bg-[#050505]", geist.className)}>
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-violet-500/20 border-t-violet-400 rounded-full animate-spin"></div>
                    <p className="text-slate-400 text-sm font-medium">Verifying super admin access...</p>
                </div>
            </div>
        );
    }

    // No session — redirecting to login
    if (!session) return null;

    // Has session but wrong role — redirecting to /unauthorized
    if (!isSuperAdmin) return null;

    return (
        <div className={cn("min-h-screen bg-[#050505] scrollbar-hide relative overflow-hidden", geist.className)}>
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute -top-44 -left-44 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.20)_0%,rgba(5,5,5,0)_70%)] blur-3xl" />
                <div className="absolute top-1/2 -right-56 h-[38rem] w-[38rem] rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.13)_0%,rgba(5,5,5,0)_72%)] blur-3xl" />
            </div>
            {/* Desktop Sidebar */}
            <motion.aside
                initial={false}
                animate={{ width: collapsed ? 82 : 212 }}
                className="hidden lg:block fixed left-5 top-5 h-[calc(100vh-2.5rem)] z-30"
            >
                <div className="flex flex-col h-full rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_20px_90px_rgba(0,0,0,0.55)]">
                    {/* Logo */}
                    <div className="h-20 flex items-center px-4 border-b border-white/10">
                        <motion.div initial={false} animate={{ opacity: 1 }} className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-white/10 ring-1 ring-white/20 flex items-center justify-center shadow-lg shadow-violet-500/20">
                                <NexRestoLogo className="w-7 h-7" priority />
                            </div>
                            {!collapsed && (
                                <div>
                                    <span className={cn("font-semibold tracking-tight text-white text-[17px]", geistMono.className)}>Super Admin</span>
                                    <p className="text-[11px] text-slate-400 tracking-[0.14em] uppercase">Command Center</p>
                                </div>
                            )}
                        </motion.div>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 px-2.5 py-5 space-y-1.5">
                        {navigation.map((item) => {
                            const isActive = pathname === item.href ||
                                (item.href !== '/super-admin' && pathname.startsWith(item.href));
                            return (
                                <button
                                    key={item.name}
                                    onClick={() => router.push(item.href)}
                                    className="w-full text-left"
                                >
                                    <motion.div
                                        whileHover={{ x: 4 }}
                                        className={cn(
                                            "flex items-center gap-3 px-3 py-3 rounded-2xl transition-all duration-200",
                                            isActive
                                                ? "bg-white/12 text-violet-200 shadow-[0_0_0_1px_rgba(255,255,255,0.11)]"
                                                : "text-slate-400 hover:bg-white/8 hover:text-white"
                                        )}
                                    >
                                        <item.icon className="w-5 h-5 flex-shrink-0" strokeWidth={1.5} />
                                        {!collapsed && <span className="text-sm font-medium">{item.name}</span>}
                                    </motion.div>
                                </button>
                            );
                        })}
                    </nav>

                    {/* Sign Out */}
                    <div className="p-3 border-t border-white/10">
                        <button
                            onClick={handleSignOut}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                        >
                            <LogOut className="w-5 h-5" strokeWidth={1.5} />
                            {!collapsed && <span className="text-sm font-medium">Sign Out</span>}
                        </button>
                    </div>

                    {/* Collapse Button */}
                    <div className="p-3 border-t border-white/10">
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setCollapsed(!collapsed)}
                            className="w-full h-10 flex items-center justify-center rounded-2xl bg-white/6 hover:bg-white/10 transition-colors"
                        >
                            <motion.div animate={{ rotate: collapsed ? 180 : 0 }} transition={{ duration: 0.3 }}>
                                <ChevronLeft className="w-5 h-5 text-slate-400" strokeWidth={1.5} />
                            </motion.div>
                        </motion.button>
                    </div>
                </div>
            </motion.aside>

            {/* Mobile Header */}
            <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-black/45 backdrop-blur-xl border-b border-white/10 z-40 flex items-center justify-between px-4">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setMobileMenuOpen(true)}
                        className="p-2 rounded-lg bg-white/10 text-slate-300"
                    >
                        <Menu className="w-5 h-5" strokeWidth={1.5} />
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-white/10 ring-1 ring-white/20 flex items-center justify-center shadow-lg shadow-violet-500/20">
                            <NexRestoLogo className="w-5 h-5" priority />
                        </div>
                        <span className={cn("font-semibold text-white tracking-tight", geistMono.className)}>Super Admin</span>
                    </div>
                </div>
            </div>

            {/* Mobile Menu Overlay */}
            <AnimatePresence>
                {mobileMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                        onClick={() => setMobileMenuOpen(false)}
                    >
                        <motion.div
                            initial={{ x: -300 }}
                            animate={{ x: 0 }}
                            exit={{ x: -300 }}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute left-0 top-0 h-full w-72 bg-[#0b0b0c]/95 backdrop-blur-2xl shadow-2xl border-r border-white/10"
                        >
                            <div className="flex flex-col h-full">
                                <div className="h-16 flex items-center justify-between px-4 border-b border-white/10">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-white/10 ring-1 ring-white/20 flex items-center justify-center shadow-lg shadow-violet-500/20">
                                            <NexRestoLogo className="w-5 h-5" priority />
                                        </div>
                                        <span className={cn("font-semibold text-white tracking-tight", geistMono.className)}>Super Admin</span>
                                    </div>
                                    <button
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="p-2 rounded-lg bg-white/10 text-slate-300"
                                    >
                                        <X className="w-5 h-5" strokeWidth={1.5} />
                                    </button>
                                </div>
                                <nav className="flex-1 px-3 py-4 space-y-1">
                                    {navigation.map((item) => {
                                        const isActive = pathname === item.href;
                                        return (
                                            <button
                                                key={item.name}
                                                onClick={() => {
                                                    router.push(item.href);
                                                    setMobileMenuOpen(false);
                                                }}
                                                className={cn(
                                                    "w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-colors",
                                                    isActive
                                                        ? "bg-white/12 text-violet-200"
                                                        : "text-slate-400 hover:bg-white/8"
                                                )}
                                            >
                                                <item.icon className="w-5 h-5" strokeWidth={1.5} />
                                                <span className="text-sm font-medium">{item.name}</span>
                                            </button>
                                        );
                                    })}
                                </nav>

                                <div className="px-3 pb-4 border-t border-white/10">
                                    <button
                                        onClick={() => {
                                            setMobileMenuOpen(false);
                                            handleSignOut();
                                        }}
                                        className="w-full mt-3 flex items-center gap-3 px-3 py-3 rounded-xl text-slate-300 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                                    >
                                        <LogOut className="w-5 h-5" strokeWidth={1.5} />
                                        <span className="text-sm font-medium">Sign Out</span>
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Content */}
            <main className={cn(
                "min-h-screen transition-all duration-300 pt-16 lg:pt-0 overflow-y-auto scrollbar-hide",
                collapsed ? "lg:pl-[7.25rem]" : "lg:pl-[15.75rem]"
            )}>
                <div className="p-4 lg:p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
