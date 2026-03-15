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
import {
    LayoutDashboard, Building2, ScrollText,
    ChevronLeft, LogOut, Shield, Menu, X
} from 'lucide-react';
import { cn } from '@/lib/utils';


const navigation = [
    { name: 'Overview', href: '/super-admin', icon: LayoutDashboard },
    { name: 'Restaurants', href: '/super-admin/restaurants', icon: Building2 },
    { name: 'Activity Logs', href: '/super-admin/logs', icon: ScrollText },
];

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
    const [collapsed, setCollapsed] = useState(false);
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
            <div className="min-h-screen flex items-center justify-center bg-slate-900">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
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
        <div className="min-h-screen bg-slate-900 scrollbar-hide">
            {/* Desktop Sidebar */}
            <motion.aside
                initial={false}
                animate={{ width: collapsed ? 80 : 260 }}
                className="hidden lg:block fixed left-0 top-0 h-full bg-slate-800 border-r border-slate-700 z-30"
            >
                <div className="flex flex-col h-full">
                    {/* Logo */}
                    <div className="h-16 flex items-center px-6 border-b border-slate-700">
                        <motion.div initial={false} animate={{ opacity: collapsed ? 0 : 1 }} className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                                <Shield className="w-5 h-5 text-white" />
                            </div>
                            {!collapsed && (
                                <div>
                                    <span className="font-bold text-white text-lg">God Mode</span>
                                    <p className="text-xs text-slate-400">Super Admin</p>
                                </div>
                            )}
                        </motion.div>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 px-3 py-4 space-y-1">
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
                                            "flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200",
                                            isActive
                                                ? "bg-gradient-to-r from-purple-600/20 to-pink-600/20 text-purple-400 border border-purple-500/30"
                                                : "text-slate-400 hover:bg-slate-700/50 hover:text-white"
                                        )}
                                    >
                                        <item.icon className="w-5 h-5 flex-shrink-0" />
                                        {!collapsed && <span className="text-sm font-medium">{item.name}</span>}
                                    </motion.div>
                                </button>
                            );
                        })}
                    </nav>

                    {/* Sign Out */}
                    <div className="p-3 border-t border-slate-700">
                        <button
                            onClick={handleSignOut}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                            <LogOut className="w-5 h-5" />
                            {!collapsed && <span className="text-sm font-medium">Sign Out</span>}
                        </button>
                    </div>

                    {/* Collapse Button */}
                    <div className="p-3 border-t border-slate-700">
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setCollapsed(!collapsed)}
                            className="w-full h-10 flex items-center justify-center rounded-xl bg-slate-700/50 hover:bg-slate-700 transition-colors"
                        >
                            <motion.div animate={{ rotate: collapsed ? 180 : 0 }} transition={{ duration: 0.3 }}>
                                <ChevronLeft className="w-5 h-5 text-slate-400" />
                            </motion.div>
                        </motion.button>
                    </div>
                </div>
            </motion.aside>

            {/* Mobile Header */}
            <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-slate-800 border-b border-slate-700 z-40 flex items-center justify-between px-4">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setMobileMenuOpen(true)}
                        className="p-2 rounded-lg bg-slate-700/50 text-slate-300"
                    >
                        <Menu className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
                            <Shield className="w-4 h-4 text-white" />
                        </div>
                        <span className="font-bold text-white">God Mode</span>
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
                            className="absolute left-0 top-0 h-full w-72 bg-slate-800 shadow-2xl"
                        >
                            <div className="flex flex-col h-full">
                                <div className="h-16 flex items-center justify-between px-4 border-b border-slate-700">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
                                            <Shield className="w-4 h-4 text-white" />
                                        </div>
                                        <span className="font-bold text-white">God Mode</span>
                                    </div>
                                    <button
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="p-2 rounded-lg bg-slate-700/50 text-slate-300"
                                    >
                                        <X className="w-5 h-5" />
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
                                                        ? "bg-purple-600/20 text-purple-400"
                                                        : "text-slate-400 hover:bg-slate-700/50"
                                                )}
                                            >
                                                <item.icon className="w-5 h-5" />
                                                <span className="text-sm font-medium">{item.name}</span>
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
            <main className={cn(
                "min-h-screen transition-all duration-300 pt-16 lg:pt-0 overflow-y-auto scrollbar-hide",
                collapsed ? "lg:pl-20" : "lg:pl-[260px]"
            )}>
                <div className="p-4 lg:p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
