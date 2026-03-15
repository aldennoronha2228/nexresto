/**
 * lib/firebase-super-admin-actions.ts
 * ------------------------------------
 * Server Actions for Super Admin Dashboard using Firebase Admin SDK.
 * Replaces lib/super-admin-actions.ts.
 */

'use server';

import { adminFirestore, adminAuth } from './firebase-admin';
import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';

// Types
export interface PlatformStats {
    total_restaurants: number;
    total_revenue: number;
    active_orders: number;
    new_signups_30d: number;
}

export interface RestaurantWithOwner {
    id: string;
    name: string;
    owner_name: string | null;
    subscription_tier: 'starter' | 'pro' | '1k' | '2k' | '2.5k';
    subscription_status: 'active' | 'past_due' | 'cancelled' | 'trial';
    created_at: string;
    monthly_revenue: number;
    last_report_date: string | null;
    subscription_start_date: string | null;
    subscription_end_date: string | null;
    team_count: number;
    team_roles?: { role: string; count: number }[];
}

export interface GlobalLog {
    id: string;
    event_type: string;
    severity: 'info' | 'warning' | 'error' | 'success';
    message: string;
    metadata: Record<string, any>;
    tenant_id: string | null;
    user_id: string | null;
    created_at: string;
    restaurants?: { name: string } | null;
}

// ─── Verify Super Admin ──────────────────────────────────────────────────────

export async function verifySuperAdmin(userId: string): Promise<boolean> {
    try {
        const user = await adminAuth.getUser(userId);
        return user.customClaims?.role === 'super_admin';
    } catch {
        return false;
    }
}

// ─── Get Platform Stats ──────────────────────────────────────────────────────

export async function getPlatformStats(): Promise<PlatformStats> {
    const restaurantsRef = adminFirestore.collection('restaurants');
    const restaurantsSnap = await restaurantsRef.get();
    const totalRestaurants = restaurantsSnap.size;

    // Calculate MRR from subscription tiers
    const tierPricing: Record<string, number> = {
        'starter': 1000, 'pro': 2000, '1k': 1000, '2k': 2000, '2.5k': 2500,
    };

    let totalRevenue = 0;
    let activeOrders = 0;

    for (const restDoc of restaurantsSnap.docs) {
        const data = restDoc.data();
        if (data.subscription_status === 'active') {
            totalRevenue += tierPricing[data.subscription_tier] || 0;
        }

        // Count active orders in this restaurant
        const ordersSnap = await restDoc.ref
            .collection('orders')
            .where('status', 'in', ['new', 'preparing'])
            .get();
        activeOrders += ordersSnap.size;
    }

    // Get new signups in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let newSignups = 0;
    restaurantsSnap.docs.forEach(doc => {
        const data = doc.data();
        const createdAt = data.created_at?.toDate?.() || new Date(data.created_at);
        if (createdAt >= thirtyDaysAgo) newSignups++;
    });

    return {
        total_restaurants: totalRestaurants,
        total_revenue: totalRevenue,
        active_orders: activeOrders,
        new_signups_30d: newSignups,
    };
}

// ─── Get All Restaurants ─────────────────────────────────────────────────────

export async function getAllRestaurants(
    page: number = 1,
    limit: number = 10,
    search: string = ''
): Promise<{ data: RestaurantWithOwner[]; total: number }> {
    const restaurantsRef = adminFirestore.collection('restaurants');
    let snap = await restaurantsRef.orderBy('created_at', 'desc').get();

    // Filter by search
    let filteredDocs = snap.docs;
    if (search) {
        const lowerSearch = search.toLowerCase();
        filteredDocs = filteredDocs.filter(doc =>
            (doc.data().name || '').toLowerCase().includes(lowerSearch)
        );
    }

    const total = filteredDocs.length;
    const offset = (page - 1) * limit;
    const pageDocs = filteredDocs.slice(offset, offset + limit);

    const data: RestaurantWithOwner[] = await Promise.all(
        pageDocs.map(async (restDoc) => {
            const d = restDoc.data();

            // Get staff for this restaurant
            const staffSnap = await restDoc.ref.collection('staff').get();
            let ownerName: string | null = null;
            const roleMap = new Map<string, number>();

            staffSnap.docs.forEach(s => {
                const sd = s.data();
                if (sd.role === 'owner' && sd.full_name) ownerName = sd.full_name;
                roleMap.set(sd.role, (roleMap.get(sd.role) || 0) + 1);
            });

            const teamRoles = Array.from(roleMap.entries()).map(([role, count]) => ({ role, count }));
            const createdAt = d.created_at?.toDate?.()?.toISOString() || d.created_at || '';

            return {
                id: restDoc.id,
                name: d.name || '',
                owner_name: ownerName,
                subscription_tier: d.subscription_tier || 'starter',
                subscription_status: d.subscription_status || 'active',
                created_at: createdAt,
                monthly_revenue: d.monthly_revenue || 0,
                last_report_date: d.last_report_date || null,
                subscription_start_date: d.subscription_start_date || null,
                subscription_end_date: d.subscription_end_date || null,
                team_count: staffSnap.size,
                team_roles: teamRoles,
            };
        })
    );

    return { data, total };
}

