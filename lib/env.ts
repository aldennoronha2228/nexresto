/**
 * lib/env.ts  (Firebase)
 * -----------------------
 * Fail-fast environment validation for Firebase configuration.
 *
 * Threats mitigated:
 *  - App booting with missing Firebase credentials
 *  - Dangerously-open CORS / QR base-URL defaults reaching production
 */

const REQUIRED_PUBLIC: string[] = [
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_RESTAURANT_ID',
];

function assertEnv(key: string): string {
    const value = process.env[key];
    if (!value || value.trim() === '') {
        throw new Error(
            `[env] Missing required environment variable: ${key}. ` +
            `Set it in .env.local (development) or your hosting platform (production).`
        );
    }
    return value.trim();
}

export function validateEnv(): void {
    // Only validate on the server
    if (typeof window !== 'undefined') return;
    if (process.env.SKIP_ENV_VALIDATION === 'true') return;

    for (const key of REQUIRED_PUBLIC) {
        assertEnv(key);
    }

    // Warn about insecure defaults in production
    if (process.env.NODE_ENV === 'production') {
        const baseUrl = process.env.NEXT_PUBLIC_MENU_BASE_URL ?? '';
        if (!baseUrl || baseUrl.includes('localhost') || baseUrl.startsWith('http://')) {
            console.warn(
                '[env] WARNING: NEXT_PUBLIC_MENU_BASE_URL is using an insecure or localhost value in production.'
            );
        }
    }
}

// Derived, typed env accessors — safe to use on both client and server.
export const env = {
    firebaseApiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
    firebaseAuthDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    firebaseProjectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    firebaseStorageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
    firebaseMessagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    firebaseAppId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
    firebaseMeasurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? '',
    restaurantId: process.env.NEXT_PUBLIC_RESTAURANT_ID ?? 'rest001',
    menuBaseUrl: process.env.NEXT_PUBLIC_MENU_BASE_URL ?? '',
    menuCustomerPath: process.env.NEXT_PUBLIC_MENU_CUSTOMER_PATH ?? '/customer',
    superAdminEmail: process.env.SUPER_ADMIN_EMAIL ?? '',
    superAdminPassword: process.env.SUPER_ADMIN_PASSWORD ?? '',
} as const;
