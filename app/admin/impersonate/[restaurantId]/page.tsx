'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { signInWithCustomToken } from 'firebase/auth';
import { adminAuth, tenantAuth } from '@/lib/firebase';

export default function ImpersonateOwnerPage() {
    const params = useParams<{ restaurantId: string }>();
    const router = useRouter();
    const restaurantId = useMemo(() => String(params?.restaurantId || '').trim(), [params]);

    const [status, setStatus] = useState<'loading' | 'error'>('loading');
    const [message, setMessage] = useState('Preparing secure owner access...');

    useEffect(() => {
        let cancelled = false;

        async function run() {
            if (!restaurantId) {
                setStatus('error');
                setMessage('Invalid hotel identifier.');
                return;
            }

            try {
                const adminUser = adminAuth.currentUser;
                if (!adminUser) {
                    throw new Error('Super admin session expired. Please sign in again.');
                }

                setMessage('Generating owner session...');
                const idToken = await adminUser.getIdToken(true);

                const res = await fetch('/api/admin/impersonate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${idToken}`,
                    },
                    body: JSON.stringify({ restaurantId }),
                });

                const payload = await res.json();
                if (!res.ok) {
                    throw new Error(payload?.error || 'Failed to impersonate owner account.');
                }

                const customToken = String(payload?.customToken || '');
                const redirectTo = String(payload?.redirectTo || `/${restaurantId}/dashboard/orders`);
                if (!customToken) {
                    throw new Error('Owner session token was not generated.');
                }

                setMessage('Signing into hotel owner account...');
                await signInWithCustomToken(tenantAuth, customToken);

                if (!cancelled) {
                    router.replace(redirectTo);
                }
            } catch (error: any) {
                if (!cancelled) {
                    setStatus('error');
                    setMessage(error?.message || 'Could not open owner dashboard.');
                }
            }
        }

        run();

        return () => {
            cancelled = true;
        };
    }, [restaurantId, router]);

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
            <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
                {status === 'loading' ? (
                    <>
                        <div className="mx-auto mb-4 h-10 w-10 rounded-full border-4 border-blue-500/30 border-t-blue-400 animate-spin" />
                        <h1 className="text-lg font-semibold text-white">Opening Hotel Dashboard</h1>
                        <p className="mt-2 text-sm text-slate-400">{message}</p>
                    </>
                ) : (
                    <>
                        <h1 className="text-lg font-semibold text-red-400">Impersonation Failed</h1>
                        <p className="mt-2 text-sm text-slate-300">{message}</p>
                        <button
                            onClick={() => router.replace('/super-admin/restaurants')}
                            className="mt-5 inline-flex items-center justify-center rounded-xl bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600"
                        >
                            Back to Restaurant Manager
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
