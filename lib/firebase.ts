/**
 * lib/firebase.ts  (dual-app, isolated sessions)
 * -------------------------------------------------
 * Two completely independent Firebase App instances with separate Auth states
 * so the Super-Admin session and the Tenant session can NEVER overwrite
 * each other in the browser.
 *
 * App Instances
 * ──────────────
 *  App Name          Persistence        Purpose
 *  ────────────────────────────────────────────────────────────
 *  [DEFAULT]         localStorage       Tenant dashboard (/[slug]/dashboard)
 *  admin             localStorage       Super-Admin (/super-admin)
 *
 * Why two separate Firebase App instances?
 *   Each Firebase App has its OWN Auth instance with its OWN persistence
 *   storage. Firebase uses indexed DB keys namespaced by app name, meaning
 *   logging into Restaurant B in Tab 2 does NOT affect Restaurant A in Tab 1
 *   (if they share the same app instance but the auth state is per-user).
 *
 *   More importantly, the Super-Admin and Tenant sessions are on DIFFERENT
 *   app instances, so they are 100% isolated. Signing out of one does NOT
 *   affect the other.
 *
 * Sign-out isolation
 * ──────────────────
 *   signOut(tenantAuth)       → clears tenant session only
 *   signOut(adminAuth)        → clears admin session only
 *   The two are 100% independent.
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
    getAuth,
    setPersistence,
    browserLocalPersistence,
    type Auth,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

// ─── Firebase Config ──────────────────────────────────────────────────────────
const rawApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '';
const rawProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '';
const rawAppId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '';

const hasRequiredPublicConfig = Boolean(rawApiKey && rawProjectId && rawAppId);

// Build-safe fallbacks: keep values non-empty so static prerender/type-check
// does not crash when env vars are missing in CI/local shells.
const firebaseProjectId = rawProjectId || 'nexresto-local';
const firebaseAuthDomain =
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || `${firebaseProjectId}.firebaseapp.com`;

const firebaseConfig = {
    apiKey: rawApiKey || 'nexresto-local-api-key',
    authDomain: firebaseAuthDomain,
    projectId: firebaseProjectId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? `${firebaseProjectId}.appspot.com`,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '000000000000',
    appId: rawAppId || '1:000000000000:web:nexrestolocal',
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? '',
};

if (!hasRequiredPublicConfig && typeof window === 'undefined') {
    console.warn('[Firebase] Missing NEXT_PUBLIC_FIREBASE_* vars; using build-safe fallback config.');
}

/** Storage key constants — single source of truth */
export const TENANT_SESSION_KEY = 'nexresto-tenant-session';
export const ADMIN_SESSION_KEY = 'nexresto-admin-session';

// ─── App Initialization ──────────────────────────────────────────────────────

/**
 * Get or initialize the Tenant Firebase App (default app).
 * Used for all /[storeId]/dashboard/* pages and customer-facing pages.
 */
function getTenantApp(): FirebaseApp {
    const existing = getApps().find(app => app.name === '[DEFAULT]');
    if (existing) return existing;
    const app = initializeApp(firebaseConfig);
    console.log('[Firebase] Tenant App Initialized');
    return app;
}

/**
 * Get or initialize the Admin Firebase App (named 'admin').
 * Used exclusively for /super-admin/* pages.
 * Completely separate auth state from the tenant app.
 */
function getAdminApp(): FirebaseApp {
    try {
        return getApp('admin');
    } catch {
        const app = initializeApp(firebaseConfig, 'admin');
        console.log('[Firebase] Admin App Initialized');
        return app;
    }
}

// ─── Tenant Auth & Firestore ──────────────────────────────────────────────────
// Scope: all /[storeId]/dashboard/* pages and /customer/* pages.
// The default Firebase app — tenant session.

const tenantApp = getTenantApp();
export const db: Firestore = getFirestore(tenantApp);
export const tenantAuth: Auth = getAuth(tenantApp);
export const storage: FirebaseStorage = getStorage(tenantApp);

// Set persistence to LOCAL (survives tab close, but each Firebase App instance
// has its own namespace so admin and tenant don't clash)
if (typeof window !== 'undefined') {
    setPersistence(tenantAuth, browserLocalPersistence).catch(console.error);
}

// ─── Super-Admin Auth ─────────────────────────────────────────────────────────
// Scope: all /super-admin/* pages only.
// Separate Firebase App instance → separate auth state.
// CRITICAL: this uses a DIFFERENT app name ('admin'), so its IndexedDB
// persistence namespace is completely isolated from the tenant app.

const adminApp = getAdminApp();
export const adminAuth: Auth = getAuth(adminApp);
export const adminDb: Firestore = getFirestore(adminApp);
export const adminStorage: FirebaseStorage = getStorage(adminApp);

if (typeof window !== 'undefined') {
    setPersistence(adminAuth, browserLocalPersistence).catch(console.error);
}

// ─── Exports for backward compatibility ───────────────────────────────────────
/** @deprecated Use tenantAuth instead */
export const auth = tenantAuth;
