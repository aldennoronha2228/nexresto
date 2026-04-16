'use client';

/**
 * context/AuthContext.tsx  (Firebase multi-tenant)
 * -------------------------------------------------
 * Provides auth state for all /[storeId]/dashboard/* pages.
 * Uses Firebase Auth's onAuthStateChanged listener.
 *
 * After sign-in the context resolves:
 *   1. userRole  — via custom claims (owner, admin, staff, super_admin)
 *   2. tenantId  — via custom claims (restaurant_id)
 *   3. tenantName — via Firestore restaurant document
 */

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { tenantAuth, db } from '@/lib/firebase';
import { signOut as authSignOut } from '@/lib/firebase-auth';
import { securityLog } from '@/lib/logger';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

const SESSION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const TENANT_SESSION_EXPIRES_AT_KEY = 'nexresto-tenant-session-expires-at';
const TENANT_SESSION_UID_KEY = 'nexresto-tenant-session-uid';
const PASSWORD_CHANGE_BYPASS_KEY = 'nexresto-password-change-bypass';

type PasswordBypassState = {
    uid: string;
    expiresAt: number;
};

function readStoredMs(storageKey: string): number | null {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const ms = Number(raw);
    return Number.isFinite(ms) ? ms : null;
}

function writeTenantSessionWindow(userId: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(TENANT_SESSION_UID_KEY, userId);
    localStorage.setItem(TENANT_SESSION_EXPIRES_AT_KEY, String(Date.now() + SESSION_WINDOW_MS));
}

function clearTenantSessionWindow(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(TENANT_SESSION_UID_KEY);
    localStorage.removeItem(TENANT_SESSION_EXPIRES_AT_KEY);
}

function isTenantSessionExpired(userId: string): boolean {
    if (typeof window === 'undefined') return false;

    const storedUid = localStorage.getItem(TENANT_SESSION_UID_KEY);
    if (!storedUid || storedUid !== userId) {
        writeTenantSessionWindow(userId);
        return false;
    }

    const expiresAt = readStoredMs(TENANT_SESSION_EXPIRES_AT_KEY);
    if (!expiresAt) {
        writeTenantSessionWindow(userId);
        return false;
    }

    return Date.now() > expiresAt;
}

function readPasswordBypassState(): PasswordBypassState | null {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(PASSWORD_CHANGE_BYPASS_KEY);
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as PasswordBypassState;
        if (!parsed?.uid || !Number.isFinite(parsed?.expiresAt)) {
            localStorage.removeItem(PASSWORD_CHANGE_BYPASS_KEY);
            return null;
        }
        return parsed;
    } catch {
        localStorage.removeItem(PASSWORD_CHANGE_BYPASS_KEY);
        return null;
    }
}

function clearPasswordBypassState(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(PASSWORD_CHANGE_BYPASS_KEY);
}

function applyPasswordChangeBypass(userId: string, mustChangePassword: boolean): boolean {
    if (!mustChangePassword) {
        const bypass = readPasswordBypassState();
        if (bypass?.uid === userId) {
            clearPasswordBypassState();
        }
        return false;
    }

    const bypass = readPasswordBypassState();
    if (!bypass || bypass.uid !== userId) {
        return true;
    }

    if (Date.now() > bypass.expiresAt) {
        clearPasswordBypassState();
        return true;
    }

    return false;
}

function isRecentSignIn(user: User, windowMs: number = 2 * 60 * 1000): boolean {
    const raw = user.metadata?.lastSignInTime || '';
    const signedInAtMs = Date.parse(raw);
    if (!Number.isFinite(signedInAtMs)) return false;
    return Date.now() - signedInAtMs <= windowMs;
}

type SubscriptionTier = 'starter' | 'pro' | '1k' | '2k' | '2.5k';
type SubscriptionStatus = 'active' | 'past_due' | 'cancelled' | 'trial' | 'expired';

