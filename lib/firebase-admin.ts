/**
 * lib/firebase-admin.ts  (server-side only)
 * ------------------------------------------
 * Firebase Admin SDK for server-side operations.
 * Replaces the Supabase service_role pattern.
 *
 * NEVER import this file on the client side.
 * This uses a service account for privileged operations like:
 *   - Setting custom claims on users
 *   - Bypassing Firestore security rules
 *   - Managing users (password reset, deletion, etc.)
 */

import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let cachedAdminApp: App | null | undefined;
let adminInitLogged = false;

function hasAdminCredentials(): boolean {
    return Boolean(
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
        process.env.FIREBASE_CLIENT_EMAIL &&
        process.env.FIREBASE_PRIVATE_KEY
    );
}

function getAdminApp(): App | null {
    if (cachedAdminApp !== undefined) return cachedAdminApp;

    const apps = getApps();
    if (apps.length > 0) {
        cachedAdminApp = apps[0];
        return cachedAdminApp;
    }

    if (!hasAdminCredentials()) {
        cachedAdminApp = null;
        if (!adminInitLogged) {
            console.warn('[Firebase Admin] Missing FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY; running without admin features.');
            adminInitLogged = true;
        }
        return cachedAdminApp;
    }

    // Build credentials from environment variables
    const serviceAccount = {
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // The private key may be stored with surrounding quotes and escaped newlines
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/^"|"$|^'|'$/g, '').replace(/\\n/g, '\n'),
    };

    try {
        cachedAdminApp = initializeApp({
            credential: cert(serviceAccount),
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        });
        if (!adminInitLogged) {
            console.log('[Firebase Admin] Initialized Successfully');
            adminInitLogged = true;
        }
        return cachedAdminApp;
    } catch (error: any) {
        cachedAdminApp = null;
        if (!adminInitLogged) {
            console.warn('Firebase Admin initialization skipped (Invalid Key?):', error.message);
            adminInitLogged = true;
        }
        return cachedAdminApp;
    }
}

export function isFirebaseAdminAvailable(): boolean {
    return getAdminApp() !== null;
}

/** Server-side Firestore instance (bypasses security rules) */
export const adminFirestore: Firestore = new Proxy({} as Firestore, {
    get: (target, prop) => {
        const app = getAdminApp();
        if (!app) throw new Error("Firebase Admin not initialized properly (Did you set FIREBASE_PRIVATE_KEY?).");
        const fs = getFirestore(app);
        const val = fs[prop as keyof Firestore];
        return typeof val === 'function' ? val.bind(fs) : val;
    }
});

/** Server-side Auth instance (for user management & custom claims) */
export const adminAuth: Auth = new Proxy({} as Auth, {
    get: (target, prop) => {
        const app = getAdminApp();
        if (!app) throw new Error("Firebase Admin not initialized properly (Did you set FIREBASE_PRIVATE_KEY?).");
        const auth = getAuth(app);
        const val = auth[prop as keyof Auth];
        return typeof val === 'function' ? val.bind(auth) : val;
    }
});
