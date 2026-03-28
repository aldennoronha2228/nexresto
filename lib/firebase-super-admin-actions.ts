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
import { getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getOwnerEmailForRestaurant } from './reports';
import { sendSubscriptionReminderEmail } from './email';

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
    subscription_status: 'active' | 'past_due' | 'cancelled' | 'trial' | 'expired';
    created_at: string;
    monthly_revenue: number;
    last_report_date: string | null;
    subscription_start_date: string | null;
    subscription_end_date: string | null;
    account_temporarily_disabled?: boolean;
    subscription_reminder_emails_enabled?: boolean;
    team_count: number;
    team_roles?: { role: string; count: number }[];
}

export interface RestaurantManagerMetrics {
    total_revenue: number;
    total_active_restaurants: number;
    growth_percent: number;
    pending_renewals: number;
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

export interface ResourceMonitorRow {
    id: string;
    name: string;
    logo_url: string | null;
    subscription_tier: 'starter' | 'pro' | '1k' | '2k' | '2.5k';
    subscription_status: 'active' | 'past_due' | 'cancelled' | 'trial' | 'expired';
    storage_used_mb: number;
    storage_limit_mb: number;
    ai_credits_used: number;
    ai_credits_limit: number;
    db_reads: number;
    db_writes: number;
    bandwidth_used_mb: number;
    bandwidth_limit_mb: number;
    daily_ai_count: number;
}

export interface ResourceMonitorSummary {
    total_global_storage_mb: number;
    total_ai_cost_inr: number;
    hotels_near_limit: number;
}

export interface SubscriptionReminderEmailRow {
    id: string;
    name: string;
    owner_email: string | null;
    subscription_end_date: string | null;
    days_remaining: number | null;
    account_temporarily_disabled: boolean;
    reminders_enabled: boolean;
    last_reminder_kind: string | null;
    last_reminder_for: string | null;
    last_reminder_sent_on: string | null;
    last_reminder_sent_at: string | null;
    last_reminder_error: string | null;
    last_reminder_to: string | null;
    last_reminder_provider_id: string | null;
    last_reminder_source: string | null;
}

export type DemoRequestStatus = 'new' | 'contacted' | 'scheduled' | 'converted' | 'closed';

export interface DemoRequestRow {
    id: string;
    contact_name: string;
    business_email: string;
    phone: string;
    restaurant_name: string;
    outlet_count: string;
    qr_requirements: string;
    status: DemoRequestStatus;
    source: string;
    created_at: string;
    updated_at: string | null;
    notes: string | null;
}

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
    search: string = '',
    filters?: { tier?: 'all' | 'free' | 'pro' | 'enterprise'; status?: 'all' | 'active' | 'past_due' | 'cancelled' | 'trial' | 'expired' }
): Promise<{ data: RestaurantWithOwner[]; total: number; metrics: RestaurantManagerMetrics }> {
    const restaurantsRef = adminFirestore.collection('restaurants');
    let snap = await restaurantsRef.orderBy('created_at', 'desc').get();

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tierPricing: Record<string, number> = {
        'starter': 1000,
        'pro': 2000,
        '1k': 1000,
        '2k': 2000,
        '2.5k': 2500,
    };

    const normalizeDate = (raw: any): Date | null => {
        if (!raw) return null;
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return null;
        return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    };

    const getEffectiveStatus = (
        rawStatus: any,
        endDateRaw: any,
        startDateRaw?: any
    ): RestaurantWithOwner['subscription_status'] => {
        const endDate = normalizeDate(endDateRaw);
        const startDate = normalizeDate(startDateRaw);

        if (endDate && endDate < today) return 'expired';

        const status = rawStatus || 'active';
        if (status === 'expired') {
            if (startDate && startDate > today) return 'trial';
            return 'active';
        }

        if (status === 'active' || status === 'past_due' || status === 'cancelled' || status === 'trial' || status === 'expired') {
            return status;
        }
        return 'active';
    };

    // Backend metrics used by Restaurant Manager top row.
    let totalRevenue = 0;
    let totalActiveRestaurants = 0;
    let pendingRenewals = 0;
    let currentMonthSignups = 0;
    let previousMonthSignups = 0;

    const startOfCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfPreviousMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);

    for (const doc of snap.docs) {
        const data = doc.data();
        const effectiveStatus = getEffectiveStatus(
            data.subscription_status,
            data.subscription_end_date,
            data.subscription_start_date
        );
        const tier = data.subscription_tier || 'starter';
        if (effectiveStatus === 'active') {
            totalRevenue += tierPricing[tier] || 0;
            totalActiveRestaurants += 1;
        }

        const endDate = normalizeDate(data.subscription_end_date);
        if (effectiveStatus !== 'expired' && effectiveStatus !== 'cancelled' && endDate) {
            const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / 86400000);
            if (diffDays >= 0 && diffDays <= 7) pendingRenewals += 1;
        }

        const createdAtRaw = data.created_at?.toDate?.() || (data.created_at ? new Date(data.created_at) : null);
        if (createdAtRaw && !Number.isNaN(createdAtRaw.getTime())) {
            if (createdAtRaw >= startOfCurrentMonth) currentMonthSignups += 1;
            else if (createdAtRaw >= startOfPreviousMonth && createdAtRaw < startOfCurrentMonth) previousMonthSignups += 1;
        }

        if (effectiveStatus !== data.subscription_status) {
            // Keep stored status aligned with date-driven effective state.
            await doc.ref.update({ subscription_status: effectiveStatus });
        }
    }

    const growthPercent = previousMonthSignups === 0
        ? (currentMonthSignups > 0 ? 100 : 0)
        : Math.round(((currentMonthSignups - previousMonthSignups) / previousMonthSignups) * 100);

    // Filter by search
    let filteredDocs = snap.docs;
    if (search) {
        const lowerSearch = search.toLowerCase();
        filteredDocs = filteredDocs.filter(doc =>
            (doc.data().name || '').toLowerCase().includes(lowerSearch)
        );
    }

    if (filters?.tier && filters.tier !== 'all') {
        filteredDocs = filteredDocs.filter(doc => {
            const tier = doc.data().subscription_tier || 'starter';
            if (filters.tier === 'free') return tier === 'starter' || tier === '1k';
            if (filters.tier === 'pro') return tier === 'pro' || tier === '2k';
            if (filters.tier === 'enterprise') return tier === '2.5k';
            return true;
        });
    }

    if (filters?.status && filters.status !== 'all') {
        filteredDocs = filteredDocs.filter(doc => {
            const d = doc.data();
            return getEffectiveStatus(d.subscription_status, d.subscription_end_date, d.subscription_start_date) === filters.status;
        });
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
                subscription_status: getEffectiveStatus(d.subscription_status, d.subscription_end_date, d.subscription_start_date),
                created_at: createdAt,
                monthly_revenue: d.monthly_revenue || 0,
                last_report_date: d.last_report_date || null,
                subscription_start_date: d.subscription_start_date || null,
                subscription_end_date: d.subscription_end_date || null,
                account_temporarily_disabled: Boolean(d.account_temporarily_disabled),
                subscription_reminder_emails_enabled: d.subscription_reminder_emails_enabled !== false,
                team_count: staffSnap.size,
                team_roles: teamRoles,
            };
        })
    );

    return {
        data,
        total,
        metrics: {
            total_revenue: totalRevenue,
            total_active_restaurants: totalActiveRestaurants,
            growth_percent: growthPercent,
            pending_renewals: pendingRenewals,
        },
    };
}

