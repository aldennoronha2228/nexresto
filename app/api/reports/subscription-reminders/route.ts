import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase-admin';
import { getOwnerEmailForRestaurant } from '@/lib/reports';
import { sendSubscriptionReminderEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

function isAuthorizedCronRequest(request: NextRequest): boolean {
    const secret = (process.env.CRON_SECRET || '').trim();
    if (!secret) {
        return false;
    }

    const authHeader = request.headers.get('authorization') || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const cronHeader = request.headers.get('x-cron-secret') || '';

    return bearer === secret || cronHeader === secret;
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

/**
 * Sends owner reminder emails for:
 * - expiring in 2 days or less (until end date)
 * - at most one reminder email per restaurant per day
 */
async function handleSubscriptionReminders(request: NextRequest) {
    if (!isAuthorizedCronRequest(request)) {
        return NextResponse.json({ error: 'Unauthorized cron request' }, { status: 401 });
    }

    const restaurantsSnap = await adminFirestore.collection('restaurants').get();

    let scanned = 0;
    let sent = 0;
    let skipped = 0;
    const errors: Array<{ restaurantId: string; error: string }> = [];
    const todayYmd = new Date().toISOString().slice(0, 10);

    for (const restaurantDoc of restaurantsSnap.docs) {
        scanned += 1;
        const restaurantId = restaurantDoc.id;
        const restaurant = restaurantDoc.data() || {};

        try {
            if (Boolean(restaurant.account_temporarily_disabled)) {
                skipped += 1;
                continue;
            }

            if (restaurant.subscription_reminder_emails_enabled === false) {
                skipped += 1;
                continue;
            }

            const endDate = normalizeYmd(restaurant.subscription_end_date);
            if (!endDate) {
                skipped += 1;
                continue;
            }

            const daysRemaining = daysUntilYmd(endDate);
            if (daysRemaining < 0 || daysRemaining > 2) {
                skipped += 1;
                continue;
            }

            const reminderType: 'ending_soon' = 'ending_soon';

            const alreadySentOn = String(restaurant.last_subscription_reminder_sent_on || '').trim();
            if (alreadySentOn === todayYmd) {
                skipped += 1;
                continue;
            }

            const ownerEmail = await getOwnerEmailForRestaurant(restaurantId, restaurant.owner_email);
            if (!ownerEmail) {
                skipped += 1;
                errors.push({ restaurantId, error: 'Owner email not found' });
                continue;
            }

            const restaurantName = String(restaurant.name || restaurantId).trim();
            const emailResult = await sendSubscriptionReminderEmail({
                to: ownerEmail,
                restaurantName,
                endDate,
                reminderType,
                daysRemaining,
            });

            if (!emailResult.success) {
                errors.push({ restaurantId, error: emailResult.error || 'Email send failed' });
                await restaurantDoc.ref.update({
                    last_subscription_reminder_error: emailResult.error || 'Email send failed',
                    last_subscription_reminder_error_at: FieldValue.serverTimestamp(),
                    last_subscription_reminder_to: ownerEmail,
                    last_subscription_reminder_source: 'cron',
                }).catch(() => { });
                continue;
            }

            await restaurantDoc.ref.update({
                last_subscription_reminder_kind: reminderType,
                last_subscription_reminder_for: endDate,
                last_subscription_reminder_sent_on: todayYmd,
                last_subscription_reminder_sent_at: FieldValue.serverTimestamp(),
                last_subscription_reminder_to: ownerEmail,
                last_subscription_reminder_source: 'cron',
                last_subscription_reminder_provider_id: emailResult.providerMessageId || FieldValue.delete(),
                last_subscription_reminder_error: FieldValue.delete(),
            });

            sent += 1;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            errors.push({ restaurantId, error: message });
            await restaurantDoc.ref.update({
                last_subscription_reminder_error: message,
                last_subscription_reminder_error_at: FieldValue.serverTimestamp(),
            }).catch(() => { });
        }
    }

    return NextResponse.json({
        ok: true,
        scanned,
        sent,
        skipped,
        failed: errors.length,
        errors,
    });
}

/**
 * GET /api/reports/subscription-reminders
 * Vercel Cron triggers this endpoint using GET.
 */
export async function GET(request: NextRequest) {
    return handleSubscriptionReminders(request);
}

/**
 * POST /api/reports/subscription-reminders
 * Manual or internal invocation.
 */
export async function POST(request: NextRequest) {
    return handleSubscriptionReminders(request);
}