// ─── Update Restaurant Subscription ──────────────────────────────────────────

export async function updateRestaurantSubscription(
    restaurantId: string,
    tier: 'starter' | 'pro' | '1k' | '2k'
): Promise<{ success: boolean; error?: string }> {
    const dbTier = tier === '1k' ? 'starter' : tier === '2k' ? 'pro' : tier;

    try {
        await adminFirestore.doc(`restaurants/${restaurantId}`).update({
            subscription_tier: dbTier,
        });

        await logActivity(
            'SUBSCRIPTION_CHANGE',
            `Subscription changed to ${tier} tier`,
            'info',
            { restaurant_id: restaurantId, new_tier: tier },
            restaurantId
        );

        revalidatePath('/super-admin');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ─── Update Restaurant Status ────────────────────────────────────────────────

export async function updateRestaurantStatus(
    restaurantId: string,
    status: 'active' | 'past_due' | 'cancelled' | 'trial'
): Promise<{ success: boolean; error?: string }> {
    try {
        await adminFirestore.doc(`restaurants/${restaurantId}`).update({
            subscription_status: status,
        });

        await logActivity(
            'STATUS_CHANGE',
            `Restaurant status changed to ${status}`,
            status === 'cancelled' ? 'warning' : 'info',
            { restaurant_id: restaurantId, new_status: status },
            restaurantId
        );

        revalidatePath('/super-admin');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ─── Update Subscription Dates ───────────────────────────────────────────────

export async function updateSubscriptionDates(
    restaurantId: string,
    startDate: string | null,
    endDate: string | null
): Promise<{ success: boolean; error?: string }> {
    const updateData: Record<string, any> = {};

    if (startDate !== undefined) updateData.subscription_start_date = startDate || null;
    if (endDate !== undefined) updateData.subscription_end_date = endDate || null;

    const today = new Date().toISOString().split('T')[0];
    if (endDate && endDate < today) updateData.subscription_status = 'cancelled';
    else if (startDate && startDate > today) updateData.subscription_status = 'trial';
    else if (startDate && startDate <= today && (!endDate || endDate >= today)) updateData.subscription_status = 'active';

    try {
        await adminFirestore.doc(`restaurants/${restaurantId}`).update(updateData);

        await logActivity(
            'SUBSCRIPTION_DATES_CHANGED',
            `Subscription dates updated: ${startDate || 'none'} to ${endDate || 'none'}`,
            'info',
            { restaurant_id: restaurantId, start_date: startDate, end_date: endDate },
            restaurantId
        );

        revalidatePath('/super-admin');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ─── Delete Restaurant ───────────────────────────────────────────────────────

export async function deleteRestaurant(
    restaurantId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const restRef = adminFirestore.doc(`restaurants/${restaurantId}`);
        const restDoc = await restRef.get();
        const restaurantData = restDoc.data();

        // Delete all sub-collections
        const subCollections = ['orders', 'menu_items', 'staff', 'categories', 'settings', 'analytics'];
        for (const subCol of subCollections) {
            const snapshot = await restRef.collection(subCol).get();
            const batch = adminFirestore.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            if (snapshot.size > 0) await batch.commit();
        }

        // Delete the restaurant document
        await restRef.delete();

        await logActivity(
            'RESTAURANT_DELETED',
            `Restaurant "${restaurantData?.name}" deleted`,
            'warning',
            { restaurant_id: restaurantId, restaurant_name: restaurantData?.name }
        );

        revalidatePath('/super-admin');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ─── Reset User Password ─────────────────────────────────────────────────────

export async function resetUserPassword(
    userId: string,
    newPassword?: string
): Promise<{ success: boolean; tempPassword?: string; error?: string }> {
    try {
        const user = await adminAuth.getUser(userId);

        if (newPassword) {
            await adminAuth.updateUser(userId, { password: newPassword });

            await logActivity('PASSWORD_RESET', `Password manually reset for ${user.email}`, 'info', {
                user_id: userId, email: user.email,
            });
            return { success: true };
        } else {
            const tempPassword = `Temp${Math.random().toString(36).slice(2, 10)}!`;
            await adminAuth.updateUser(userId, { password: tempPassword });

            await logActivity('PASSWORD_RESET', `Temporary password generated for ${user.email}`, 'info', {
                user_id: userId, email: user.email,
            });
            return { success: true, tempPassword };
        }
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ─── Send Password Reset Email ───────────────────────────────────────────────

export async function sendPasswordResetEmail(
    email: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const link = await adminAuth.generatePasswordResetLink(email);

        await logActivity('PASSWORD_RESET_EMAIL', `Password reset link generated for ${email}`, 'info', { email });

        // In production, send this link via email service (Resend)
        // For now, just return success
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ─── Get Impersonation Token ─────────────────────────────────────────────────

export async function getImpersonationToken(
    userId: string
): Promise<{ success: boolean; token?: string; error?: string }> {
    try {
        const user = await adminAuth.getUser(userId);
        if (!user.email) return { success: false, error: 'User not found' };

        // Generate a custom token for impersonation
        const customToken = await adminAuth.createCustomToken(userId);

        await logActivity('IMPERSONATION', `Super admin impersonating ${user.email}`, 'warning', {
            user_id: userId, email: user.email,
        });

        return { success: true, token: customToken };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ─── Get Global Logs ─────────────────────────────────────────────────────────

export async function getGlobalLogs(
    limit: number = 50,
    offset: number = 0,
    eventType?: string
): Promise<GlobalLog[]> {
    try {
        let q = adminFirestore.collection('global_logs')
            .orderBy('created_at', 'desc')
            .offset(offset)
            .limit(limit);

        if (eventType) {
            q = q.where('event_type', '==', eventType);
        }

        const snapshot = await q.get();

        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                event_type: data.event_type,
                severity: data.severity,
                message: data.message,
                metadata: data.metadata || {},
                tenant_id: data.tenant_id || null,
                user_id: data.user_id || null,
                created_at: data.created_at?.toDate?.()?.toISOString() || data.created_at || '',
                restaurants: data.restaurant_name ? { name: data.restaurant_name } : null,
            };
        });
    } catch (error) {
        console.error('Error fetching logs:', error);
        return [];
    }
}

// ─── Log Activity ────────────────────────────────────────────────────────────

export async function logActivity(
    eventType: string,
    message: string,
    severity: 'info' | 'warning' | 'error' | 'success' = 'info',
    metadata: Record<string, any> = {},
    tenantId?: string,
    userId?: string
): Promise<void> {
    try {
        // If tenantId provided, get restaurant name for quick lookup
        let restaurantName: string | undefined;
        if (tenantId) {
            const restDoc = await adminFirestore.doc(`restaurants/${tenantId}`).get();
            restaurantName = restDoc.data()?.name;
        }

        await adminFirestore.collection('global_logs').add({
            event_type: eventType,
            message,
            severity,
            metadata,
            tenant_id: tenantId || null,
            user_id: userId || null,
            restaurant_name: restaurantName || null,
            created_at: FieldValue.serverTimestamp(),
        });
    } catch (error) {
        console.error('Failed to log activity:', error);
    }
}

// ─── Get Restaurant Users ────────────────────────────────────────────────────

export async function getRestaurantUsers(
    restaurantId: string
): Promise<{ id: string; email: string; role: string; full_name: string | null }[]> {
    try {
        const staffSnap = await adminFirestore
            .collection('restaurants')
            .doc(restaurantId)
            .collection('staff')
            .get();

        return staffSnap.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                email: data.email || 'Unknown',
                role: data.role,
                full_name: data.full_name || null,
            };
        });
    } catch {
        return [];
    }
}

// ─── Promote to Super Admin ──────────────────────────────────────────────────

export async function promoteToSuperAdmin(
    userId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        // Set custom claim
        await adminAuth.setCustomUserClaims(userId, {
            role: 'super_admin',
        });

        const user = await adminAuth.getUser(userId);

        await logActivity('SUPER_ADMIN_PROMOTED', `${user.email} promoted to super admin`, 'success', {
            user_id: userId, email: user.email,
        });

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
