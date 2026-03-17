'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { Eye, EyeOff, Lock, Loader2, ShieldCheck, CheckCircle2 } from 'lucide-react';
import NexRestoLogo from '@/components/ui/NexRestoLogo';
import { auth } from '@/lib/firebase';
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';
import { toast } from 'sonner';

function PasswordStrength({ password }: { password: string }) {
    const checks = [
        { label: '8+ characters', pass: password.length >= 8 },
        { label: 'Uppercase letter', pass: /[A-Z]/.test(password) },
        { label: 'Number', pass: /\d/.test(password) },
        { label: 'Special character', pass: /[^A-Za-z0-9]/.test(password) },
    ];
    const score = checks.filter(c => c.pass).length;
    const colors = ['bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500'];
    const labels = ['Weak', 'Fair', 'Good', 'Strong'];

    return (
        <div className="mt-2 space-y-2">
            <div className="flex gap-1">
                {[0, 1, 2, 3].map(i => (
                    <div
                        key={i}
                        className={`flex-1 h-1 rounded-full transition-all duration-300 ${i < score ? colors[score - 1] : 'bg-slate-700'}`}
                    />
                ))}
            </div>
            <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {checks.map(c => (
                        <span key={c.label} className={`text-[10px] flex items-center gap-1 ${c.pass ? 'text-emerald-400' : 'text-slate-500'}`}>
                            <span>{c.pass ? '✓' : '○'}</span> {c.label}
                        </span>
                    ))}
                </div>
                {score > 0 && (
                    <span className={`text-xs font-medium ${score < 2 ? 'text-rose-400' : score < 4 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {labels[score - 1]}
                    </span>
                )}
            </div>
        </div>
    );
}

function Background() {
    return (
        <div className="absolute inset-0 overflow-hidden">
            <div className="absolute inset-0 bg-slate-950" />
            {[
                { cx: '10%', cy: '20%', r: 300, color: '#1d4ed8', delay: 0 },
                { cx: '80%', cy: '70%', r: 250, color: '#4f46e5', delay: 2 },
                { cx: '50%', cy: '90%', r: 200, color: '#0f766e', delay: 4 },
            ].map((orb, i) => (
                <motion.div
                    key={i}
                    animate={{ scale: [1, 1.2, 1], opacity: [0.15, 0.25, 0.15] }}
                    transition={{ duration: 8, delay: orb.delay, repeat: Infinity, ease: 'easeInOut' }}
                    style={{
                        position: 'absolute',
                        left: orb.cx,
                        top: orb.cy,
                        width: orb.r * 2,
                        height: orb.r * 2,
                        transform: 'translate(-50%, -50%)',
                        borderRadius: '50%',
                        background: `radial-gradient(circle, ${orb.color}55 0%, transparent 70%)`,
                        filter: 'blur(40px)'
                    }}
                />
            ))}
            <div
                className="absolute inset-0 opacity-[0.03]"
                style={{
                    backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
                    backgroundSize: '50px 50px'
                }}
            />
        </div>
    );
}

function SetupPasswordContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [userEmail, setUserEmail] = useState<string | null>(null);

    const oobCode = searchParams.get('oobCode');

    useEffect(() => {
        if (!oobCode) {
            setError('Missing password reset code. Please use the link sent to your email.');
            return;
        }

        // Verify the code and get the user's email
        verifyPasswordResetCode(auth, oobCode)
            .then(email => {
                setUserEmail(email);
            })
            .catch(err => {
                setError('Invalid or expired password reset link. Please try again.');
            });
    }, [oobCode]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!oobCode) {
            setError('Missing reset code.');
            return;
        }

        if (password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        // Check password strength
        const hasUpper = /[A-Z]/.test(password);
        const hasNumber = /\d/.test(password);
        if (!hasUpper || !hasNumber) {
            setError('Password must include an uppercase letter and a number.');
            return;
        }

        setLoading(true);

        try {
            await confirmPasswordReset(auth, oobCode, password);

            setSuccess(true);
            toast.success('Password set successfully!');

            // Redirect to login after a short delay
            setTimeout(() => {
                router.push('/login');
            }, 2000);
        } catch (err: any) {
            setError(err.message || 'Failed to set password. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center relative">
                <Background />
                <div className="relative z-10 w-full max-w-md px-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-slate-900/80 backdrop-blur-2xl border border-slate-700/50 rounded-3xl shadow-2xl overflow-hidden"
                    >
                        <div className="h-1 w-full bg-gradient-to-r from-emerald-600 via-green-500 to-teal-600" />
                        <div className="p-8 text-center">
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: 'spring', delay: 0.2 }}
                                className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4"
                            >
                                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                            </motion.div>
                            <h1 className="text-2xl font-bold text-white mb-2">You're All Set!</h1>
                            <p className="text-slate-400 mb-4">
                                Your password has been updated. Redirecting to login...
                            </p>
                            <div className="flex items-center justify-center gap-2 text-slate-500">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span className="text-sm">Redirecting...</span>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center relative">
            <Background />
            <div className="relative z-10 w-full max-w-md px-4">
                <motion.div
                    initial={{ opacity: 0, y: 32, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                >
                    <div className="bg-slate-900/80 backdrop-blur-2xl border border-slate-700/50 rounded-3xl shadow-2xl overflow-hidden">
                        <div className="h-1 w-full bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600" />
                        <div className="p-8">
                            {/* Header */}
                            <div className="flex flex-col items-center mb-8">
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center mb-4 shadow-lg shadow-blue-500/30">
                                    <NexRestoLogo className="w-11 h-11" priority />
                                </div>
                                <h1 className="text-2xl font-bold text-white">Reset Password</h1>
                                {userEmail && (
                                    <p className="text-slate-400 text-sm mt-2">
                                        For <span className="text-blue-400">{userEmail}</span>
                                    </p>
                                )}
                            </div>

                            {/* Error Message */}
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm"
                                >
                                    {error}
                                </motion.div>
                            )}

                            {/* Form */}
                            <form onSubmit={handleSubmit} className="space-y-5">
                                {/* Password Field */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                        New Password
                                    </label>
                                    <div className="relative">
                                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="Enter your password"
                                            className="w-full pl-11 pr-12 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                                            required
                                            disabled={!oobCode}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                                        >
                                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                        </button>
                                    </div>
                                    <PasswordStrength password={password} />
                                </div>

                                {/* Confirm Password Field */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                        Confirm Password
                                    </label>
                                    <div className="relative">
                                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            placeholder="Confirm your password"
                                            className={`w-full pl-11 pr-4 py-3 bg-slate-800/50 border rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all ${confirmPassword && password !== confirmPassword
                                                ? 'border-rose-500/50'
                                                : confirmPassword && password === confirmPassword
                                                    ? 'border-emerald-500/50'
                                                    : 'border-slate-700/50'
                                                }`}
                                            required
                                            disabled={!oobCode}
                                        />
                                    </div>
                                    {confirmPassword && password !== confirmPassword && (
                                        <p className="mt-1 text-xs text-rose-400">Passwords do not match</p>
                                    )}
                                    {confirmPassword && password === confirmPassword && (
                                        <p className="mt-1 text-xs text-emerald-400">Passwords match ✓</p>
                                    )}
                                </div>

                                {/* Submit Button */}
                                <button
                                    type="submit"
                                    disabled={loading || password.length < 8 || password !== confirmPassword || !oobCode}
                                    className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/25 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            Setting Password...
                                        </>
                                    ) : (
                                        <>
                                            <NexRestoLogo className="w-5 h-5" />
                                            Set Password & Continue
                                        </>
                                    )}
                                </button>
                            </form>

                            {/* Footer */}
                            <p className="mt-6 text-center text-xs text-slate-500">
                                By setting your password, you agree to our Terms of Service and Privacy Policy.
                            </p>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}

export default function SetupPasswordPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-slate-950">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        }>
            <SetupPasswordContent />
        </Suspense>
    );
}
