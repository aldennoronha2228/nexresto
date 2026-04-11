'use client';

/**
 * context/SuperAdminAuthContext.tsx  (Firebase)
 * ──────────────────────────────────────────────
 * Provides auth state for all /super-admin/* pages.
 *
 * Uses the SEPARATE `adminAuth` from a named Firebase App instance ('admin').
 * This Auth instance has its own IndexedDB persistence namespace, completely
 * isolated from the tenant auth.
 *
 * Isolation guarantee:
 *   signOut(adminAuth)  → clears admin session only
 *   signOut(tenantAuth) → clears tenant session only
 *   The two are 100% independent because they use different Firebase App instances.
 */

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut, type User } from 'firebase/auth';
import { adminAuth, ADMIN_SESSION_KEY } from '@/lib/firebase';
import { securityLog } from '@/lib/logger';

const SESSION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const SUPER_ADMIN_SESSION_EXPIRES_AT_KEY = 'nexresto-super-admin-session-expires-at';
const SUPER_ADMIN_SESSION_UID_KEY = 'nexresto-super-admin-session-uid';

function readStoredMs(storageKey: string): number | null {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const ms = Number(raw);
    return Number.isFinite(ms) ? ms : null;
}

function writeSuperAdminSessionWindow(userId: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(SUPER_ADMIN_SESSION_UID_KEY, userId);
    localStorage.setItem(SUPER_ADMIN_SESSION_EXPIRES_AT_KEY, String(Date.now() + SESSION_WINDOW_MS));
}

function clearSuperAdminSessionWindow(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(SUPER_ADMIN_SESSION_UID_KEY);
    localStorage.removeItem(SUPER_ADMIN_SESSION_EXPIRES_AT_KEY);
}

function isSuperAdminSessionExpired(userId: string): boolean {
    if (typeof window === 'undefined') return false;

    const storedUid = localStorage.getItem(SUPER_ADMIN_SESSION_UID_KEY);
    if (!storedUid || storedUid !== userId) {
        writeSuperAdminSessionWindow(userId);
        return false;
    }

    const expiresAt = readStoredMs(SUPER_ADMIN_SESSION_EXPIRES_AT_KEY);
    if (!expiresAt) {
        writeSuperAdminSessionWindow(userId);
        return false;
    }

    return Date.now() > expiresAt;
}

