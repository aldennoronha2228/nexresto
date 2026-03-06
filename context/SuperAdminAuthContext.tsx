'use client';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabaseSuperAdmin } from '@/lib/supabase';
import { securityLog } from '@/lib/logger';
import type { User, Session } from '@/lib/auth';

interface SuperAdminAuthState {
    session: Session | null;
    user: User | null;
    loading: boolean;
    error: string | null;
    userRole: string | null;
}

interface SuperAdminAuthContextValue extends SuperAdminAuthState {
    signOut: () => Promise<void>;
    clearError: () => void;
}

const SuperAdminAuthContext = createContext<SuperAdminAuthContextValue | null>(null);

export function SuperAdminAuthProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<SuperAdminAuthState>({
        session: null,
        user: null,
        loading: true,
        error: null,
        userRole: null,
    });

    useEffect(() => {
        let isActive = true;
        const { data: { subscription } } = supabaseSuperAdmin.auth.onAuthStateChange(async (event, session) => {
            if (!session?.user) {
                if (isActive) {
                    setState({ session: null, user: null, loading: false, error: null, userRole: null });
                }
                return;
            }
            // Fetch user role from user_profiles
            try {
                const { data, error } = await supabaseSuperAdmin.from('user_profiles').select('role').eq('id', session.user.id).maybeSingle();
                setState({
                    session,
                    user: session.user,
                    loading: false,
                    error: error ? error.message : null,
                    userRole: data?.role || null,
                });
            } catch (err: any) {
                setState(prev => ({ ...prev, loading: false, error: err.message }));
            }
        });
        return () => {
            isActive = false;
            subscription.unsubscribe();
        };
    }, []);

    const signOut = async () => {
        setState({ session: null, user: null, loading: false, error: null, userRole: null });
        await supabaseSuperAdmin.auth.signOut();
    };

    const clearError = () => setState(s => ({ ...s, error: null }));

    return (
        <SuperAdminAuthContext.Provider value={{ ...state, signOut, clearError }}>
            {children}
        </SuperAdminAuthContext.Provider>
    );
}

export function useSuperAdminAuth() {
    const ctx = useContext(SuperAdminAuthContext);
    if (!ctx) throw new Error('useSuperAdminAuth must be used within <SuperAdminAuthProvider>');
    return ctx;
}
