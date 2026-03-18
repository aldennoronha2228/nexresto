'use client';

import { memo, useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Mail, Lock, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import NexRestoLogo from '@/components/ui/NexRestoLogo';
import { signInWithEmail, signInWithGoogle, signUpAndCreateTenant } from '@/lib/firebase-auth';
import { signInWithCredential, GoogleAuthProvider, signInWithEmailAndPassword } from 'firebase/auth';
import { tenantAuth, adminAuth } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useSuperAdminAuth } from '@/context/SuperAdminAuthContext';


const GoogleIcon = memo(function GoogleIcon() {
    return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
    );
});

const ORBS = [
    { cx: '10%', cy: '20%', r: 300, color: '#1d4ed8', delay: 0 },
    { cx: '80%', cy: '70%', r: 250, color: '#4f46e5', delay: 2 },
    { cx: '50%', cy: '90%', r: 200, color: '#0f766e', delay: 4 },
];

const Background = memo(function Background() {
    return (
        <div className="absolute inset-0 overflow-hidden">
            <div className="absolute inset-0 bg-slate-950" />
            {ORBS.map((orb, i) => (
                <motion.div key={i} className="hidden sm:block" animate={{ scale: [1, 1.2, 1], opacity: [0.15, 0.25, 0.15] }} transition={{ duration: 8, delay: orb.delay, repeat: Infinity, ease: 'easeInOut' }} style={{ position: 'absolute', left: orb.cx, top: orb.cy, width: orb.r * 2, height: orb.r * 2, transform: 'translate(-50%, -50%)', borderRadius: '50%', background: `radial-gradient(circle, ${orb.color}55 0%, transparent 70%)`, filter: 'blur(40px)' }} />
            ))}
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '50px 50px' }} />
        </div>
    );
});

const PasswordStrength = memo(function PasswordStrength({ password }: { password: string }) {
    const checks = useMemo(() => [
        { label: '8+ characters', pass: password.length >= 8 },
        { label: 'Uppercase letter', pass: /[A-Z]/.test(password) },
        { label: 'Number', pass: /\d/.test(password) },
        { label: 'Special character', pass: /[^A-Za-z0-9]/.test(password) },
    ], [password]);
    const score = useMemo(() => checks.filter(c => c.pass).length, [checks]);
    const colors = ['bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500'];
    const labels = ['Weak', 'Fair', 'Good', 'Strong'];
    return (
        <div className="mt-2 space-y-2">
            <div className="flex gap-1">{[0, 1, 2, 3].map(i => <div key={i} className={`flex-1 h-1 rounded-full transition-all duration-300 ${i < score ? colors[score - 1] : 'bg-slate-700'}`} />)}</div>
            <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-x-3 gap-y-1">{checks.map(c => <span key={c.label} className={`text-[10px] flex items-center gap-1 ${c.pass ? 'text-emerald-400' : 'text-slate-500'}`}><span>{c.pass ? '✓' : '○'}</span> {c.label}</span>)}</div>
                {score > 0 && <span className={`text-xs font-medium ${score < 2 ? 'text-rose-400' : score < 4 ? 'text-amber-400' : 'text-emerald-400'}`}>{labels[score - 1]}</span>}
            </div>
        </div>
    );
});

type FormMode = 'signin' | 'signup' | 'verify-otp';



