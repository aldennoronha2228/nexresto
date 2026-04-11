import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore, isFirebaseAdminAvailable } from './firebase-admin';

const PLATFORM_SETTINGS_DOC = 'platform_settings/global_maintenance';
const MAINTENANCE_CACHE_TTL_MS = 5000;

let maintenanceCache: { value: boolean; updatedAt: number } | null = null;

export async function getPlatformMaintenanceMode(): Promise<boolean> {
    if (!isFirebaseAdminAvailable()) {
        return maintenanceCache?.value ?? false;
    }

    if (maintenanceCache && (Date.now() - maintenanceCache.updatedAt) < MAINTENANCE_CACHE_TTL_MS) {
        return maintenanceCache.value;
    }

    try {
        const snap = await adminFirestore.doc(PLATFORM_SETTINGS_DOC).get();
        const value = snap.exists ? snap.data()?.enabled === true : false;
        maintenanceCache = { value, updatedAt: Date.now() };
        return value;
    } catch (error) {
        console.error('Failed to load platform maintenance mode:', error);
        if (maintenanceCache) return maintenanceCache.value;
        return false;
    }
}

export async function setPlatformMaintenanceMode(
    enabled: boolean,
    updatedBy: string = 'super_admin'
): Promise<void> {
    if (!isFirebaseAdminAvailable()) {
        throw new Error('Firebase Admin is not configured. Set FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.');
    }

    await adminFirestore.doc(PLATFORM_SETTINGS_DOC).set({
        enabled,
        updated_by: updatedBy,
        updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });

    maintenanceCache = { value: enabled, updatedAt: Date.now() };
}
