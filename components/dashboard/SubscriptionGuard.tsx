'use client';

/**
 * Subscription Guard Component
 * Blocks access when restaurant subscription is suspended/cancelled
 */

import { motion } from 'motion/react';
import { AlertTriangle, CreditCard, Mail, Phone } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSuperAdminAuth } from '@/context/SuperAdminAuthContext';

interface SubscriptionGuardProps {
    children: React.ReactNode;
}

export function SubscriptionGuard({ children }: SubscriptionGuardProps) {
    const { subscriptionStatus, tenantName, loading } = useAuth();
    const { userRole: superAdminRole } = useSuperAdminAuth();
    const isSuperAdmin = superAdminRole === 'super_admin';

    // Don't block while loading
    if (loading) {
        return <>{children}</>;
    }

    // Allow access if status is active/trial OR if user is a Super Admin (God Mode bypass)
    if (isSuperAdmin || subscriptionStatus === 'active' || subscriptionStatus === 'trial' || !subscriptionStatus) {
        return <>{children}</>;
    }

    // Block access for cancelled or past_due
    const isCancelled = subscriptionStatus === 'cancelled';
    const isPastDue = subscriptionStatus === 'past_due';

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-md"
            >
                {/* Alert Card */}
                <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 overflow-hidden">
                    {/* Header */}
                    <div className={`px-6 py-8 text-center ${isCancelled ? 'bg-red-500/10' : 'bg-yellow-500/10'}`}>
                        <div className={`w-16 h-16 mx-auto rounded-2xl ${isCancelled ? 'bg-red-500/20' : 'bg-yellow-500/20'} flex items-center justify-center mb-4`}>
                            <AlertTriangle className={`w-8 h-8 ${isCancelled ? 'text-red-500' : 'text-yellow-500'}`} />
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2">
                            {isCancelled ? 'Subscription Cancelled' : 'Payment Required'}
                        </h1>
                        <p className="text-slate-400">
                            {isCancelled
                                ? 'Your restaurant subscription has been cancelled.'
                                : 'Your subscription payment is overdue.'
                            }
                        </p>
                    </div>

                    {/* Content */}
                    <div className="p-6 space-y-4">
                        {tenantName && (
                            <div className="text-center pb-4 border-b border-slate-700">
                                <p className="text-slate-400 text-sm">Restaurant</p>
                                <p className="text-white font-semibold">{tenantName}</p>
                            </div>
                        )}

                        <div className="space-y-3">
                            <p className="text-sm text-slate-300">
                                {isCancelled
                                    ? 'Access to your dashboard has been suspended. To restore access, please contact our support team to reactivate your subscription.'
                                    : 'Your dashboard access is temporarily restricted until payment is received. Please update your payment method or contact support.'
                                }
                            </p>
                        </div>

                        {/* Action Buttons */}
                        <div className="space-y-3 pt-4">
                            <a
                                href="mailto:support@nexresto.com?subject=Subscription%20Reactivation"
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold rounded-xl transition-all"
                            >
                                <Mail className="w-5 h-5" />
                                Contact Support
                            </a>
                            <div className="flex items-center gap-3">
                                <a
                                    href="tel:+919876543210"
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-xl transition-colors"
                                >
                                    <Phone className="w-4 h-4" />
                                    Call Us
                                </a>
                                <button
                                    onClick={() => window.location.href = '/login'}
                                    className="flex-1 px-4 py-3 border border-slate-600 hover:bg-slate-700 text-slate-300 font-medium rounded-xl transition-colors"
                                >
                                    Sign Out
                                </button>
                            </div>
                        </div>

                        {/* Footer Info */}
                        <div className="pt-4 border-t border-slate-700">
                            <p className="text-xs text-slate-500 text-center">
                                Status: <span className={isCancelled ? 'text-red-400' : 'text-yellow-400'}>{subscriptionStatus?.replace('_', ' ')}</span>
                            </p>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
