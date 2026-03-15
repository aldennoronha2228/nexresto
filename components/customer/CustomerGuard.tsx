'use client';

/**
 * components/customer/CustomerGuard.tsx
 * --------------------------------------
 * SECURITY: "The Digital Gatekeeper" 
 * This component checks the site-wide settings BEFORE showing the menu.
 * 
 * Logic Concept:
 * If the site is "PUBLIC", anyone can enter.
 * If the site is "PRIVATE", only someone with an admin session can see it.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fetchIsSitePublic } from '@/lib/firebase-api';
import { useAuth } from '@/context/AuthContext';
import { RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';

export function CustomerGuard({ children }: { children: React.ReactNode }) {
    const { isAdmin, loading: authLoading, tenantId } = useAuth();
    const [isPublic, setIsPublic] = useState<boolean | null>(null);
    const router = useRouter();

    useEffect(() => {
        const checkAccess = async () => {
            try {
                // Fetch the site status from the Database
                if (!tenantId) {
                    setIsPublic(true); // If tenantId is missing, default to public
                    return;
                }
                const publicStatus = await fetchIsSitePublic(tenantId);
                setIsPublic(publicStatus);

                // PERFORMANCE: If not public and user is not an admin, 
                // we send them to the "Maintenance" page immediately.
                if (publicStatus === false && !isAdmin && !authLoading) {
                    console.warn('[CustomerGuard] Access Denied: Site is PRIVATE and user is not an Admin.');
                    router.replace('/maintenance');
                }
            } catch (err) {
                // If database fails, assume public to prevent locking users out
                setIsPublic(true);
            }
        };

        if (!authLoading) {
            checkAccess();
        }
    }, [isAdmin, authLoading, router]);

    // If we're still checking, show a professional loading indicator
    if (isPublic === null || authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white p-6">
                <div className="flex flex-col items-center gap-4">
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                    >
                        <RefreshCw className="w-8 h-8 text-blue-500/40" />
                    </motion.div>
                    <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest animate-pulse">
                        Checking Access...
                    </p>
                </div>
            </div>
        );
    }

    // Logic: If it's public, or they're an admin, they can see the site!
    if (isPublic === true || isAdmin) {
        return <>{children}</>;
    }

    // Otherwise, they'll be redirected shortly.
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            {/* Fallback while router.replace is running */}
        </div>
    );
}

/**
 * Explanation for Beginners:
 * This component uses a "Conditional Check". 
 * Think of it like a bouncer at a club checking a guest list. 
 * 'isPublic' is like "Is it open to everyone tonight?" 
 * 'isAdmin' is like "Is this person a VIP?"
 */
