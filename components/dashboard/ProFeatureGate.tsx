'use client';

/**
 * Pro Feature Gate Component
 * Shows a locked state for Starter tier users attempting to access Pro features
 */

import { motion } from 'motion/react';
import { Lock, Sparkles, ArrowRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSuperAdminAuth } from '@/context/SuperAdminAuthContext';
import { cn } from '@/lib/utils';

interface ProFeatureGateProps {
    feature: string;
    description?: string;
    children: React.ReactNode;
    className?: string;
}

/**
 * Wraps a feature that requires Pro tier.
 * Shows locked overlay for Starter users, renders children for Pro users.
 */
export function ProFeatureGate({ feature, description, children, className }: ProFeatureGateProps) {
    const { subscriptionTier, isImpersonating } = useAuth();
    const { session: superAdminSession, userRole: superAdminRole } = useSuperAdminAuth();
    // Pro tier can be 'pro', '2k', or '2.5k' (backwards compatibility)
    const isSuperAdmin = !!superAdminSession && superAdminRole === 'super_admin';
    const isPro = isSuperAdmin || isImpersonating || subscriptionTier === 'pro' || subscriptionTier === '2k' || subscriptionTier === '2.5k';

    if (isPro) {
        return <>{children}</>;
    }

    return (
        <div className={cn("relative", className)}>
            {/* Blurred content preview */}
            <div className="blur-[2px] pointer-events-none select-none opacity-50">
                {children}
            </div>
            
            {/* Lock overlay */}
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-900/80 to-slate-800/80 backdrop-blur-sm rounded-2xl"
            >
                <div className="text-center p-6 max-w-xs">
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-4 shadow-lg shadow-purple-500/30">
                        <Lock className="w-7 h-7 text-white" />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2">{feature}</h3>
                    <p className="text-sm text-slate-300 mb-4">
                        {description || 'This feature is available on the Pro plan.'}
                    </p>
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/20 border border-purple-500/30 rounded-xl text-purple-300 text-sm font-medium">
                        <Sparkles className="w-4 h-4" />
                        Upgrade to Pro
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

/**
 * Simple badge to indicate a Pro-only feature
 */
export function ProBadge({ className }: { className?: string }) {
    return (
        <span className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[10px] font-bold uppercase tracking-wider rounded-full",
            className
        )}>
            <Sparkles className="w-3 h-3" />
            Pro
        </span>
    );
}

/**
 * Card component for showing locked Pro features in a list
 */
export function ProFeatureCard({ 
    title, 
    description, 
    icon: Icon 
}: { 
    title: string; 
    description: string; 
    icon: React.ComponentType<{ className?: string }>;
}) {
    const { subscriptionTier, isImpersonating } = useAuth();
    const { session: superAdminSession, userRole: superAdminRole } = useSuperAdminAuth();
    // Pro tier can be 'pro', '2k', or '2.5k' (backwards compatibility)
    const isSuperAdmin = !!superAdminSession && superAdminRole === 'super_admin';
    const isPro = isSuperAdmin || isImpersonating || subscriptionTier === 'pro' || subscriptionTier === '2k' || subscriptionTier === '2.5k';

    return (
        <div className={cn(
            "relative p-4 rounded-xl border transition-all",
            isPro 
                ? "bg-white border-slate-200 hover:border-purple-300 hover:shadow-md" 
                : "bg-slate-50 border-slate-200/60"
        )}>
            <div className="flex items-start gap-3">
                <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    isPro 
                        ? "bg-gradient-to-br from-purple-500 to-pink-500 text-white" 
                        : "bg-slate-200 text-slate-400"
                )}>
                    <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h4 className={cn("font-semibold text-sm", isPro ? "text-slate-900" : "text-slate-500")}>
                            {title}
                        </h4>
                        {!isPro && <ProBadge />}
                    </div>
                    <p className={cn("text-xs mt-0.5", isPro ? "text-slate-500" : "text-slate-400")}>
                        {description}
                    </p>
                </div>
                {!isPro && <Lock className="w-4 h-4 text-slate-300" />}
            </div>
        </div>
    );
}
