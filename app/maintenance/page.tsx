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
        <div className="min-h-screen bg-[#131313] text-[#e5e2e1]">
            <header className="fixed top-0 z-50 w-full border-b border-white/5 bg-black/60 backdrop-blur-xl">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
                    <div className="flex items-center gap-3">
                        <img
                            alt="NexResto logo mark"
                            className="h-9 w-9 rounded-xl border border-white/15 bg-black/30 p-1"
                            src="/nexresto-mark.svg?v=20260415a"
                        />
                        <span className="text-xl font-bold tracking-tight text-white">NexResto</span>
                    </div>
                    <Link
                        className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
                        href="/login"
                    >
                        Login
                    </Link>
                </div>
            </header>

            <main
                className="flex min-h-screen items-center justify-center p-6 pt-28 text-center"
                style={{
                    background:
                        'radial-gradient(60rem 32rem at 8% 6%, rgba(62, 84, 211, 0.2), transparent 60%), radial-gradient(44rem 28rem at 92% 10%, rgba(16, 185, 129, 0.12), transparent 60%), #131313'
                }}
            >
            <div className="max-w-md w-full rounded-2xl border border-white/10 bg-[#171717] p-8">
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="w-20 h-20 rounded-3xl bg-[#3e54d3]/20 mx-auto flex items-center justify-center mb-8 border border-[#3e54d3]/40"
                >
                    <Construction className="w-10 h-10 text-[#bbc3ff]" />
                </motion.div>

                <h1 className="text-3xl font-bold text-white tracking-tight mb-4">
                    Website Under Maintenance
                </h1>

                <p className="text-[#c5c5d6] mb-10 leading-relaxed text-sm">
                    We are currently repairing and upgrading the platform.
                    Please check back shortly.
                    <br /><br />
                    <span className="font-semibold text-white italic">
                        Public access is temporarily blocked during maintenance.
                    </span>
                </p>

                <div className="space-y-4">
                    <Link href="/login">
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="w-full h-12 bg-[#3e54d3] text-[#d8dbff] rounded-2xl font-semibold shadow-lg shadow-[#3e54d3]/20 flex items-center justify-center gap-2"
                        >
                            <Lock className="w-4 h-4" />
                            Admin Sign In
                        </motion.button>
                    </Link>
                </div>

                <div className="mt-12 text-[10px] text-[#8f8fa0] uppercase tracking-widest font-bold">
                    Powered by NexResto
                </div>

                <div className="mt-4">
                    <Link href="/login?next=/super-admin" className="text-xs text-[#c5c5d6] hover:text-white underline underline-offset-4">
                        Are you the developer?
                    </Link>
                </div>
            </div>
            </main>
        </div>
    );
}

// Explanation:
// This is a "Fallback Page". When the database says the site isn't public,
// we show this simple, professional page instead of the actual menu.
