'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { Eye, EyeOff, Lock, Loader2, ShieldCheck } from 'lucide-react';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { tenantAuth } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

export default function ChangePasswordPage() {
    const router = useRouter();
    const { session, tenantId, loading, mustChangePassword } = useAuth();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (loading) return;
        if (!session) {
            router.replace('/login');
            return;
        }
        if (!mustChangePassword) {
            if (tenantId) {
                router.replace(`/${tenantId}/dashboard/orders`);
            } else {
                router.replace('/login');
            }
        }
    }, [loading, session, mustChangePassword, tenantId, router]);

    const validatePassword = (password: string) => {
        if (password.length < 8) return 'Password must be at least 8 characters.';
        if (!/[A-Z]/.test(password)) return 'Password must include at least one uppercase letter.';
        if (!/\d/.test(password)) return 'Password must include at least one number.';
        if (!/[^A-Za-z0-9]/.test(password)) return 'Password must include at least one special character.';
        return null;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const user = tenantAuth.currentUser;
        if (!user || !user.email) {
            toast.error('Session expired. Please login again.');
            router.replace('/login');
            return;
        }

        if (!currentPassword || !newPassword || !confirmPassword) {
            toast.error('Please fill all fields.');
            return;
        }

        const passwordError = validatePassword(newPassword);
        if (passwordError) {
            toast.error(passwordError);
            return;
        }

        if (newPassword !== confirmPassword) {
            toast.error('New passwords do not match.');
            return;
        }

        if (currentPassword === newPassword) {
            toast.error('New password must be different from temporary password.');
            return;
        }

        setSubmitting(true);
        try {
            const credential = EmailAuthProvider.credential(user.email, currentPassword);
            await reauthenticateWithCredential(user, credential);
            await updatePassword(user, newPassword);

            const idToken = await user.getIdToken(true);
            const res = await fetch('/api/auth/complete-password-change', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${idToken}`,
                },
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || 'Password updated, but failed to finalize account status.');
            }

            await user.getIdToken(true).catch(() => { });

            const profileRes = await fetch('/api/auth/profile', {
                headers: { Authorization: `Bearer ${await user.getIdToken()}` },
                cache: 'no-store',
            });
            const profilePayload = await profileRes.json().catch(() => ({}));
            const nextTenant = profilePayload?.profile?.tenant_id || tenantId;

            toast.success('Password updated successfully.');
            if (nextTenant) {
                router.replace(`/${nextTenant}/dashboard/orders`);
            } else {
                router.replace('/login');
            }
        } catch (err: any) {
            toast.error(err?.message || 'Failed to change password.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="w-full max-w-md bg-slate-900/85 border border-slate-700/50 rounded-3xl shadow-2xl overflow-hidden"
            >
                <div className="h-1 w-full bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-500" />
                <div className="p-8">
                    <div className="flex flex-col items-center text-center mb-6">
                        <div className="w-14 h-14 rounded-2xl bg-blue-500/15 flex items-center justify-center mb-3">
                            <ShieldCheck className="w-7 h-7 text-blue-400" />
                        </div>
                        <h1 className="text-2xl font-bold text-white">Set New Password</h1>
                        <p className="text-slate-400 text-sm mt-2">
                            First login detected. Please replace the temporary password to continue.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs text-slate-300 mb-1.5">Current Temporary Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                <input
                                    type={showCurrent ? 'text' : 'password'}
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    className="w-full pl-10 pr-10 h-11 rounded-xl bg-slate-800/70 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                                    placeholder="Enter temporary password"
                                    required
                                />
                                <button type="button" onClick={() => setShowCurrent(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs text-slate-300 mb-1.5">New Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                <input
                                    type={showNew ? 'text' : 'password'}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full pl-10 pr-10 h-11 rounded-xl bg-slate-800/70 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                                    placeholder="Create new password"
                                    required
                                />
                                <button type="button" onClick={() => setShowNew(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs text-slate-300 mb-1.5">Confirm New Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                <input
                                    type={showConfirm ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full pl-10 pr-10 h-11 rounded-xl bg-slate-800/70 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                                    placeholder="Repeat new password"
                                    required
                                />
                                <button type="button" onClick={() => setShowConfirm(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={submitting || loading}
                            className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2"
                        >
                            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update Password'}
                        </button>
                    </form>
                </div>
            </motion.div>
        </div>
    );
}
