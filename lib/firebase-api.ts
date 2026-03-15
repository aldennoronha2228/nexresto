/**
 * lib/firebase-api.ts
 * --------------------
 * Firestore data access layer replacing lib/api.ts.
 * All functions operate on the "silo" sub-collection structure:
 *   restaurants/{resId}/orders
 *   restaurants/{resId}/menu_items
 *   restaurants/{resId}/categories
 *   restaurants/{resId}/settings
 *
 * Real-time: Uses onSnapshot() instead of Supabase's postgres_changes.
 */

import {
    collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
    query, where, orderBy, limit as firestoreLimit,
    onSnapshot, serverTimestamp, Timestamp,
    type Unsubscribe,
    writeBatch,
} from 'firebase/firestore';
import { db as defaultDb } from './firebase';
import { tenantAuth, adminAuth } from './firebase';
import type { Order, MenuItem, Category, DashboardOrder } from './types';
import type { Firestore } from 'firebase/firestore';

// ─── HELPERS ────────────────────────────────────────────────────────────────

function formatTimeAgo(timestamp: any): string {
    const date = timestamp instanceof Timestamp ? timestamp.toDate() : new Date(timestamp);
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
}

function mapFirestoreOrder(id: string, data: any): DashboardOrder {
    const items = (data.items || []).map((oi: any, idx: number) => ({
        id: oi.id || `item-${idx}`,
        name: oi.item_name || oi.name,
        quantity: oi.quantity,
        price: oi.item_price || oi.price,
    }));

    const createdAt = data.created_at instanceof Timestamp
        ? data.created_at.toDate().toISOString()
        : data.created_at || new Date().toISOString();

    return {
        id,
        daily_order_number: data.daily_order_number,
        table: data.table_number,
        items,
        status: data.status,
        total: data.total,
        time: formatTimeAgo(data.created_at || new Date()),
        created_at: createdAt,
    };
}

async function refreshAnyActiveToken(): Promise<void> {
    const jobs: Promise<unknown>[] = [];
    if (tenantAuth.currentUser) jobs.push(tenantAuth.currentUser.getIdToken(true));
    if (adminAuth.currentUser) jobs.push(adminAuth.currentUser.getIdToken(true));
    if (jobs.length > 0) {
        await Promise.allSettled(jobs);
    }
}

function isPermissionDeniedError(error: unknown): boolean {
    const code = (error as { code?: string } | null)?.code ?? '';
    return typeof code === 'string' && code.includes('permission-denied');
}

async function withPermissionRetry<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (!isPermissionDeniedError(error)) throw error;
        await refreshAnyActiveToken();
        return operation();
    }
}

// ─── ORDERS ─────────────────────────────────────────────────────────────────

/** Fetch all active orders (new/preparing/done) for the current tenant */
export async function fetchActiveOrders(tenantId: string, db: Firestore = defaultDb): Promise<DashboardOrder[]> {
    return withPermissionRetry(async () => {
        const ordersRef = collection(db, 'restaurants', tenantId, 'orders');
        const q = query(
            ordersRef,
            orderBy('created_at', 'desc')
        );

        const snapshot = await getDocs(q);
        return snapshot.docs
            .map(doc => mapFirestoreOrder(doc.id, doc.data()))
            .filter(order => ['new', 'preparing', 'done'].includes(order.status));
    });
}

/** Fetch order history (paid/cancelled) for the current tenant */
export async function fetchOrderHistory(tenantId: string, limitCount = 50, db: Firestore = defaultDb): Promise<DashboardOrder[]> {
    return withPermissionRetry(async () => {
        const ordersRef = collection(db, 'restaurants', tenantId, 'orders');
        const q = query(
            ordersRef,
            orderBy('created_at', 'desc'),
            firestoreLimit(limitCount)
        );

        const snapshot = await getDocs(q);
        return snapshot.docs
            .map(doc => mapFirestoreOrder(doc.id, doc.data()))
            .filter(order => ['paid', 'cancelled'].includes(order.status));
    });
}