function normalizeYmd(value: unknown): string | null {
    const raw = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function daysUntilYmd(endDateYmd: string): number {
    const endDate = new Date(`${endDateYmd}T00:00:00Z`);
    const todayYmd = new Date().toISOString().slice(0, 10);
    const today = new Date(`${todayYmd}T00:00:00Z`);
    return Math.round((endDate.getTime() - today.getTime()) / 86400000);
}

function isAuthNetworkError(err: unknown): boolean {
    const code = (err as { code?: unknown } | null)?.code;
    return typeof code === 'string' && code === 'auth/network-request-failed';
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getIdTokenWithRetry(user: User): Promise<string> {
    try {
        return await user.getIdToken();
    } catch (err) {
        if (!isAuthNetworkError(err)) throw err;
        await sleep(350);
        return user.getIdToken();
    }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthState {
    session: { user: User; access_token: string } | null;
    user: User | null;
    isAdmin: boolean;
    userRole: string | null;
    tenantId: string | null;
    tenantName: string | null;
    subscriptionTier: SubscriptionTier | null;
    subscriptionStatus: SubscriptionStatus | null;
    subscriptionEndDate: string | null;
    subscriptionDaysRemaining: number | null;
    isImpersonating: boolean;
    mustChangePassword: boolean;
    loading: boolean;
    tenantLoading: boolean;
    error: string | null;
}

interface AuthContextValue extends AuthState {
    signOut: () => Promise<void>;
    clearError: () => void;
    refreshTenant: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchUserProfile(user: User): Promise<{
    tenant_id: string;
    tenant_name: string;
    role: string;
    must_change_password: boolean;
    subscription_tier: SubscriptionTier;
    subscription_status: SubscriptionStatus;
    subscription_end_date?: string | null;
    subscription_days_remaining?: number | null;
    is_impersonating?: boolean;
} | null> {
    try {
        // [MOD] Force refresh to ensure we have the latest custom claims (e.g. after a reset script)
        const tokenResult = await user.getIdTokenResult(true);
        const claims = tokenResult.claims;

        const role = (claims.role as string) || null;
        const tenantId = (claims.restaurant_id as string) || null;
        const mustChangePassword = Boolean(claims.must_change_password);
        const isImpersonating = Boolean(claims.impersonated_by_super_admin);

        // If it's a super_admin, we don't need a restaurant_id or API fallback
        if (role === 'super_admin') {
            return {
                tenant_id: '',
                tenant_name: 'Platform Admin',
                role: 'super_admin',
                must_change_password: false,
                subscription_tier: 'pro',
                subscription_status: 'active',
                subscription_end_date: null,
                subscription_days_remaining: null,
                is_impersonating: false,
            };
        }

        if (!role || !tenantId) {
            // Fallback: try fetching profile from API
            const idToken = await user.getIdToken();
            const res = await fetch('/api/auth/profile', {
                headers: { Authorization: `Bearer ${idToken}` },
            });

            if (!res.ok) return null;
            const { profile } = await res.json();
            if (!profile) return null;

            // Profile fallback may set custom claims server-side.
            // Force refresh so subsequent Firestore reads carry latest claims.
            await user.getIdToken(true).catch(() => { });

            return {
                tenant_id: profile.tenant_id || '',
                tenant_name: profile.tenant_name || 'Platform',
                role: profile.role,
                must_change_password: Boolean(profile.must_change_password),
                subscription_tier: profile.subscription_tier || 'starter',
                subscription_status: profile.subscription_status || 'active',
                subscription_end_date: profile.subscription_end_date || null,
                subscription_days_remaining: typeof profile.subscription_days_remaining === 'number'
                    ? profile.subscription_days_remaining
                    : (profile.subscription_end_date ? daysUntilYmd(profile.subscription_end_date) : null),
                is_impersonating: Boolean(profile.is_impersonating),
            };
        }

        // Get restaurant name from Firestore
        let tenantName = tenantId;
        try {
            const restDoc = await getDoc(doc(db, 'restaurants', tenantId));
            if (restDoc.exists()) {
                tenantName = restDoc.data().name || tenantId;
            }
        } catch {
            // Non-critical
        }

        // Get subscription info
        let subscriptionTier: SubscriptionTier = 'starter';
        let subscriptionStatus: SubscriptionStatus = 'active';
        let subscriptionEndDate: string | null = null;
        let subscriptionDaysRemaining: number | null = null;
        try {
            const restDoc = await getDoc(doc(db, 'restaurants', tenantId));
            if (restDoc.exists()) {
                const data = restDoc.data();
                subscriptionTier = data.subscription_tier || 'starter';
                subscriptionStatus = data.subscription_status || 'active';
                subscriptionEndDate = normalizeYmd(data.subscription_end_date) || null;
                subscriptionDaysRemaining = subscriptionEndDate ? daysUntilYmd(subscriptionEndDate) : null;
            }
        } catch {
            // Non-critical
        }

        return {
            tenant_id: tenantId,
            tenant_name: tenantName,
            role,
            must_change_password: mustChangePassword,
            subscription_tier: subscriptionTier,
            subscription_status: subscriptionStatus,
            subscription_end_date: subscriptionEndDate,
            subscription_days_remaining: subscriptionDaysRemaining,
            is_impersonating: isImpersonating,
        };
    } catch (err: any) {
        securityLog.error('TENANT_FETCH', { userId: user.uid, message: err.message });
        return null;
    }
}

async function fetchUserProfileFromApi(user: User): Promise<{
    tenant_id: string;
    tenant_name: string;
    role: string;
    must_change_password: boolean;
    subscription_tier: SubscriptionTier;
    subscription_status: SubscriptionStatus;
    subscription_end_date?: string | null;
    subscription_days_remaining?: number | null;
    is_impersonating?: boolean;
} | null> {
    try {
        const idToken = await user.getIdToken(true);
        const res = await fetch('/api/auth/profile', {
            headers: { Authorization: `Bearer ${idToken}` },
            cache: 'no-store',
        });

        if (!res.ok) return null;

        const payload = await res.json();
        const profile = payload?.profile;
        if (!profile) return null;

        return {
            tenant_id: profile.tenant_id || '',
            tenant_name: profile.tenant_name || profile.tenant_id || '',
            role: profile.role || '',
            must_change_password: Boolean(profile.must_change_password),
            subscription_tier: (profile.subscription_tier || 'starter') as SubscriptionTier,
            subscription_status: (profile.subscription_status || 'active') as SubscriptionStatus,
            subscription_end_date: profile.subscription_end_date || null,
            subscription_days_remaining: typeof profile.subscription_days_remaining === 'number'
                ? profile.subscription_days_remaining
                : (profile.subscription_end_date ? daysUntilYmd(profile.subscription_end_date) : null),
            is_impersonating: Boolean(profile.is_impersonating),
        };
    } catch {
        return null;
    }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<AuthState>({
        session: null,
        user: null,
        isAdmin: false,
        userRole: null,
        tenantId: null,
        tenantName: null,
        subscriptionTier: null,
        subscriptionStatus: null,
        subscriptionEndDate: null,
        subscriptionDaysRemaining: null,
        isImpersonating: false,
        mustChangePassword: false,
        loading: true,
        tenantLoading: false,
        error: null,
    });

    const hasInitialized = useRef(false);
    const hasTenantRef = useRef(false);
    const resolvedUidRef = useRef<string | null>(null);
    const tenantSyncUnsubRef = useRef<(() => void) | null>(null);

    // Refresh tenant info on demand (e.g. after signup completes)
    const refreshTenant = async () => {
        const user = state.user;
        if (!user) return;
        setState(prev => ({ ...prev, tenantLoading: true }));
        const profile = await fetchUserProfileFromApi(user) || await fetchUserProfile(user);
        setState(prev => ({
            ...prev,
            userRole: profile?.role ?? prev.userRole,
            tenantId: profile?.tenant_id ?? null,
            tenantName: profile?.tenant_name ?? null,
            subscriptionTier: profile?.subscription_tier ?? prev.subscriptionTier,
            subscriptionStatus: profile?.subscription_status ?? prev.subscriptionStatus,
            subscriptionEndDate: profile?.subscription_end_date ?? prev.subscriptionEndDate,
            subscriptionDaysRemaining: typeof profile?.subscription_days_remaining === 'number'
                ? profile.subscription_days_remaining
                : prev.subscriptionDaysRemaining,
            isImpersonating: Boolean(profile?.is_impersonating),
            mustChangePassword: profile
                ? applyPasswordChangeBypass(user.uid, Boolean(profile.must_change_password))
                : prev.mustChangePassword,
            tenantLoading: false,
        }));
    };

    useEffect(() => {
        let isActive = true;

        // Safety release for tenantLoading - if it hangs for 5s, release it  
        const tenantSafetyTimer = setTimeout(() => {
            if (isActive) {
                setState(prev => {
                    if (prev.tenantLoading) {
                        console.warn('[AuthContext] Tenant loading safety release.');
                        return { ...prev, tenantLoading: false };
                    }
                    return prev;
                });
            }
        }, 5000);

        // Firebase's onAuthStateChanged replaces Supabase's onAuthStateChange
        const unsubscribe = onAuthStateChanged(tenantAuth, async (user) => {
            try {
                console.log(`[AuthContext] Firebase auth state changed: ${user ? 'signed in' : 'signed out'}`);

                if (!user) {
                    clearTenantSessionWindow();
                    if (isActive) {
                        hasTenantRef.current = false;
                        resolvedUidRef.current = null;
                        setState({
                            session: null,
                            user: null,
                            isAdmin: false,
                            userRole: null,
                            tenantId: null,
                            tenantName: null,
                            subscriptionTier: null,
                            subscriptionStatus: null,
                            subscriptionEndDate: null,
                            subscriptionDaysRemaining: null,
                            isImpersonating: false,
                            mustChangePassword: false,
                            loading: false,
                            tenantLoading: false,
                            error: null,
                        });
                        hasInitialized.current = true;
                    }
                    return;
                }

                if (isRecentSignIn(user)) {
                    writeTenantSessionWindow(user.uid);
                }

                if (isTenantSessionExpired(user.uid)) {
                    clearTenantSessionWindow();
                    await authSignOut();
                    if (isActive) {
                        setState({
                            session: null,
                            user: null,
                            isAdmin: false,
                            userRole: null,
                            tenantId: null,
                            tenantName: null,
                            subscriptionTier: null,
                            subscriptionStatus: null,
                            subscriptionEndDate: null,
                            subscriptionDaysRemaining: null,
                            isImpersonating: false,
                            mustChangePassword: false,
                            loading: false,
                            tenantLoading: false,
                            error: null,
                        });
                    }
                    return;
                }

                let idToken = '';
                try {
                    idToken = await getIdTokenWithRetry(user);
                } catch (err) {
                    if (!isAuthNetworkError(err)) throw err;
                    console.warn('[AuthContext] Token fetch failed due to network; continuing with reduced session token.');
                }

                const isSameResolvedUser = resolvedUidRef.current === user.uid;

                // Progressive load — set session, but keep loading true if we need profile
                if (isActive) {
                    setState(prev => ({
                        ...prev,
                        session: idToken
                            ? { user, access_token: idToken }
                            : (prev.session?.user?.uid === user.uid ? prev.session : { user, access_token: '' }),
                        user,
                        loading: hasTenantRef.current && isSameResolvedUser ? false : true,
                        tenantLoading: hasTenantRef.current && isSameResolvedUser ? false : true,
                        userRole: isSameResolvedUser ? prev.userRole : null,
                        tenantId: isSameResolvedUser ? prev.tenantId : null,
                        tenantName: isSameResolvedUser ? prev.tenantName : null,
                        subscriptionTier: isSameResolvedUser ? prev.subscriptionTier : null,
                        subscriptionStatus: isSameResolvedUser ? prev.subscriptionStatus : null,
                        subscriptionEndDate: isSameResolvedUser ? prev.subscriptionEndDate : null,
                        subscriptionDaysRemaining: isSameResolvedUser ? prev.subscriptionDaysRemaining : null,
                        isImpersonating: isSameResolvedUser ? prev.isImpersonating : false,
                        mustChangePassword: isSameResolvedUser ? prev.mustChangePassword : false,
                        error: null,
                    }));
                    hasInitialized.current = true;
                }

                // Skip re-fetching tenant if we already have it
                if (hasTenantRef.current && isSameResolvedUser) {
                    console.log('[AuthContext] Skipping profile re-fetch - tenant data exists');
                    const freshTokenResult = await user.getIdTokenResult(true).catch(() => null);
                    const freshMustChangePassword = typeof freshTokenResult?.claims?.must_change_password === 'boolean'
                        ? Boolean(freshTokenResult.claims.must_change_password)
                        : undefined;

                    setState(prev => ({
                        ...prev,
                        mustChangePassword: typeof freshMustChangePassword === 'boolean'
                            ? applyPasswordChangeBypass(user.uid, freshMustChangePassword)
                            : prev.mustChangePassword,
                        loading: false,
                        tenantLoading: false,
                    }));
                    return;
                }

                if (!isActive) return;

                // Resolve admin + tenant
                const profile = await fetchUserProfile(user);
                const tokenResult = await user.getIdTokenResult();
                const isAdmin = tokenResult.claims.role === 'super_admin';

                if (isActive) {
                    if (profile?.tenant_id || profile?.role) {
                        hasTenantRef.current = true;
                    }
                    resolvedUidRef.current = user.uid;

                    setState(prev => ({
                        ...prev,
                        isAdmin,
                        userRole: profile?.role ?? null,
                        tenantId: profile?.tenant_id ?? null,
                        tenantName: profile?.tenant_name ?? null,
                        subscriptionTier: profile?.subscription_tier ?? null,
                        subscriptionStatus: profile?.subscription_status ?? null,
                        subscriptionEndDate: profile?.subscription_end_date ?? null,
                        subscriptionDaysRemaining: typeof profile?.subscription_days_remaining === 'number'
                            ? profile.subscription_days_remaining
                            : null,
                        isImpersonating: Boolean(profile?.is_impersonating),
                        mustChangePassword: applyPasswordChangeBypass(user.uid, Boolean(profile?.must_change_password)),
                        loading: false, // Release loading now
                        tenantLoading: false,
                    }));

                    securityLog.info('AUTH_TENANT_RESOLVED', {
                        userId: user.uid,
                        tenantId: profile?.tenant_id,
                        isAdmin,
                    });
                }
            } catch (err: any) {
                console.error('[AuthContext] Auth state handler error:', err);
                if (isActive) {
                    setState(prev => ({ ...prev, loading: false, tenantLoading: false }));
                }
            }
        });

        return () => {
            isActive = false;
            unsubscribe();
            clearTimeout(tenantSafetyTimer);
        };
    }, []);

    const signOut = async () => {
        clearTenantSessionWindow();
        hasTenantRef.current = false;
        resolvedUidRef.current = null;
        setState({
            session: null, user: null, isAdmin: false, userRole: null,
            tenantId: null, tenantName: null, subscriptionTier: null, subscriptionStatus: null,
            subscriptionEndDate: null, subscriptionDaysRemaining: null,
            isImpersonating: false,
            mustChangePassword: false,
            loading: false, tenantLoading: false, error: null,
        });
        await authSignOut();
    };

    const clearError = () => setState(s => ({ ...s, error: null }));

    // Keep tenant fields in sync with live restaurant doc changes
    // (e.g. super-admin tier/status updates while owner is logged in).
    useEffect(() => {
        if (tenantSyncUnsubRef.current) {
            tenantSyncUnsubRef.current();
            tenantSyncUnsubRef.current = null;
        }

        if (!state.tenantId || state.userRole === 'super_admin') {
            return;
        }

        const restRef = doc(db, 'restaurants', state.tenantId);
        tenantSyncUnsubRef.current = onSnapshot(restRef, (snap) => {
            if (!snap.exists()) {
                return;
            }

            const data = snap.data() as Record<string, unknown>;
            const nextTier = (data.subscription_tier as SubscriptionTier | undefined) || 'starter';
            const nextStatus = (data.subscription_status as SubscriptionStatus | undefined) || 'active';
            const nextName = (data.name as string | undefined) || state.tenantId;
            const nextEndDate = normalizeYmd(data.subscription_end_date) || null;
            const nextDaysRemaining = nextEndDate ? daysUntilYmd(nextEndDate) : null;

            setState(prev => ({
                ...prev,
                tenantName: nextName,
                subscriptionTier: nextTier,
                subscriptionStatus: nextStatus,
                subscriptionEndDate: nextEndDate,
                subscriptionDaysRemaining: nextDaysRemaining,
            }));
        }, () => {
            // Silent by design: baseline auth state still works without live sync.
        });

        return () => {
            if (tenantSyncUnsubRef.current) {
                tenantSyncUnsubRef.current();
                tenantSyncUnsubRef.current = null;
            }
        };
    }, [state.tenantId, state.userRole]);

    // Secondary sync channel: poll profile endpoint so tier/status updates
    // propagate even if client Firestore listeners are blocked by rules.
    useEffect(() => {
        if (!state.user || state.userRole === 'super_admin') {
            return;
        }

        let cancelled = false;

        const syncFromApi = async () => {
            const profile = await fetchUserProfileFromApi(state.user!);
            if (!profile || cancelled) return;

            setState(prev => ({
                ...prev,
                userRole: profile.role || prev.userRole,
                tenantId: profile.tenant_id || prev.tenantId,
                tenantName: profile.tenant_name || prev.tenantName,
                mustChangePassword: applyPasswordChangeBypass(state.user!.uid, Boolean(profile.must_change_password)),
                subscriptionTier: profile.subscription_tier || prev.subscriptionTier,
                subscriptionStatus: profile.subscription_status || prev.subscriptionStatus,
                subscriptionEndDate: profile.subscription_end_date || prev.subscriptionEndDate,
                subscriptionDaysRemaining: typeof profile.subscription_days_remaining === 'number'
                    ? profile.subscription_days_remaining
                    : prev.subscriptionDaysRemaining,
                isImpersonating: Boolean(profile.is_impersonating),
            }));
        };

        const onVisibilityOrFocus = () => {
            if (document.visibilityState === 'visible') {
                syncFromApi().catch(() => { });
            }
        };

        syncFromApi().catch(() => { });
        const interval = setInterval(() => {
            syncFromApi().catch(() => { });
        }, 15000);

        window.addEventListener('focus', onVisibilityOrFocus);
        document.addEventListener('visibilitychange', onVisibilityOrFocus);

        return () => {
            cancelled = true;
            clearInterval(interval);
            window.removeEventListener('focus', onVisibilityOrFocus);
            document.removeEventListener('visibilitychange', onVisibilityOrFocus);
        };
    }, [state.user, state.userRole]);

    return (
        <AuthContext.Provider value={{ ...state, signOut, clearError, refreshTenant }}>
            {children}
        </AuthContext.Provider>
    );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
    return ctx;
}