function isRecentSignIn(user: User, windowMs: number = 2 * 60 * 1000): boolean {
    const raw = user.metadata?.lastSignInTime || '';
    const signedInAtMs = Date.parse(raw);
    if (!Number.isFinite(signedInAtMs)) return false;
    return Date.now() - signedInAtMs <= windowMs;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SuperAdminAuthState {
    session: { user: User; access_token: string } | null;
    user: User | null;
    loading: boolean;
    roleLoading: boolean;
    error: string | null;
    userRole: string | null;
}

interface SuperAdminAuthContextValue extends SuperAdminAuthState {
    signOut: () => Promise<void>;
    clearError: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const SuperAdminAuthContext = createContext<SuperAdminAuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SuperAdminAuthProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<SuperAdminAuthState>({
        session: null,
        user: null,
        loading: true,
        roleLoading: false,
        error: null,
        userRole: null,
    });

    const hasInitialized = useRef(false);
    const hasRoleRef = useRef(false);

    useEffect(() => {
        let isActive = true;

        // ── Pick up token left by login page ──────────────────────────────────
        // The login flow stores the custom token in sessionStorage to avoid a
        // blocking await. We consume it here immediately on mount.
        const pendingToken = typeof window !== 'undefined'
            ? sessionStorage.getItem('pending_admin_token')
            : null;

        if (pendingToken) {
            sessionStorage.removeItem('pending_admin_token');
            import('firebase/auth').then(({ signInWithCustomToken }) => {
                signInWithCustomToken(adminAuth, pendingToken).catch(err => {
                    console.warn('[SuperAdminAuth] Could not use pending token:', err);
                });
            });
        }

        const unsubscribe = onAuthStateChanged(adminAuth, async (user) => {
            console.log(`[SuperAdminAuth] Firebase auth state changed: ${user ? 'signed in' : 'signed out'}`);

            if (!user) {
                clearSuperAdminSessionWindow();
                if (isActive) {
                    hasRoleRef.current = false;
                    setState({
                        session: null, user: null,
                        loading: false, roleLoading: false,
                        error: null, userRole: null,
                    });
                    hasInitialized.current = true;
                }
                return;
            }

            if (isRecentSignIn(user)) {
                writeSuperAdminSessionWindow(user.uid);
            }

            if (isSuperAdminSessionExpired(user.uid)) {
                clearSuperAdminSessionWindow();
                await firebaseSignOut(adminAuth);
                if (isActive) {
                    hasRoleRef.current = false;
                    setState({
                        session: null,
                        user: null,
                        loading: false,
                        roleLoading: false,
                        error: null,
                        userRole: null,
                    });
                }
                return;
            }

            const idToken = await user.getIdToken();

            // Set session, but keep loading:true if we need to fetch role
            if (isActive) {
                setState(prev => ({
                    ...prev,
                    session: { user, access_token: idToken },
                    user,
                    // Don't release loading until we at least try to get the role
                    // unless we already have it.
                    loading: hasRoleRef.current ? false : true,
                    roleLoading: hasRoleRef.current ? false : true,
                    error: null,
                }));
                hasInitialized.current = true;
            }

            // Skip re-fetching role if we already have it
            if (hasRoleRef.current) {
                console.log('[SuperAdminAuth] Skipping profile re-fetch - role data exists');
                setState(prev => ({ ...prev, roleLoading: false }));
                return;
            }

            if (!isActive) return;

            // Check custom claims for super_admin role
            try {
                const tokenResult = await user.getIdTokenResult();
                const role = (tokenResult.claims.role as string) || null;

                // Also check via API as fallback
                let resolvedRole = role;
                if (!resolvedRole) {
                    try {
                        const res = await fetch('/api/auth/profile', {
                            headers: { Authorization: `Bearer ${idToken}` },
                        });
                        if (res.ok) {
                            const { profile } = await res.json();
                            resolvedRole = profile?.role || null;

                            // Profile endpoint can assign missing custom claims.
                            // Refresh token to make those claims available immediately.
                            if (resolvedRole) {
                                await user.getIdToken(true).catch(() => { });
                            }
                        }
                    } catch {
                        // Fallback failed, use claims
                    }
                }

                if (isActive) {
                    if (resolvedRole) {
                        hasRoleRef.current = true;
                    }
                    setState(prev => ({
                        ...prev,
                        loading: false, // Release loading now that role is resolved
                        roleLoading: false,
                        userRole: resolvedRole,
                        error: null,
                    }));
                    securityLog.info('SUPER_ADMIN_AUTH_RESOLVED', {
                        userId: user.uid,
                        role: resolvedRole,
                    });
                }
            } catch (err: any) {
                if (isActive) {
                    setState(prev => ({
                        ...prev,
                        roleLoading: false,
                        error: err.message,
                    }));
                }
            }
        });

        return () => {
            isActive = false;
            unsubscribe();
        };
    }, []);

    /**
     * signOut — clears ONLY the admin session.
     * Does NOT affect the tenant session (different Firebase App instance).
     */
    const signOut = async () => {
        clearSuperAdminSessionWindow();
        setState({
            session: null, user: null,
            loading: false, roleLoading: false,
            error: null, userRole: null,
        });
        await firebaseSignOut(adminAuth);
        securityLog.info('SUPER_ADMIN_SIGN_OUT', { scope: 'admin' });
    };

    const clearError = () => setState(s => ({ ...s, error: null }));

    return (
        <SuperAdminAuthContext.Provider value={{ ...state, signOut, clearError }}>
            {children}
        </SuperAdminAuthContext.Provider>
    );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSuperAdminAuth() {
    const ctx = useContext(SuperAdminAuthContext);
    if (!ctx) throw new Error('useSuperAdminAuth must be used within <SuperAdminAuthProvider>');
    return ctx;
}