/** Update order status */
export async function updateOrderStatus(
    tenantId: string,
    orderId: string,
    status: Order['status'],
    db: Firestore = defaultDb
): Promise<void> {
    const orderRef = doc(db, 'restaurants', tenantId, 'orders', orderId);
    await updateDoc(orderRef, { status, updated_at: serverTimestamp() });
}

/** Delete an order */
export async function deleteOrder(tenantId: string, orderId: string, db: Firestore = defaultDb): Promise<void> {
    const orderRef = doc(db, 'restaurants', tenantId, 'orders', orderId);
    await deleteDoc(orderRef);
}

/**
 * Subscribe to real-time order changes for a specific tenant.
 * Uses Firestore's onSnapshot() — replaces Supabase's postgres_changes.
 * Returns an unsubscribe function.
 */
export function subscribeToOrders(
    tenantId: string,
    onChange: (orders: DashboardOrder[]) => void,
    db: Firestore = defaultDb,
    onError?: (error: Error) => void
): Unsubscribe {
    const ordersRef = collection(db, 'restaurants', tenantId, 'orders');
    const q = query(
        ordersRef,
        orderBy('created_at', 'desc')
    );

    let innerUnsubscribe: Unsubscribe | null = null;
    let retriedAfterRefresh = false;

    const startListener = () => {
        innerUnsubscribe = onSnapshot(q, (snapshot) => {
            const orders = snapshot.docs
                .map(doc => mapFirestoreOrder(doc.id, doc.data()))
                .filter(order => ['new', 'preparing', 'done'].includes(order.status));
            onChange(orders);
        }, async (error) => {
            if (!retriedAfterRefresh && isPermissionDeniedError(error)) {
                retriedAfterRefresh = true;
                await refreshAnyActiveToken();
                if (innerUnsubscribe) innerUnsubscribe();
                startListener();
                return;
            }

            console.error('Real-time order listener error:', error);
            if (onError) onError(error);
        });
    };

    startListener();

    return () => {
        if (innerUnsubscribe) innerUnsubscribe();
    };
}

/** Cleanly remove order subscription — just call the unsubscribe function */
export async function unsubscribeFromOrders(unsubscribe: Unsubscribe) {
    unsubscribe();
}

// ─── MENU ITEMS ─────────────────────────────────────────────────────────────

/** Fetch all menu items for the current tenant */
export async function fetchMenuItems(tenantId: string, db: Firestore = defaultDb): Promise<MenuItem[]> {
    return withPermissionRetry(async () => {
        const menuRef = collection(db, 'restaurants', tenantId, 'menu_items');
        const q = query(menuRef, orderBy('name'));
        const snapshot = await getDocs(q);

        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                name: data.name,
                price: data.price,
                category_id: data.category_id,
                type: data.type,
                image_url: data.image_url || null,
                available: data.available ?? true,
                categories: data.category_name ? { id: data.category_id, name: data.category_name } : null,
            } as MenuItem;
        });
    });
}

/** Toggle menu item availability */
export async function toggleMenuItemAvailability(
    tenantId: string,
    itemId: string,
    available: boolean,
    db: Firestore = defaultDb
): Promise<void> {
    const itemRef = doc(db, 'restaurants', tenantId, 'menu_items', itemId);
    await updateDoc(itemRef, { available });
}

/** Delete a menu item */
export async function deleteMenuItem(tenantId: string, itemId: string, db: Firestore = defaultDb): Promise<void> {
    const itemRef = doc(db, 'restaurants', tenantId, 'menu_items', itemId);
    await deleteDoc(itemRef);
}