// ─── Temporary Access Control ────────────────────────────────────────────────

export async function setRestaurantTemporaryAccess(
    restaurantId: string,
    disabled: boolean
): Promise<{ success: boolean; error?: string }> {
    try {
        await adminFirestore.doc(`restaurants/${restaurantId}`).update({
            account_temporarily_disabled: disabled,
            account_temporarily_disabled_at: disabled ? FieldValue.serverTimestamp() : FieldValue.delete(),
            account_temporarily_reenabled_at: disabled ? FieldValue.delete() : FieldValue.serverTimestamp(),
        });

        await logActivity(
            disabled ? 'RESTAURANT_TEMP_DISABLED' : 'RESTAURANT_TEMP_REENABLED',
            disabled ? 'Restaurant temporarily disabled' : 'Restaurant re-enabled',
            disabled ? 'warning' : 'success',
            { restaurant_id: restaurantId, disabled },
            restaurantId
        );

        revalidatePath('/super-admin');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ─── Subscription Reminder Email Control ───────────────────────────────────

export async function setRestaurantReminderEmailsEnabled(
    restaurantId: string,
    enabled: boolean
): Promise<{ success: boolean; error?: string }> {
    try {
        await adminFirestore.doc(`restaurants/${restaurantId}`).update({
            subscription_reminder_emails_enabled: enabled,
            subscription_reminder_emails_updated_at: FieldValue.serverTimestamp(),
        });

        await logActivity(
            enabled ? 'SUBSCRIPTION_REMINDER_EMAILS_ENABLED' : 'SUBSCRIPTION_REMINDER_EMAILS_DISABLED',
            enabled ? 'Subscription reminder emails enabled' : 'Subscription reminder emails disabled',
            'info',
            { restaurant_id: restaurantId, enabled },
            restaurantId
        );

        revalidatePath('/super-admin');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getSubscriptionReminderEmailRows(): Promise<SubscriptionReminderEmailRow[]> {
    try {
        const snapshot = await adminFirestore.collection('restaurants').orderBy('created_at', 'desc').get();

        return snapshot.docs.map((doc) => {
            const d = doc.data() || {};
            const endDate = normalizeYmd(d.subscription_end_date);
            const sentAt = d.last_subscription_reminder_sent_at?.toDate?.();

            return {
                id: doc.id,
                name: String(d.name || doc.id),
                owner_email: d.owner_email ? String(d.owner_email) : null,
                subscription_end_date: endDate,
                days_remaining: endDate ? daysUntilYmd(endDate) : null,
                account_temporarily_disabled: Boolean(d.account_temporarily_disabled),
                reminders_enabled: d.subscription_reminder_emails_enabled !== false,
                last_reminder_kind: d.last_subscription_reminder_kind ? String(d.last_subscription_reminder_kind) : null,
                last_reminder_for: d.last_subscription_reminder_for ? String(d.last_subscription_reminder_for) : null,
                last_reminder_sent_on: d.last_subscription_reminder_sent_on ? String(d.last_subscription_reminder_sent_on) : null,
                last_reminder_sent_at: sentAt ? sentAt.toISOString() : null,
                last_reminder_error: d.last_subscription_reminder_error ? String(d.last_subscription_reminder_error) : null,
                last_reminder_to: d.last_subscription_reminder_to ? String(d.last_subscription_reminder_to) : null,
                last_reminder_provider_id: d.last_subscription_reminder_provider_id ? String(d.last_subscription_reminder_provider_id) : null,
                last_reminder_source: d.last_subscription_reminder_source ? String(d.last_subscription_reminder_source) : null,
            };
        });
    } catch (error) {
        console.error('Error loading reminder email rows:', error);
        return [];
    }
}

export async function sendManualSubscriptionReminderEmail(
    restaurantId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const restaurantRef = adminFirestore.doc(`restaurants/${restaurantId}`);
        const restaurantSnap = await restaurantRef.get();

        if (!restaurantSnap.exists) {
            return { success: false, error: 'Restaurant not found' };
        }

        const restaurant = restaurantSnap.data() || {};
        const todayYmd = new Date().toISOString().slice(0, 10);
        const alreadySentOn = String(restaurant.last_subscription_reminder_sent_on || '').trim();
        if (alreadySentOn === todayYmd) {
            return { success: false, error: 'Reminder already sent today for this restaurant' };
        }

        if (Boolean(restaurant.account_temporarily_disabled)) {
            return { success: false, error: 'Restaurant is temporarily disabled' };
        }

        if (restaurant.subscription_reminder_emails_enabled === false) {
            return { success: false, error: 'Reminder emails are disabled for this restaurant' };
        }

        const endDate = normalizeYmd(restaurant.subscription_end_date);
        if (!endDate) {
            return { success: false, error: 'Subscription end date is not set' };
        }

        const daysRemaining = daysUntilYmd(endDate);

        const ownerEmail = await getOwnerEmailForRestaurant(restaurantId, restaurant.owner_email);
        if (!ownerEmail) {
            return { success: false, error: 'Owner email not found' };
        }

        const restaurantName = String(restaurant.name || restaurantId).trim();
        const reminderType: 'ending_soon' | 'ended' = daysRemaining < 0 ? 'ended' : 'ending_soon';
        const emailResult = await sendSubscriptionReminderEmail({
            to: ownerEmail,
            restaurantName,
            endDate,
            reminderType,
            daysRemaining,
        });

        if (!emailResult.success) {
            await restaurantRef.update({
                last_subscription_reminder_error: emailResult.error || 'Email send failed',
                last_subscription_reminder_error_at: FieldValue.serverTimestamp(),
                last_subscription_reminder_to: ownerEmail,
                last_subscription_reminder_source: 'manual',
            });
            return { success: false, error: emailResult.error || 'Email send failed' };
        }

        await restaurantRef.update({
            last_subscription_reminder_kind: reminderType,
            last_subscription_reminder_for: endDate,
            last_subscription_reminder_sent_on: todayYmd,
            last_subscription_reminder_sent_at: FieldValue.serverTimestamp(),
            last_subscription_reminder_source: 'manual',
            last_subscription_reminder_to: ownerEmail,
            last_subscription_reminder_provider_id: emailResult.providerMessageId || FieldValue.delete(),
            last_subscription_reminder_error: FieldValue.delete(),
        });

        await logActivity(
            'SUBSCRIPTION_REMINDER_EMAIL_SENT_MANUAL',
            'Manual subscription reminder email sent',
            'success',
            { restaurant_id: restaurantId, end_date: endDate, days_remaining: daysRemaining },
            restaurantId
        );

        revalidatePath('/super-admin/emails');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to send manual reminder' };
    }
}

// ─── Demo Requests ──────────────────────────────────────────────────────────

function toIsoString(value: unknown): string | null {
    try {
        if (
            typeof value === 'object' &&
            value !== null &&
            'toDate' in value &&
            typeof (value as { toDate?: unknown }).toDate === 'function'
        ) {
            const toDateFn = (value as { toDate: () => Date }).toDate;
            return toDateFn().toISOString();
        }

        if (value instanceof Date) {
            if (!Number.isNaN(value.getTime())) return value.toISOString();
            return null;
        }

        if (typeof value === 'string' || typeof value === 'number') {
            const parsed = new Date(value);
            if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
        }

        return null;
    } catch {
        return null;
    }
}

const DEMO_REQUEST_STATUS_SET = new Set<DemoRequestStatus>([
    'new',
    'contacted',
    'scheduled',
    'converted',
    'closed',
]);

export async function getDemoRequests(filters?: {
    status?: 'all' | DemoRequestStatus;
    search?: string;
}): Promise<DemoRequestRow[]> {
    try {
        const snapshot = await adminFirestore
            .collection('demo_requests')
            .orderBy('created_at', 'desc')
            .limit(500)
            .get();

        const statusFilter = filters?.status || 'all';
        const search = String(filters?.search || '').trim().toLowerCase();

        const rows = snapshot.docs.map((doc) => {
            const d = doc.data() || {};
            const statusRaw = String(d.status || 'new').trim().toLowerCase() as DemoRequestStatus;
            const status: DemoRequestStatus = DEMO_REQUEST_STATUS_SET.has(statusRaw) ? statusRaw : 'new';

            return {
                id: doc.id,
                contact_name: String(d.contact_name || ''),
                business_email: String(d.business_email || ''),
                phone: String(d.phone || ''),
                restaurant_name: String(d.restaurant_name || ''),
                outlet_count: String(d.outlet_count || ''),
                qr_requirements: String(d.qr_requirements || ''),
                status,
                source: String(d.source || 'website'),
                created_at: toIsoString(d.created_at) || new Date(0).toISOString(),
                updated_at: toIsoString(d.updated_at),
                notes: d.notes ? String(d.notes) : null,
            } as DemoRequestRow;
        });

        return rows.filter((row) => {
            if (statusFilter !== 'all' && row.status !== statusFilter) return false;
            if (!search) return true;

            const haystack = [
                row.contact_name,
                row.business_email,
                row.phone,
                row.restaurant_name,
                row.outlet_count,
                row.qr_requirements,
                row.status,
            ]
                .join(' ')
                .toLowerCase();

            return haystack.includes(search);
        });
    } catch (error) {
        console.error('Error loading demo requests:', error);
        return [];
    }
}

export async function updateDemoRequestStatus(
    requestId: string,
    status: DemoRequestStatus,
    notes?: string
): Promise<{ success: boolean; error?: string }> {
    if (!DEMO_REQUEST_STATUS_SET.has(status)) {
        return { success: false, error: 'Invalid status' };
    }

    try {
        const updateData: Record<string, unknown> = {
            status,
            updated_at: FieldValue.serverTimestamp(),
        };

        if (notes !== undefined) {
            updateData.notes = String(notes || '').trim();
        }

        await adminFirestore.doc(`demo_requests/${requestId}`).update(updateData);

        await logActivity(
            'DEMO_REQUEST_STATUS_CHANGED',
            `Demo request status changed to ${status}`,
            'info',
            { request_id: requestId, status }
        );

        revalidatePath('/super-admin/demo-requests');
        revalidatePath('/super-admin');
        return { success: true };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to update demo request';
        return { success: false, error: message };
    }
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

    const today = new Date();
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const parseYmd = (value: string | null): Date | null => {
        if (!value) return null;
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return null;
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    };

    const start = parseYmd(startDate);
    const end = parseYmd(endDate);

    if (end && end < todayOnly) {
        updateData.subscription_status = 'expired';
    } else if (start && start > todayOnly) {
        updateData.subscription_status = 'trial';
    } else {
        // If the end date is today/future (or unset), treat as active regardless of start date presence.
        updateData.subscription_status = 'active';
    }

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

// ─── Archive Restaurant ──────────────────────────────────────────────────────

export async function archiveRestaurant(
    restaurantId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        await adminFirestore.doc(`restaurants/${restaurantId}`).update({
            archived: true,
            archived_at: FieldValue.serverTimestamp(),
            subscription_status: 'cancelled',
        });

        await logActivity(
            'RESTAURANT_ARCHIVED',
            `Restaurant ${restaurantId} archived`,
            'warning',
            { restaurant_id: restaurantId },
            restaurantId
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

// ─── Resource Monitor ────────────────────────────────────────────────────────

function toNumber(...values: any[]): number {
    for (const value of values) {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
    }
    return 0;
}

function normalizeStatus(rawStatus: any, endDateRaw: any): ResourceMonitorRow['subscription_status'] {
    const today = new Date();
    const baseDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endDate = endDateRaw ? new Date(endDateRaw) : null;
    if (endDate && !Number.isNaN(endDate.getTime())) {
        const normalizedEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
        if (normalizedEnd < baseDate) return 'expired';
    }

    if (rawStatus === 'active' || rawStatus === 'past_due' || rawStatus === 'cancelled' || rawStatus === 'trial' || rawStatus === 'expired') {
        return rawStatus;
    }
    return 'active';
}

async function getStorageUsageForRestaurant(restaurantId: string): Promise<number | null> {
    try {
        const apps = getApps();
        if (apps.length === 0) return null;
        const app = apps[0];
        const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || app.options.projectId || '';

        const normalizeBucketName = (value: unknown): string => {
            if (typeof value !== 'string') return '';
            return value
                .trim()
                .replace(/^gs:\/\//, '')
                .replace(/\/$/, '');
        };

        const rawCandidates = [
            process.env.FIREBASE_STORAGE_BUCKET,
            process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
            typeof app.options.storageBucket === 'string' ? app.options.storageBucket : '',
            projectId ? `${projectId}.appspot.com` : '',
            projectId ? `${projectId}.firebasestorage.app` : '',
        ];

        const bucketCandidates = [...new Set(rawCandidates.map(normalizeBucketName).filter(Boolean))];
        if (bucketCandidates.length === 0) return null;

        const storage = getStorage(app);
        const candidatePrefixes = [`restaurants/${restaurantId}/`, `${restaurantId}/`];

        for (const bucketName of bucketCandidates) {
            try {
                const bucket = storage.bucket(bucketName);

                for (const prefix of candidatePrefixes) {
                    const [files] = await bucket.getFiles({ prefix });
                    if (files.length === 0) continue;

                    let totalBytes = 0;
                    files.forEach((file) => {
                        const size = toNumber(file.metadata?.size);
                        totalBytes += size;
                    });
                    return Math.round((totalBytes / (1024 * 1024)) * 100) / 100;
                }
            } catch {
                // Try next bucket candidate.
            }
        }

        return 0;
    } catch {
        return null;
    }
}

export async function getResourceMonitorData(): Promise<{ rows: ResourceMonitorRow[]; summary: ResourceMonitorSummary }> {
    const restaurantsSnap = await adminFirestore.collection('restaurants').orderBy('name').get();
    const currentMonthKey = new Date().toISOString().slice(0, 7);
    const aiCostPerCreditInr = 0.2;

    const rows: ResourceMonitorRow[] = await Promise.all(restaurantsSnap.docs.map(async (doc) => {
        const d = doc.data();
        const id = doc.id;

        const [usageDocA, usageDocB, usageDocC, usageDocLegacy, calculatedStorageMb] = await Promise.all([
            adminFirestore.collection('resource_usage').doc(id).get(),
            adminFirestore.collection('usage').doc(id).get(),
            adminFirestore.collection('restaurants').doc(id).collection('usage').doc(currentMonthKey).get(),
            adminFirestore.collection('restaurants').doc(id).collection('usage').doc('ai_credits_used').get(),
            getStorageUsageForRestaurant(id),
        ]);

        const usageA = usageDocA.exists ? usageDocA.data() || {} : {};
        const usageB = usageDocB.exists ? usageDocB.data() || {} : {};
        const usageC = usageDocC.exists ? usageDocC.data() || {} : {};
        const usageLegacy = usageDocLegacy.exists ? usageDocLegacy.data() || {} : {};
        const usageRoot = (d.usage as Record<string, any>) || {};

        const storageLimit = toNumber(
            d.storage_limit_mb,
            d.usage_limits?.storage_mb,
            usageA.storage_limit_mb,
            usageB.storage_limit_mb,
            500,
        );
        const aiLimit = toNumber(
            d.ai_credits_limit,
            d.usage_limits?.ai_credits,
            usageA.ai_credits_limit,
            usageB.ai_credits_limit,
            1000,
        );
        const bandwidthLimit = toNumber(
            d.bandwidth_limit_mb,
            d.usage_limits?.bandwidth_mb,
            usageA.bandwidth_limit_mb,
            usageB.bandwidth_limit_mb,
            2048,
        );

        const storageUsed = toNumber(
            calculatedStorageMb,
            usageLegacy.storage_used_mb,
            usageLegacy.storage_used_bytes ? Number(usageLegacy.storage_used_bytes) / (1024 * 1024) : 0,
            usageA.storage_used_mb,
            usageA.storageMb,
            usageB.storage_used_mb,
            usageC.storage_used_mb,
            d.storage_used_mb,
        );
        const aiCreditsUsed = toNumber(
            usageLegacy.ai_credits_used,
            usageRoot.ai_credits_used,
            usageRoot.dailyAiCount,
            usageA.ai_credits_used,
            usageA.aiCreditsUsed,
            usageB.ai_credits_used,
            usageC.ai_credits_used,
            d.ai_credits_used,
        );
        const dbReads = toNumber(
            usageLegacy.db_reads,
            usageLegacy.firestore_reads,
            usageA.db_reads,
            usageA.firestore_reads,
            usageB.db_reads,
            usageC.db_reads,
            usageRoot.db_reads,
            d.db_reads,
        );
        const dbWrites = toNumber(
            usageLegacy.db_writes,
            usageLegacy.firestore_writes,
            usageA.db_writes,
            usageA.firestore_writes,
            usageB.db_writes,
            usageC.db_writes,
            usageRoot.db_writes,
            d.db_writes,
        );
        const bandwidthUsed = toNumber(
            usageLegacy.bandwidth_used_mb,
            usageLegacy.bandwidth_used_bytes ? Number(usageLegacy.bandwidth_used_bytes) / (1024 * 1024) : 0,
            usageA.bandwidth_used_mb,
            usageA.bandwidthMb,
            usageB.bandwidth_used_mb,
            usageC.bandwidth_used_mb,
            usageRoot.bandwidth_used_mb,
            d.bandwidth_used_mb,
        );
        const dailyAiCount = toNumber(
            usageRoot.dailyAiCount,
            usageRoot.daily_ai_count,
            usageLegacy.dailyAiCount,
            usageLegacy.daily_ai_count,
        );

        return {
            id,
            name: d.name || id,
            logo_url: d.logo_url || d.logo || null,
            subscription_tier: d.subscription_tier || 'starter',
            subscription_status: normalizeStatus(d.subscription_status, d.subscription_end_date),
            storage_used_mb: storageUsed,
            storage_limit_mb: storageLimit,
            ai_credits_used: aiCreditsUsed,
            ai_credits_limit: aiLimit,
            db_reads: dbReads,
            db_writes: dbWrites,
            bandwidth_used_mb: bandwidthUsed,
            bandwidth_limit_mb: bandwidthLimit,
            daily_ai_count: dailyAiCount,
        };
    }));

    let totalGlobalStorageMb = 0;
    let totalAiCostInr = 0;
    let hotelsNearLimit = 0;

    rows.forEach((row) => {
        totalGlobalStorageMb += row.storage_used_mb;
        totalAiCostInr += row.ai_credits_used * aiCostPerCreditInr;

        const storagePct = row.storage_limit_mb > 0 ? (row.storage_used_mb / row.storage_limit_mb) * 100 : 0;
        const aiPct = row.ai_credits_limit > 0 ? (row.ai_credits_used / row.ai_credits_limit) * 100 : 0;
        if (storagePct >= 80 || aiPct >= 80) hotelsNearLimit += 1;
    });

    const summary: ResourceMonitorSummary = {
        total_global_storage_mb: Math.round(totalGlobalStorageMb * 100) / 100,
        total_ai_cost_inr: Math.round(totalAiCostInr * 100) / 100,
        hotels_near_limit: hotelsNearLimit,
    };

    const sortedRows = [...rows].sort((a, b) => {
        const aPct = a.storage_limit_mb > 0 ? a.storage_used_mb / a.storage_limit_mb : 0;
        const bPct = b.storage_limit_mb > 0 ? b.storage_used_mb / b.storage_limit_mb : 0;
        return bPct - aPct;
    });

    return { rows: sortedRows, summary };
}