export default function LoginPage() {
    const { session, loading, userRole, tenantLoading, tenantId, mustChangePassword } = useAuth();
    const { session: adminSession, loading: adminLoading, userRole: adminUserRole } = useSuperAdminAuth();
    const router = useRouter();
    const [mode, setMode] = useState<FormMode>('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [restaurantName, setRestaurantName] = useState('');
    const [masterPin, setMasterPin] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [formLoading, setFormLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [resetLoading, setResetLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);

    // OTP verification state
    const [enteredOtp, setEnteredOtp] = useState('');
    const [otpExpiry, setOtpExpiry] = useState<string | null>(null);

    useEffect(() => {
        if (!loading && !tenantLoading && !adminLoading && session) {
            if (mustChangePassword) {
                router.replace('/change-password');
                return;
            }

            if (userRole === 'super_admin') {
                if (adminSession) {
                    router.replace('/super-admin');
                }
                return;
            }

            if (userRole && tenantId) {
                router.replace(`/${tenantId}/dashboard/orders`);
            } else if (!tenantLoading && !userRole) {
                router.replace('/unauthorized');
            }
        }
    }, [session, loading, tenantLoading, adminLoading, adminSession, userRole, tenantId, mustChangePassword, router]);

    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) { setError('Please fill in all fields.'); return; }
        if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
        setFormLoading(true); setError(null); setInfo(null);
        try {
            if (mode === 'signup') {
                if (!fullName) { setError('Please enter your full name.'); setFormLoading(false); return; }
                if (!restaurantName) { setError('Please enter your restaurant name.'); setFormLoading(false); return; }
                if (!masterPin || masterPin.length < 4) { setError('Please set a Master PIN (at least 4 characters).'); setFormLoading(false); return; }

                // Step 1: Send OTP to email
                const res = await fetch('/api/auth/signup-init', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password, fullName, restaurantName, masterPin }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);

                setOtpExpiry(data.expiresAt);
                setMode('verify-otp');
                setInfo('Check your email for the verification code.');
            } else {
                let userCredential;
                let savedCustomToken: string | null = null;

                try {
                    // Fast path for the majority of users.
                    userCredential = await signInWithEmail(email, password);
                } catch (tenantAuthError: any) {
                    const code = String(tenantAuthError?.code || '');
                    const isCredentialError =
                        code === 'auth/invalid-credential' ||
                        code === 'auth/wrong-password' ||
                        code === 'auth/user-not-found' ||
                        code === 'auth/invalid-email';
                    const shouldTryAdminFallback =
                        isCredentialError ||
                        code === 'auth/internal-error';

                    if (!shouldTryAdminFallback) throw tenantAuthError;

                    // Fallback for super-admin credentials synced via .env route.
                    const adminVerifyRes = await fetch('/api/auth/admin-verify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, password }),
                    });

                    if (!adminVerifyRes.ok) {
                        throw tenantAuthError;
                    }

                    const data = await adminVerifyRes.json();
                    savedCustomToken = data.customToken;
                    if (!savedCustomToken) throw new Error('Admin verification did not return a token.');

                    const { signInWithToken } = await import('@/lib/firebase-auth');
                    userCredential = await signInWithToken(savedCustomToken);
                }

                const user = userCredential.user;
                const [idToken, tokenResult] = await Promise.all([
                    user.getIdToken(),
                    user.getIdTokenResult().catch(() => null),
                ]);

                // For all users, fetch profile to resolve orientation/dashboard
                const profileRes = await fetch('/api/auth/profile', {
                    headers: { Authorization: `Bearer ${idToken}` },
                });

                if (profileRes.ok) {
                    const { profile } = await profileRes.json();
                    if (profile?.must_change_password) {
                        router.replace('/change-password');
                        return;
                    }

                    if (profile?.role === 'super_admin') {
                        // Store the custom token so the super-admin page can
                        // sign into its isolated adminAuth instance without blocking login.
                        if (savedCustomToken) {
                            sessionStorage.setItem('pending_admin_token', savedCustomToken);
                        } else {
                            try {
                                await signInWithEmailAndPassword(adminAuth, email, password);
                            } catch (seedErr) {
                                console.warn('Could not seed adminAuth instance with email/password:', seedErr);
                            }
                        }
                        router.replace('/super-admin');
                        return;
                    }
                    if (profile?.role && profile?.tenant_id) {
                        router.replace(`/${profile.tenant_id}/dashboard/orders`);
                        return;
                    }
                }

                if (tokenResult?.claims?.must_change_password) {
                    router.replace('/change-password');
                    return;
                }

                const fallbackRole = tokenResult?.claims?.role as string | undefined;
                const fallbackTenant = tokenResult?.claims?.tenant_id || tokenResult?.claims?.restaurant_id;
                if (fallbackRole === 'super_admin') {
                    if (savedCustomToken) {
                        sessionStorage.setItem('pending_admin_token', savedCustomToken);
                    } else {
                        try {
                            await signInWithEmailAndPassword(adminAuth, email, password);
                        } catch (seedErr) {
                            console.warn('Could not seed adminAuth instance with fallback role:', seedErr);
                        }
                    }
                    router.replace('/super-admin');
                    return;
                }
                if (fallbackRole && fallbackTenant) {
                    router.replace(`/${fallbackTenant}/dashboard/orders`);
                    return;
                }

                // If we reach here, no valid dashboard role found
                router.replace('/unauthorized');
            }
        } catch (err: any) {
            const msg = err?.message ?? 'Authentication failed';
            if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password') || msg.includes('auth/user-not-found')) {
                setError('Incorrect email or password. Please try again.');
            } else if (msg.includes('auth/internal-error')) {
                setError('Firebase authentication temporarily failed. Please try again in a few seconds. If this continues, confirm Email/Password sign-in is enabled in Firebase Auth and this account exists.');
            } else if (msg.includes('auth/email-already-in-use') || msg.includes('already registered')) {
                setError('This email is already registered. Try signing in instead.');
            } else if (msg.includes('auth/too-many-requests')) {
                setError('Too many failed attempts. Please wait a moment and try again.');
            } else if (msg.includes('not authorized') || msg.includes('not the owner')) {
                setError('Your account does not have dashboard access. Contact the administrator.');
            } else {
                setError(msg);
            }
        } finally { setFormLoading(false); }
    };

    const handleVerifyOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!enteredOtp || enteredOtp.length !== 6) {
            setError('Please enter the 6-digit verification code.');
            return;
        }
        setFormLoading(true); setError(null);
        try {
            const res = await fetch('/api/auth/signup-verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, otp: enteredOtp }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            setInfo('Account created successfully! You can now sign in.');
            setMode('signin');
            setEnteredOtp('');
        } catch (err: any) {
            setError(err?.message ?? 'Verification failed');
        } finally { setFormLoading(false); }
    };

    const handleGoogle = async () => {
        setGoogleLoading(true); setError(null);
        try {
            const result = await signInWithGoogle();
            const user = result.user;

            const idToken = await user.getIdToken(true);

            // Fetch profile for tenant info
            const profileRes = await fetch('/api/auth/profile', {
                headers: { Authorization: `Bearer ${idToken}` },
            });

            if (profileRes.ok) {
                const { profile } = await profileRes.json();
                if (profile?.must_change_password) {
                    router.replace('/change-password');
                    return;
                }

                if (profile?.role === 'super_admin') {
                    // Seed the admin-specific auth instance too
                    const credential = GoogleAuthProvider.credentialFromResult(result);
                    if (credential) {
                        try {
                            await signInWithCredential(adminAuth, credential);
                        } catch (err) {
                            console.warn('Could not seed adminAuth instance:', err);
                        }
                    }
                    // Ensure fresh claims before redirect.
                    await user.getIdToken(true).catch(() => { });
                    router.replace('/super-admin');
                    return;
                }
                if (profile?.role && profile?.tenant_id) {
                    // Claims can be set server-side during profile hydration.
                    await user.getIdToken(true).catch(() => { });
                    router.replace(`/${profile.tenant_id}/dashboard/orders`);
                    return;
                }
            }

            // No profile found → unauthorized
            router.replace('/unauthorized');
        } catch (err: any) {
            const code = typeof err?.code === 'string' ? err.code : '';
            if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
                // User dismissed the popup. Keep the form quiet.
                return;
            }
            setError(err?.message ?? 'Google sign-in failed');
        } finally {
            setGoogleLoading(false);
        }
    };

    const handleForgotPassword = async () => {
        if (!email.trim()) {
            setError('Enter your email first, then click Forgot Password.');
            return;
        }

        setResetLoading(true);
        setError(null);
        setInfo(null);
        try {
            const res = await fetch('/api/auth/password-reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim() }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.error || 'Failed to send reset email.');
            }

            setInfo(data?.message || 'If this email exists, a reset link has been sent.');
        } catch (err: any) {
            setError(err?.message || 'Failed to send reset email. Please try again.');
        } finally {
            setResetLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center relative">
            <Background />
            <div className="relative z-10 w-full max-w-md px-4">
                <motion.div initial={{ opacity: 0, y: 32, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
                    <div className="bg-slate-900/85 sm:bg-slate-900/80 backdrop-blur-md sm:backdrop-blur-2xl border border-slate-700/50 rounded-3xl shadow-2xl overflow-hidden">
                        <div className="h-1 w-full bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600" />
                        <div className="p-8">
                            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="flex flex-col items-center mb-8">
                                <div className="w-16 h-16 rounded-2xl bg-slate-800/70 border border-slate-700/70 flex items-center justify-center mb-4 shadow-lg shadow-blue-500/20">
                                    <NexRestoLogo className="w-11 h-11" priority />
                                </div>
                                <h1 className="text-2xl font-bold text-white tracking-tight">NexResto Dashboard</h1>
                                <p className="text-slate-400 text-sm mt-1">Authorized personnel only</p>
                            </motion.div>

                            {mode !== 'verify-otp' && (
                                <div className="flex gap-1 p-1 bg-slate-800/60 rounded-xl mb-6">
                                    {(['signin', 'signup'] as const).map(m => (
                                        <button key={m} onClick={() => { setMode(m); setError(null); setInfo(null); setEnteredOtp(''); }} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === m ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25' : 'text-slate-400 hover:text-white'}`}>
                                            {m === 'signin' ? 'Sign In' : 'Create Account'}
                                        </button>
                                    ))}
                                </div>
                            )}

                            <AnimatePresence mode="wait">
                                {error && (
                                    <motion.div key="error" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-5">
                                        <div className="flex items-start gap-3 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-sm text-rose-300">
                                            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                            <div className="flex-1">{error}</div>
                                        </div>
                                    </motion.div>
                                )}
                                {info && (
                                    <motion.div key="info" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-5">
                                        <div className="flex items-start gap-3 p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-sm text-emerald-300">
                                            <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                            <div className="flex-1">{info}</div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {mode === 'verify-otp' ? (
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                                    <div className="text-center">
                                        <div className="flex items-center justify-center gap-2 mb-3 text-xs font-bold text-emerald-400 uppercase tracking-widest">
                                            <Mail className="w-3.5 h-3.5" /> Check Your Email
                                        </div>
                                        <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-6 mb-4">
                                            <Mail className="w-12 h-12 mx-auto text-emerald-400 mb-3" />
                                            <p className="text-sm text-slate-300 mb-2">We sent a 6-digit code to</p>
                                            <p className="text-emerald-400 font-medium">{email}</p>
                                        </div>
                                        <p className="text-[10px] text-slate-500">Code expires in 10 minutes</p>
                                    </div>

                                    <form onSubmit={handleVerifyOtp} className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 mb-1.5 ml-1">Enter Verification Code</label>
                                            <input suppressHydrationWarning type="text" value={enteredOtp} onChange={e => setEnteredOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" maxLength={6} className="w-full h-14 px-4 bg-slate-800/60 border border-slate-700/60 rounded-xl text-white text-center text-2xl font-mono tracking-[0.3em] placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40 transition-all" />
                                        </div>
                                        <motion.button type="submit" disabled={formLoading || enteredOtp.length !== 6} whileHover={{ scale: formLoading ? 1 : 1.02 }} whileTap={{ scale: formLoading ? 1 : 0.98 }} className="w-full h-12 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                                            {formLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Verifying...</> : 'Verify & Create Account →'}
                                        </motion.button>
                                        <button type="button" onClick={() => { setMode('signup'); setEnteredOtp(''); setError(null); }} className="w-full h-10 text-slate-400 hover:text-white text-sm transition-colors">← Back to signup</button>
                                    </form>
                                </motion.div>
                            ) : (
                                <form onSubmit={handleEmailAuth} className="space-y-4 text-left">
                                    <AnimatePresence>
                                        {mode === 'signup' && (
                                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-4">
                                                <div>
                                                    <label className="block text-xs font-medium text-slate-400 mb-1.5 ml-1">Full Name</label>
                                                    <input suppressHydrationWarning type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="John Smith" autoComplete="name" className="w-full h-12 px-4 bg-slate-800/60 border border-slate-700/60 rounded-xl text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-slate-400 mb-1.5 ml-1">Restaurant Name</label>
                                                    <input suppressHydrationWarning type="text" value={restaurantName} onChange={e => setRestaurantName(e.target.value)} placeholder="e.g. The Grand Bistro" autoComplete="organization" className="w-full h-12 px-4 bg-slate-800/60 border border-slate-700/60 rounded-xl text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all" />
                                                    <p className="mt-1 ml-1 text-[10px] text-slate-600">Your customers will see this name on their menu.</p>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-slate-400 mb-1.5 ml-1">Master PIN</label>
                                                    <input suppressHydrationWarning type="text" value={masterPin} onChange={e => setMasterPin(e.target.value)} placeholder="e.g. 1234 or MySecretPin" autoComplete="off" className="w-full h-12 px-4 bg-slate-800/60 border border-slate-700/60 rounded-xl text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all font-mono" />
                                                    <p className="mt-1 ml-1 text-[10px] text-slate-600">Your secret PIN for admin tasks. Save this!</p>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-1.5 ml-1">Email</label>
                                        <div className="relative">
                                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                            <input suppressHydrationWarning type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@restaurant.com" autoComplete="email" required className="w-full h-12 pl-11 pr-4 bg-slate-800/60 border border-slate-700/60 rounded-xl text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-1.5 ml-1">Password</label>
                                        <div className="relative">
                                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                            <input suppressHydrationWarning type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === 'signup' ? 'Minimum 8 characters' : '••••••••'} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required className="w-full h-12 pl-11 pr-12 bg-slate-800/60 border border-slate-700/60 rounded-xl text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all" />
                                            <button type="button" onClick={() => setShowPass(p => !p)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                                                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                        {mode === 'signin' && (
                                            <div className="mt-2 flex justify-end">
                                                <button
                                                    type="button"
                                                    onClick={handleForgotPassword}
                                                    disabled={resetLoading || formLoading || googleLoading}
                                                    className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-60"
                                                >
                                                    {resetLoading ? 'Sending reset email...' : 'Forgot Password?'}
                                                </button>
                                            </div>
                                        )}
                                        {mode === 'signup' && password && <PasswordStrength password={password} />}
                                    </div>
                                    <motion.button type="submit" disabled={formLoading} whileHover={{ scale: formLoading ? 1 : 1.02 }} whileTap={{ scale: formLoading ? 1 : 0.98 }} className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                                        {formLoading ? (<><Loader2 className="w-4 h-4 animate-spin" />{mode === 'signin' ? 'Signing in…' : 'Creating account…'}</>) : (mode === 'signin' ? 'Sign In →' : 'Create Account →')}
                                    </motion.button>
                                </form>
                            )}

                            <div className="flex items-center gap-3 my-5"><div className="flex-1 h-px bg-slate-700/60" /><span className="text-xs text-slate-500 font-medium">or continue with</span><div className="flex-1 h-px bg-slate-700/60" /></div>

                            <motion.button onClick={handleGoogle} disabled={googleLoading} whileHover={{ scale: googleLoading ? 1 : 1.02 }} whileTap={{ scale: googleLoading ? 1 : 0.98 }} className="w-full h-12 flex items-center justify-center gap-3 bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/60 hover:border-slate-500/60 text-white rounded-xl font-medium text-sm transition-all disabled:opacity-60">
                                {googleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleIcon />}
                                {googleLoading ? 'Redirecting to Google…' : 'Sign in with Google'}
                            </motion.button>

                            <p className="mt-6 text-center text-xs text-slate-500 leading-relaxed">
                                🔒 Only authorized admin accounts can access this dashboard.<br />Contact your administrator if you need access.
                            </p>
                        </div>
                    </div>
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="flex items-center justify-center gap-2 mt-4 text-xs text-slate-600">
                        <ShieldCheck className="w-3.5 h-3.5" /><span>Secured by Firebase Auth • End-to-end encrypted sessions</span>
                    </motion.div>
                </motion.div>
            </div>
        </div>
    );
}