/** Create a menu item for the current tenant */
export async function createMenuItem(
    tenantId: string,
    item: {
        name: string;
        price: number;
        category_id: string;
        type: 'veg' | 'non-veg';
        image_url?: string;
    },
    db: Firestore = defaultDb
): Promise<MenuItem> {
    // Get category name for denormalization
    let categoryName = '';
    try {
        const catDoc = await getDoc(doc(db, 'restaurants', tenantId, 'categories', item.category_id));
        if (catDoc.exists()) {
            categoryName = catDoc.data().name;
        }
    } catch {
        // Non-critical
    }

    const menuRef = collection(db, 'restaurants', tenantId, 'menu_items');
    const docRef = await addDoc(menuRef, {
        ...item,
        category_name: categoryName,
        available: true,
        created_at: serverTimestamp(),
    });

    return {
        id: docRef.id,
        ...item,
        available: true,
        categories: categoryName ? { id: item.category_id, name: categoryName } : null,
    };
}

/** Update a menu item */
export async function updateMenuItem(
    tenantId: string,
    itemId: string,
    updates: Partial<{ name: string; price: number; category_id: string; type: 'veg' | 'non-veg'; image_url: string }>,
    db: Firestore = defaultDb
): Promise<void> {
    const itemRef = doc(db, 'restaurants', tenantId, 'menu_items', itemId);
    await updateDoc(itemRef, { ...updates, updated_at: serverTimestamp() });
}

// ─── CATEGORIES ─────────────────────────────────────────────────────────────

/** Fetch all categories for the current tenant */
export async function fetchCategories(tenantId: string, db: Firestore = defaultDb): Promise<Category[]> {
    return withPermissionRetry(async () => {
        const catRef = collection(db, 'restaurants', tenantId, 'categories');
        const q = query(catRef, orderBy('display_order'));
        const snapshot = await getDocs(q);

        return snapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name,
            display_order: doc.data().display_order,
        }));
    });
}

/** Create a new category for the current tenant */
export async function createCategory(
    tenantId: string,
    name: string,
    displayOrder: number = 0,
    db: Firestore = defaultDb
): Promise<Category> {
    const catRef = collection(db, 'restaurants', tenantId, 'categories');
    const docRef = await addDoc(catRef, {
        name,
        display_order: displayOrder,
        created_at: serverTimestamp(),
    });

    return { id: docRef.id, name, display_order: displayOrder };
}

/** Update a category */
export async function updateCategory(tenantId: string, id: string, name: string, db: Firestore = defaultDb): Promise<void> {
    const catRef = doc(db, 'restaurants', tenantId, 'categories', id);
    await updateDoc(catRef, { name });
}

/** Delete a category */
export async function deleteCategory(tenantId: string, id: string, db: Firestore = defaultDb): Promise<void> {
    const catRef = doc(db, 'restaurants', tenantId, 'categories', id);
    await deleteDoc(catRef);
}

// ─── SETTINGS ───────────────────────────────────────────────────────────────

/** Check if the website is currently "Public" or "Admin-Only" for a given tenant */
export async function fetchIsSitePublic(tenantId: string, db: Firestore = defaultDb): Promise<boolean> {
    try {
        const settingRef = doc(db, 'restaurants', tenantId, 'settings', 'is_site_public');
        const snapshot = await getDoc(settingRef);

        if (!snapshot.exists()) return true; // default to public
        return snapshot.data().value === true;
    } catch (error) {
        console.error('Error fetching site status:', error);
        return true;
    }
}

/** Toggle the Site's Public Visibility for the current tenant */
export async function updateSitePublic(tenantId: string, isPublic: boolean, db: Firestore = defaultDb): Promise<void> {
    const settingRef = doc(db, 'restaurants', tenantId, 'settings', 'is_site_public');
    await updateDoc(settingRef, { value: isPublic }).catch(async () => {
        // Document might not exist yet, create it
        const { setDoc } = await import('firebase/firestore');
        await setDoc(settingRef, { value: isPublic, key: 'is_site_public' });
    });
}
