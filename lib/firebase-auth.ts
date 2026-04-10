/**
 * lib/firebase-auth.ts  (multi-tenant)
 * --------------------------------------
 * Replaces lib/auth.ts with Firebase Auth equivalents.
 *
 * Functions:
 *   signInWithEmail()        — email/password sign-in via tenant auth
 *   signInWithGoogle()       — Google OAuth via tenant auth
 *   signUpAndCreateTenant()  — creates new user + restaurant
 *   signOut()                — tenant-scoped sign out
 *   getSession()             — get current user
 *   checkIsAdmin()           — check admin_users in Firestore
 *   updateLastLogin()        — update last login timestamp
 */

import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    signInWithCustomToken,
    GoogleAuthProvider,
    signOut as firebaseSignOut,
    updateProfile,
    type User,
    type UserCredential,
} from 'firebase/auth';
import { tenantAuth, TENANT_SESSION_KEY } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { securityLog } from './logger';

export type { User };
export type Session = {
    user: User;
    access_token: string;
};

// ─── Sign in with Google OAuth ────────────────────────────────────────────────
export async function signInWithGoogle(): Promise<UserCredential> {
    if (typeof window === 'undefined') throw new Error('signInWithGoogle must be called client-side');

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    securityLog.info('AUTH_GOOGLE_START', { origin: window.location.origin });

    try {
        const result = await signInWithPopup(tenantAuth, provider);
        securityLog.info('AUTH_LOGIN_SUCCESS', { method: 'google', email: result.user.email, userId: result.user.uid });
        return result;
    } catch (error: any) {
        const errorCode = typeof error?.code === 'string' ? error.code : '';
        const isUserCancelled =
            errorCode === 'auth/popup-closed-by-user' ||
            errorCode === 'auth/cancelled-popup-request';

        if (isUserCancelled) {
            // User closed the OAuth popup intentionally; this is not a security failure.
            securityLog.warn('AUTH_LOGIN_FAILURE', {
                method: 'google',
                reason: 'user_cancelled',
                code: errorCode,
            });
        } else {
            securityLog.error('AUTH_LOGIN_FAILURE', {
                method: 'google',
                code: errorCode || 'unknown',
                message: error?.message,
            });
        }
        throw error;
    }
}

// ─── Sign in with Email + Password ───────────────────────────────────────────
export async function signInWithEmail(email: string, password: string): Promise<UserCredential> {
    const normalizedEmail = email.trim().toLowerCase();

    try {
        const result = await signInWithEmailAndPassword(tenantAuth, normalizedEmail, password);
        securityLog.info('AUTH_LOGIN_SUCCESS', { method: 'email', email: normalizedEmail, userId: result.user.uid });
        return result;
    } catch (error: any) {
        securityLog.warn('AUTH_LOGIN_FAILURE', {
            method: 'email',
            email: normalizedEmail,
            code: typeof error?.code === 'string' ? error.code : 'unknown',
            message: error?.message || 'Authentication failed',
        });
        throw error;
    }
}

// ─── Sign in with Custom Token ──────────────────────────────────────────────
export async function signInWithToken(token: string): Promise<UserCredential> {
    try {
        const result = await signInWithCustomToken(tenantAuth, token);
        securityLog.info('AUTH_LOGIN_SUCCESS', { method: 'custom_token', email: result.user.email, userId: result.user.uid });
        return result;
    } catch (error: any) {
        securityLog.error('AUTH_LOGIN_FAILURE', { method: 'custom_token', message: error.message });
        throw error;
    }
}

// ─── Sign up + Create new Tenant (Restaurant) ────────────────────────────────
/**
 * Creates a new Firebase Auth user AND a new restaurant (tenant), then links them.
 * The tenant creation is done via a server-side API route (POST /api/tenant/create)
 * so it can use the Admin SDK to set custom claims and create Firestore documents.
 */
