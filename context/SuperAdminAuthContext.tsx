'use client';

/**
 * context/SuperAdminAuthContext.tsx
 * ──────────────────────────────────
 * Provides auth state for all /super-admin/* pages.
 *
 * Uses the SEPARATE `supabaseSuperAdmin` client which reads from
 * `hotelpro-admin-session` in localStorage.  This client is seeded
 * by the login page after confirming role === 'super_admin' via
 * supabaseSuperAdmin.auth.setSession().
 *
 * Isolation guarantee:
 *   signOut() here calls supabaseSuperAdmin.auth.signOut({ scope: 'local' })
 *   which removes only `hotelpro-admin-session` from localStorage.
 *   The tenant client's `hotelpro-tenant-session` in sessionStorage is
 *   NEVER touched, so any hotel owner logged in another tab is unaffected.
 */

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabaseSuperAdmin, ADMIN_SESSION_KEY } from '@/lib/supabase';
import { securityLog } from '@/lib/logger';
import type { User, Session } from '@/lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SuperAdminAuthState {
    session: Session | null;
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
    const pendingAuthRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        let isActive = true;

        // Safety release: unblock after 3s in case auth hangs
        const safetyTimer = setTimeout(() => {
            if (isActive && !hasInitialized.current) {
                console.warn('[SuperAdminAuth] Safety release triggered');
                setState(prev => ({ ...prev, loading: false }));
                hasInitialized.current = true;
            }
        }, 3000);

        const { data: { subscription } } = supabaseSuperAdmin.auth.onAuthStateChange(
            async (event, session) => {
                console.log(`[SuperAdminAuth] event: ${event}`);

                if (!session?.user) {
                    if (isActive) {
                        hasRoleRef.current = false;
                        setState({
                            session: null, user: null,
                            loading: false, roleLoading: false,
                            error: null, userRole: null,
                        });
                        hasInitialized.current = true;
                        clearTimeout(safetyTimer);
                    }
                    return;
                }

                // Set session immediately so layout can render
                if (isActive) {
                    setState(prev => ({
                        ...prev,
                        session,
                        user: session.user,
                        loading: false,
                        roleLoading: hasRoleRef.current ? false : true,
                        error: null,
                    }));
                    hasInitialized.current = true;
                    clearTimeout(safetyTimer);
                }

                // Skip re-fetching role if we already have it and this is just a session refresh (e.g., from tab focus)
                if (hasRoleRef.current && event !== 'SIGNED_IN') {
                    console.log('[SuperAdminAuth] Skipping profile re-fetch - role data exists');
                    setState(prev => ({ ...prev, roleLoading: false }));
                    return;
                }

                // Debounce rapid auth events
                if (pendingAuthRef.current) {
                    clearTimeout(pendingAuthRef.current);
                }

                await new Promise<void>(resolve => {
                    pendingAuthRef.current = setTimeout(resolve, 100);
                });

                if (!isActive) return;

                // Fetch profile via API (which handles admin_users & user_profiles correctly)
                // Super admins are in the admin_users table, which the API safely checks first.
                try {
                    const res = await fetch('/api/auth/profile', {
                        headers: { Authorization: `Bearer ${session.access_token}` },
                    });

                    if (!res.ok) throw new Error('Failed to fetch profile');

                    const { profile } = await res.json();

                    if (isActive) {
                        if (profile?.role) {
                            hasRoleRef.current = true;
                        }

                        setState(prev => ({
                            ...prev,
                            roleLoading: false,
                            userRole: profile?.role ?? null,
                            error: null,
                        }));

                        securityLog.info('SUPER_ADMIN_AUTH_RESOLVED', {
                            userId: session.user.id,
                            role: profile?.role,
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
            }
        );

        return () => {
            isActive = false;
            subscription.unsubscribe();
            clearTimeout(safetyTimer);
        };
    }, []);

    /**
     * signOut — clears ONLY the admin session (hotelpro-admin-session in localStorage).
     * Does NOT affect the tenant session (hotelpro-tenant-session in sessionStorage).
     * A hotel-owner logged into a restaurant dashboard in another tab is unaffected.
     */
    const signOut = async () => {
        setState({
            session: null, user: null,
            loading: false, roleLoading: false,
            error: null, userRole: null,
        });
        // scope: 'local' = sign out only this client's session, not server-wide
        await supabaseSuperAdmin.auth.signOut({ scope: 'local' });
        // Belt-and-suspenders: manually clear the key
        if (typeof window !== 'undefined') {
            window.localStorage.removeItem(ADMIN_SESSION_KEY);
        }
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
