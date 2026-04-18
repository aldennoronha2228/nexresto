import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase-admin';
import {
    generateDailyReport,
    getOwnerEmailForRestaurant,
    getYesterdayYmdUtc,
    isProTier,
} from '@/lib/reports';
import { sendDailyReportEmail } from '@/lib/email';

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

/**
 * Scheduled endpoint: sends yesterday's report to each restaurant owner
 * when email reports are enabled for that restaurant.
 */
async function handleDailyEmailCron(request: NextRequest) {
    if (!isAuthorizedCronRequest(request)) {
        return NextResponse.json({ error: 'Unauthorized cron request' }, { status: 401 });
    }

    const reportDate = getYesterdayYmdUtc();
    const restaurantsSnap = await adminFirestore.collection('restaurants').get();

    let scanned = 0;
    let sent = 0;
    let skipped = 0;
    const errors: Array<{ restaurantId: string; error: string }> = [];

    for (const restaurantDoc of restaurantsSnap.docs) {
        scanned += 1;
        const restaurantId = restaurantDoc.id;
        const restaurant = restaurantDoc.data() || {};

        try {
            if (!restaurant.email_reports_enabled) {
                skipped += 1;
                continue;
            }

            if (!isProTier(restaurant.subscription_tier)) {
                skipped += 1;
                continue;
            }

            if (restaurant.last_report_emailed_for === reportDate) {
                skipped += 1;
                continue;
            }

            const ownerEmail = await getOwnerEmailForRestaurant(restaurantId, restaurant.owner_email);
            if (!ownerEmail) {
                skipped += 1;
                errors.push({ restaurantId, error: 'Owner email not found' });
                continue;
            }

            const { report, restaurantName } = await generateDailyReport(restaurantId, reportDate);
            const emailResult = await sendDailyReportEmail({
                to: ownerEmail,
                restaurantName: restaurantName || restaurant.name || restaurantId,
                reportDate,
                totalRevenue: report.total_revenue,
                totalOrders: report.total_orders,
                avgOrderValue: report.avg_order_value,
                cancelledOrders: report.cancelled_orders,
                busiestHour: report.busiest_hour,
                topItems: report.top_items,
            });

            if (!emailResult.success) {
                errors.push({ restaurantId, error: emailResult.error || 'Email send failed' });
                continue;
            }

            await restaurantDoc.ref.update({
                last_report_emailed_for: reportDate,
                last_report_email_sent_at: FieldValue.serverTimestamp(),
                last_report_email_error: FieldValue.delete(),
            });

            sent += 1;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            errors.push({ restaurantId, error: message });
            await restaurantDoc.ref.update({
                last_report_email_error: message,
                last_report_email_error_at: FieldValue.serverTimestamp(),
            }).catch(() => { });
        }
    }

    return NextResponse.json({
        ok: true,
        reportDate,
        scanned,
        sent,
        skipped,
        failed: errors.length,
        errors,
    });
}

/**
 * GET /api/reports/daily-email
 * Vercel Cron triggers this endpoint using GET.
 */
export async function GET(request: NextRequest) {
    return handleDailyEmailCron(request);
}

/**
 * POST /api/reports/daily-email
 * Manual or internal invocation.
 */
export async function POST(request: NextRequest) {
    return handleDailyEmailCron(request);
}