export async function signUpAndCreateTenant(
    email: string,
    password: string,
    fullName: string,
    restaurantName: string,
    masterPin: string
): Promise<{ userId: string; tenantId: string }> {
    // Step 1: Create the auth user
    let userCredential: UserCredential;
    try {
        userCredential = await createUserWithEmailAndPassword(tenantAuth, email, password);
    } catch (error: any) {
        securityLog.warn('AUTH_SIGNUP_FAILURE', { email, message: error.message });
        if (error.code === 'auth/email-already-in-use') {
            throw new Error('User already registered. Please sign in instead, or use "Forgot Password" to reset your credentials.');
        }
        throw error;
    }

    // Update display name
    await updateProfile(userCredential.user, { displayName: fullName });
    securityLog.info('AUTH_SIGNUP', { email, userId: userCredential.user.uid });

    // Step 2: Create the tenant + link user via server-side API
    const idToken = await userCredential.user.getIdToken();
    const res = await fetch('/api/tenant/create', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
            userId: userCredential.user.uid,
            email,
            fullName,
            restaurantName,
            masterPin,
        }),
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Failed to create restaurant');

    securityLog.info('TENANT_CREATED', { userId: userCredential.user.uid, tenantId: result.tenantId });

    return { userId: userCredential.user.uid, tenantId: result.tenantId };
}

// ─── Sign up (original — for environments where tenant is pre-created) ────────
export async function signUpWithEmail(email: string, password: string, fullName: string): Promise<UserCredential> {
    try {
        const result = await createUserWithEmailAndPassword(tenantAuth, email, password);
        await updateProfile(result.user, { displayName: fullName });
        securityLog.info('AUTH_SIGNUP', { email, userId: result.user.uid });
        return result;
    } catch (error: any) {
        securityLog.warn('AUTH_LOGIN_FAILURE', { method: 'signup', email, message: error.message });
        throw error;
    }
}

// ─── Sign out (tenant only — does NOT touch admin session) ────────────────────
export async function signOut(): Promise<void> {
    try {
        await firebaseSignOut(tenantAuth);
        securityLog.info('AUTH_LOGOUT', { scope: 'tenant' });
    } catch (error: any) {
        securityLog.error('AUTH_LOGOUT', { message: error.message });
        throw error;
    }
}

// ─── Clear stale session (for auth errors) ───────────────────────────────────
export function clearStaleSession() {
    // Firebase handles its own session cleanup, but we can sign out if needed
    if (typeof window !== 'undefined' && tenantAuth.currentUser) {
        firebaseSignOut(tenantAuth).catch(() => { });
        securityLog.warn('AUTH_STALE_SESSION_CLEARED', { key: TENANT_SESSION_KEY });
    }
}

// ─── Get current session (client-side) ───────────────────────────────────────
export async function getSession(): Promise<Session | null> {
    const user = tenantAuth.currentUser;
    if (!user) return null;
    const token = await user.getIdToken();
    return { user, access_token: token };
}

// ─── Admin check (checks Firestore instead of Supabase table) ────────────────
export async function checkIsAdmin(user: User): Promise<boolean> {
    const email = user.email;
    if (!email) {
        securityLog.warn('AUTHZ_DENIED', { reason: 'no_email', userId: user.uid });
        return false;
    }

    try {
        // Check custom claims first (set by admin SDK)
        const tokenResult = await user.getIdTokenResult();
        if (tokenResult.claims.role === 'super_admin') {
            return true;
        }

        securityLog.info('AUTHZ_ADMIN_CHECK', { email, result: false });
        return false;
    } catch (err: any) {
        securityLog.error('AUTHZ_ADMIN_CHECK', { email, message: err.message });
        return false;
    }
}

// ─── Update last_login timestamp ─────────────────────────────────────────────
export async function updateLastLogin(email: string) {
    // This is now handled in the API route via admin SDK
    try {
        await fetch('/api/auth/update-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });
    } catch {
        // Non-critical, silently fail
    }
}
