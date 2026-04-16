'use client';

/**
 * Subscription Guard Component
 * Blocks access when restaurant subscription is suspended/cancelled
 */

import { motion } from 'motion/react';
import { AlertTriangle } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useSuperAdminAuth } from '@/context/SuperAdminAuthContext';

interface SubscriptionGuardProps {
    children: React.ReactNode;
}

export function SubscriptionGuard({ children }: SubscriptionGuardProps) {
    const { subscriptionStatus, tenantName, tenantId, userRole, loading, isImpersonating, signOut } = useAuth();
    const { userRole: superAdminRole } = useSuperAdminAuth();
    const params = useParams<{ storeId: string }>();
    const router = useRouter();
    const isSuperAdmin = superAdminRole === 'super_admin';
    const canRenewPlan = userRole === 'owner' || userRole === 'admin';
    const targetStoreId = params?.storeId || tenantId || '';

    // Don't block while loading
    if (loading) {
        return <>{children}</>;
    }

    // Allow access if status is active/trial OR if user is a Super Admin (God Mode bypass)
    if (isSuperAdmin || isImpersonating || subscriptionStatus === 'active' || subscriptionStatus === 'trial' || !subscriptionStatus) {
        return <>{children}</>;
    }

    // Block access for cancelled or past_due
    const isCancelled = subscriptionStatus === 'cancelled';

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-md"
            >
                <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 overflow-hidden">
                    <div className={`px-6 py-8 text-center ${isCancelled ? 'bg-red-500/10' : 'bg-yellow-500/10'}`}>
                        <div className={`w-16 h-16 mx-auto rounded-2xl ${isCancelled ? 'bg-red-500/20' : 'bg-yellow-500/20'} flex items-center justify-center mb-4`}>
                            <AlertTriangle className={`w-8 h-8 ${isCancelled ? 'text-red-500' : 'text-yellow-500'}`} />
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2">
                            {isCancelled ? 'Plan Not Renewed' : 'Payment Required'}
                        </h1>
                        <p className="text-slate-400">
                            {isCancelled
                                ? 'Your subscription has ended and dashboard access is now blocked.'
                                : 'Your subscription payment is overdue and access is blocked until renewal.'}
                        </p>
                    </div>

                    <div className="p-6 space-y-4">
                        {tenantName && (
                            <div className="text-center pb-4 border-b border-slate-700">
                                <p className="text-slate-400 text-sm">Restaurant</p>
                                <p className="text-white font-semibold">{tenantName}</p>
                            </div>
                        )}

                        <p className="text-sm text-slate-300">
                            Renew your plan to restore dashboard access and continue managing orders, menu, and settings.
                        </p>

                        <div className="pt-2 space-y-3">
                            {canRenewPlan ? (
                                <button
                                    onClick={() => {
                                        if (!targetStoreId) {
                                            router.replace('/login');
                                            return;
                                        }
                                        router.push(`/${targetStoreId}/choose-plan`);
                                    }}
                                    className="w-full px-4 py-3 rounded-xl bg-[#3e54d3] hover:opacity-90 text-sm text-[#d8dbff] font-semibold transition"
                                >
                                    Choose Plan & Renew
                                </button>
                            ) : (
                                <div className="w-full px-4 py-3 bg-slate-700/60 border border-slate-600 rounded-xl text-center">
                                    <p className="text-sm text-slate-200 font-medium">Please contact the owner to renew the plan.</p>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={async () => {
                                await signOut();
                                router.replace('/login');
                            }}
                            className="w-full px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-sm text-white font-medium transition-colors"
                        >
                            Back to Login
                        </button>

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
