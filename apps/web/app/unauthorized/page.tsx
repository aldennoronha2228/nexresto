'use client';

import { motion } from 'motion/react';
import { ShieldX, ArrowLeft, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function UnauthorizedPage() {
    const { user, signOut } = useAuth();
    const router = useRouter();

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
                    <button onClick={() => router.push('/login')} className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10">
                        Back to Login
                    </button>
                </div>
            </header>

            <main
                className="flex min-h-screen items-center justify-center p-4 pt-28"
                style={{
                    background:
                        'radial-gradient(60rem 32rem at 8% 6%, rgba(62, 84, 211, 0.2), transparent 60%), radial-gradient(44rem 28rem at 92% 10%, rgba(16, 185, 129, 0.12), transparent 60%), #131313'
                }}
            >
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center max-w-sm rounded-2xl border border-white/10 bg-[#171717] p-8">
                <motion.div animate={{ rotate: [0, -10, 10, -10, 0] }} transition={{ duration: 0.6, delay: 0.3 }} className="w-20 h-20 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto mb-6">
                    <ShieldX className="w-10 h-10 text-rose-400" />
                </motion.div>
                <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
                <p className="text-[#c5c5d6] text-sm mb-1"><strong className="text-white">{user?.email}</strong></p>
                <p className="text-[#8f8fa0] text-sm mb-8">Your account is not authorized to access this dashboard. Contact the restaurant administrator to grant you access.</p>
                <div className="flex flex-col gap-3">
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => { signOut(); router.push('/login'); }} className="flex items-center justify-center gap-2 px-6 py-3 bg-[#3e54d3] hover:opacity-90 text-[#d8dbff] rounded-xl text-sm font-medium transition-colors">
                        <LogOut className="w-4 h-4" />Sign Out & Try Another Account
                    </motion.button>
                    <button onClick={() => router.push('/login')} className="flex items-center justify-center gap-2 px-6 py-3 text-[#8f8fa0] hover:text-white text-sm transition-colors">
                        <ArrowLeft className="w-4 h-4" />Back to Login
                    </button>
                </div>
            </motion.div>
            </main>
        </div>
    );
}
