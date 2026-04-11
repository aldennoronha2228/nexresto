'use client';

import { useEffect } from 'react';
import { motion } from 'motion/react';
import { Lock, Construction } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function MaintenancePage() {
    const router = useRouter();

    useEffect(() => {
        let active = true;

        const checkMaintenanceStatus = async () => {
            try {
                const res = await fetch('/api/platform/maintenance', { cache: 'no-store' });
                if (!res.ok || !active) return;
                const data = await res.json();
                if (!data?.enabled && active) {
                    router.replace('/');
                }
            } catch {
                // Keep the current page if status check fails.
            }
        };

        checkMaintenanceStatus();
        const interval = window.setInterval(checkMaintenanceStatus, 2000);

        return () => {
            active = false;
            window.clearInterval(interval);
        };
    }, [router]);

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
            <div className="max-w-md w-full">
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="w-20 h-20 rounded-3xl bg-blue-100 mx-auto flex items-center justify-center mb-8"
                >
                    <Construction className="w-10 h-10 text-blue-600" />
                </motion.div>

                <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-4">
                    Website Under Maintenance
                </h1>

                <p className="text-slate-500 mb-10 leading-relaxed text-sm">
                    We are currently repairing and upgrading the platform.
                    Please check back shortly.
                    <br /><br />
                    <span className="font-semibold text-slate-700 italic">
                        Public access is temporarily blocked during maintenance.
                    </span>
                </p>

                <div className="space-y-4">
                    <Link href="/login">
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="w-full h-12 bg-slate-900 text-white rounded-2xl font-semibold shadow-lg shadow-slate-900/10 flex items-center justify-center gap-2"
                        >
                            <Lock className="w-4 h-4" />
                            Admin Sign In
                        </motion.button>
                    </Link>
                </div>

                <div className="mt-12 text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                    Powered by NexResto
                </div>

                <div className="mt-4">
                    <Link href="/login?next=/super-admin" className="text-xs text-slate-500 hover:text-slate-700 underline underline-offset-4">
                        Are you the developer?
                    </Link>
                </div>
            </div>
        </div>
    );
}

// Explanation:
// This is a "Fallback Page". When the database says the site isn't public,
// we show this simple, professional page instead of the actual menu.
