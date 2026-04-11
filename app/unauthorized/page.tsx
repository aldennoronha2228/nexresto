'use client';

import { motion } from 'motion/react';
import { ShieldX, ArrowLeft, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function UnauthorizedPage() {
    const { user, signOut } = useAuth();
    const router = useRouter();

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center max-w-sm">
                <motion.div animate={{ rotate: [0, -10, 10, -10, 0] }} transition={{ duration: 0.6, delay: 0.3 }} className="w-20 h-20 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto mb-6">
                    <ShieldX className="w-10 h-10 text-rose-400" />
                </motion.div>
                <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
                <p className="text-slate-400 text-sm mb-1"><strong className="text-slate-300">{user?.email}</strong></p>
                <p className="text-slate-500 text-sm mb-8">Your account is not authorized to access this dashboard. Contact the restaurant administrator to grant you access.</p>
                <div className="flex flex-col gap-3">
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => { signOut(); router.push('/login'); }} className="flex items-center justify-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-medium transition-colors">
                        <LogOut className="w-4 h-4" />Sign Out & Try Another Account
                    </motion.button>
                    <button onClick={() => router.push('/login')} className="flex items-center justify-center gap-2 px-6 py-3 text-slate-500 hover:text-slate-300 text-sm transition-colors">
                        <ArrowLeft className="w-4 h-4" />Back to Login
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
