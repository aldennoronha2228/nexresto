'use client';

/**
 * Session Conflict Page
 * ─────────────────────
 * Route: /session-conflict/[slug]
 *
 * Uses useParams() (NOT useSearchParams) so no <Suspense> boundary is
 * needed and static prerendering at build time never fails.
 *
 * Shown when a non-super-admin user navigates to /[restaurant-slug]/dashboard
 * while their active session belongs to a different restaurant.
 */

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion } from 'motion/react';
import { AlertTriangle, LogIn, ArrowLeft, Shield } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function SessionConflictPage() {
    const router = useRouter();
    // slug = the restaurant the user TRIED to access (from the URL path)
    const { slug } = useParams<{ slug: string }>();
    const { tenantId, tenantName, signOut, loading } = useAuth();

    const attemptedSlug = slug || 'unknown';

    useEffect(() => {
        document.title = 'Session Conflict – HotelPro';
    }, []);

    const handleGoToMyRestaurant = () => {
        router.replace(tenantId ? `/${tenantId}/dashboard/orders` : '/login');
    };

    const handleSignInAsAnother = async () => {
        await signOut();
        router.replace('/login');
    };

    const handleGoBack = () => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
            router.back();
        } else {
            router.replace('/login');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-950">
                <div className="w-8 h-8 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 relative overflow-hidden">
            {/* Background orbs */}
            <div className="absolute inset-0">
                <div className="absolute inset-0 bg-slate-950" />
                {[
                    { cx: '20%', cy: '30%', r: 350, color: '#7c3aed' },
                    { cx: '80%', cy: '70%', r: 300, color: '#be123c' },
                ].map((orb, i) => (
                    <motion.div
                        key={i}
                        animate={{ scale: [1, 1.15, 1], opacity: [0.1, 0.2, 0.1] }}
                        transition={{ duration: 10, delay: i * 3, repeat: Infinity, ease: 'easeInOut' }}
                        style={{
                            position: 'absolute',
                            left: orb.cx, top: orb.cy,
                            width: orb.r * 2, height: orb.r * 2,
                            transform: 'translate(-50%, -50%)',
                            borderRadius: '50%',
                            background: `radial-gradient(circle, ${orb.color}44 0%, transparent 70%)`,
                            filter: 'blur(60px)',
                        }}
                    />
                ))}
            </div>

            <div className="relative z-10 w-full max-w-lg px-4">
                <motion.div
                    initial={{ opacity: 0, y: 32, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className="bg-slate-900/90 backdrop-blur-2xl border border-slate-700/50 rounded-3xl shadow-2xl overflow-hidden"
                >
                    <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500" />

                    <div className="p-8">
                        {/* Icon */}
                        <div className="flex justify-center mb-6">
                            <motion.div
                                animate={{ rotate: [0, -3, 3, -3, 0] }}
                                transition={{ duration: 0.6, delay: 0.4 }}
                                className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500/20 to-rose-500/20 border border-amber-500/30 flex items-center justify-center"
                            >
                                <AlertTriangle className="w-10 h-10 text-amber-400" />
                            </motion.div>
                        </div>

                        {/* Title */}
                        <div className="text-center mb-8">
                            <h1 className="text-2xl font-bold text-white mb-2">Session Conflict</h1>
                            <p className="text-slate-400 text-sm leading-relaxed">
                                You tried to access{' '}
                                <code className="px-1.5 py-0.5 bg-slate-800 text-amber-300 rounded text-xs font-mono">
                                    /{attemptedSlug}/dashboard
                                </code>
                                , but your active session belongs to a different restaurant.
                            </p>
                        </div>

                        {/* Session info */}
                        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 mb-6">
                            <div className="flex items-center gap-3 mb-3">
                                <Shield className="w-4 h-4 text-blue-400 flex-shrink-0" />
                                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Session</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <p className="text-slate-500 text-xs">Restaurant</p>
                                    <p className="text-white font-medium truncate">{tenantName ?? '—'}</p>
                                </div>
                                <div>
                                    <p className="text-slate-500 text-xs">Restaurant ID</p>
                                    <p className="text-blue-300 font-mono text-xs truncate">{tenantId ?? '—'}</p>
                                </div>
                                <div>
                                    <p className="text-slate-500 text-xs">Attempted URL</p>
                                    <p className="text-amber-300 font-mono text-xs truncate">/{attemptedSlug}/...</p>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="space-y-3">
                            {tenantId && (
                                <motion.button
                                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                    onClick={handleGoToMyRestaurant}
                                    className="w-full h-12 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all"
                                >
                                    <Shield className="w-4 h-4" />
                                    Go to My Restaurant ({tenantName ?? tenantId})
                                </motion.button>
                            )}
                            <motion.button
                                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                onClick={handleSignInAsAnother}
                                className="w-full h-12 flex items-center justify-center gap-2 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 text-white rounded-xl font-medium text-sm transition-all"
                            >
                                <LogIn className="w-4 h-4" />
                                Sign in as a Different Account
                            </motion.button>
                            <motion.button
                                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                onClick={handleGoBack}
                                className="w-full h-10 flex items-center justify-center gap-2 text-slate-500 hover:text-slate-300 text-sm transition-colors"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Go Back
                            </motion.button>
                        </div>

                        <p className="text-center text-xs text-slate-600 mt-6 leading-relaxed">
                            Each browser tab maintains an isolated session.
                            This prevents accidental cross-restaurant data access.
                        </p>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
