import { Resend } from 'resend';

let resend: Resend | null = null;
const DEV_FALLBACK_FROM = 'NexResto <onboarding@resend.dev>';

function getResendClient() {
    if (!resend) {
        resend = new Resend(process.env.RESEND_API_KEY);
    }
    return resend;
}

function resolveFromEmail(): string | null {
    const raw = (process.env.RESEND_FROM_EMAIL || '').trim();
    if (raw) {
        // Tolerate accidental values like "RESEND_FROM_EMAIL=..." pasted into env value.
        const withoutPrefix = raw.replace(/^RESEND_FROM_EMAIL\s*=\s*/i, '').trim();
        const emailMatch = withoutPrefix.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
        if (emailMatch) {
            return `NexResto <${emailMatch[0].toLowerCase()}>`;
        }
        return withoutPrefix;
    }

    // onboarding@resend.dev is sandbox-limited and should not be used in production.
    if (process.env.NODE_ENV === 'production') {
        return null;
    }

    return DEV_FALLBACK_FROM;
}

function resolvePublicSiteOrigin(): string {
    const candidates = [
        process.env.NEXT_PUBLIC_SITE_URL,
        process.env.NEXT_PUBLIC_APP_URL,
        process.env.NEXT_PUBLIC_MENU_BASE_URL,
        'https://nexresto.in',
    ];

    for (const candidate of candidates) {
        const raw = String(candidate || '').trim();
        if (!raw) continue;

        const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        try {
            const url = new URL(normalized);
            return url.origin;
        } catch {
            // try next candidate
        }
    }

    return 'https://nexresto.in';
}

export async function sendOtpEmail(to: string, otp: string, restaurantName: string): Promise<{ success: boolean; error?: string }> {
    if (!process.env.RESEND_API_KEY) {
        console.error('[EMAIL] RESEND_API_KEY not configured');
        return { success: false, error: 'Email service not configured' };
    }

    const from = resolveFromEmail();
    if (!from) {
        console.error('[EMAIL] RESEND_FROM_EMAIL is required in production');
        return {
            success: false,
            error: 'Email sender not configured. Set RESEND_FROM_EMAIL to a verified domain sender.',
        };
    }

    try {
        const { error } = await getResendClient().emails.send({
            from,
            to: [to],
            subject: `${otp} is your verification code`,
            html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
                    <div style="text-align: center; margin-bottom: 32px;">
                        <h1 style="color: #10b981; font-size: 28px; margin: 0;">NexResto</h1>
                        <p style="color: #64748b; margin: 8px 0 0;">Restaurant Management System</p>
                    </div>
                    
                    <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 16px; padding: 32px; text-align: center;">
                        <p style="color: #94a3b8; font-size: 14px; margin: 0 0 16px;">Your verification code for <strong style="color: #f8fafc;">${restaurantName}</strong></p>
                        
                        <div style="background: #0f172a; border: 2px solid #10b981; border-radius: 12px; padding: 24px; margin: 16px 0;">
                            <span style="font-family: 'Monaco', 'Consolas', monospace; font-size: 36px; font-weight: bold; color: #10b981; letter-spacing: 8px;">${otp}</span>
                        </div>
                        
                        <p style="color: #64748b; font-size: 12px; margin: 16px 0 0;">This code expires in 10 minutes</p>
                    </div>
                    
                    <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 24px;">
                        If you didn't request this code, you can safely ignore this email.
                    </p>
                </div>
            `,
        });

        if (error) {
            console.error('[EMAIL] Resend error:', error);
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (err) {
        console.error('[EMAIL] Failed to send:', err);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to send email' };
    }
}

export async function sendPasswordResetLinkEmail(to: string, resetLink: string): Promise<{ success: boolean; error?: string }> {
    if (!process.env.RESEND_API_KEY) {
        console.error('[EMAIL] RESEND_API_KEY not configured');
        return { success: false, error: 'Email service not configured' };
    }

    const from = resolveFromEmail();
    if (!from) {
        console.error('[EMAIL] RESEND_FROM_EMAIL is required in production');
        return {
            success: false,
            error: 'Email sender not configured. Set RESEND_FROM_EMAIL to a verified domain sender.',
        };
    }

    try {
        const { error } = await getResendClient().emails.send({
            from,
            to: [to],
            subject: 'Reset your NexResto password',
            html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 20px;">
                    <h1 style="color: #0f172a; margin: 0 0 12px;">Reset your password</h1>
                    <p style="color: #475569; line-height: 1.6; margin: 0 0 20px;">
                        We received a request to reset your NexResto password.
                    </p>
                    <a href="${resetLink}" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 10px; font-weight: 600;">
                        Reset Password
                    </a>
                    <p style="color: #64748b; font-size: 12px; margin: 20px 0 0; line-height: 1.6;">
                        If you did not request this, you can safely ignore this email.
                    </p>
                </div>
            `,
        });

        if (error) {
            console.error('[EMAIL] Resend reset-link error:', error);
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (err) {
        console.error('[EMAIL] Failed to send reset-link email:', err);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to send email' };
    }
}

export async function sendDailyReportEmail(params: {
    to: string;
    restaurantName: string;
    reportDate: string;
    totalRevenue: number;
    totalOrders: number;
    avgOrderValue: number;
    cancelledOrders: number;
    busiestHour: number | null;
    topItems: { name: string; quantity: number; revenue: number }[];
}): Promise<{ success: boolean; error?: string }> {
    if (!process.env.RESEND_API_KEY) {
        console.error('[EMAIL] RESEND_API_KEY not configured');
        return { success: false, error: 'Email service not configured' };
    }

    const from = resolveFromEmail();
    if (!from) {
        console.error('[EMAIL] RESEND_FROM_EMAIL is required in production');
        return {
            success: false,
            error: 'Email sender not configured. Set RESEND_FROM_EMAIL to a verified domain sender.',
        };
    }

    const topItemsHtml = params.topItems.length
        ? params.topItems
            .map((item) => `<li style=\"margin: 6px 0;\"><strong>${item.name}</strong> - ${item.quantity} sold (Rs. ${item.revenue.toFixed(2)})</li>`)
            .join('')
        : '<li>No items sold</li>';

    const busiestHourText = typeof params.busiestHour === 'number'
        ? `${String(params.busiestHour).padStart(2, '0')}:00`
        : 'N/A';

    try {
        const { error } = await getResendClient().emails.send({
            from,
            to: [params.to],
            subject: `${params.restaurantName} - Daily Report (${params.reportDate})`,
            html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 680px; margin: 0 auto; padding: 28px 16px; color: #0f172a;">
                    <h1 style="margin: 0 0 8px;">Daily Hotel Report</h1>
                    <p style="margin: 0 0 20px; color: #475569;">${params.restaurantName} | Report Date: <strong>${params.reportDate}</strong></p>

                    <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px;">
                            <div style="color: #64748b; font-size: 12px;">Total Revenue</div>
                            <div style="font-size: 20px; font-weight: 700;">Rs. ${params.totalRevenue.toFixed(2)}</div>
                        </div>
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px;">
                            <div style="color: #64748b; font-size: 12px;">Total Orders</div>
                            <div style="font-size: 20px; font-weight: 700;">${params.totalOrders}</div>
                        </div>
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px;">
                            <div style="color: #64748b; font-size: 12px;">Average Order Value</div>
                            <div style="font-size: 20px; font-weight: 700;">Rs. ${params.avgOrderValue.toFixed(2)}</div>
                        </div>
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px;">
                            <div style="color: #64748b; font-size: 12px;">Cancelled Orders</div>
                            <div style="font-size: 20px; font-weight: 700;">${params.cancelledOrders}</div>
                        </div>
                    </div>

                    <div style="margin-top: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px;">
                        <div style="color: #64748b; font-size: 12px;">Busiest Hour</div>
                        <div style="font-size: 16px; font-weight: 700;">${busiestHourText}</div>
                    </div>

                    <h2 style="margin: 20px 0 10px; font-size: 16px;">Top Items</h2>
                    <ul style="padding-left: 18px; margin: 0; color: #334155;">
                        ${topItemsHtml}
                    </ul>

                    <p style="margin-top: 24px; color: #64748b; font-size: 12px;">This is an automated report from NexResto.</p>
                </div>
            `,
        });

        if (error) {
            console.error('[EMAIL] Resend daily-report error:', error);
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (err) {
        console.error('[EMAIL] Failed to send daily report email:', err);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to send email' };
    }
}

export async function sendSubscriptionReminderEmail(params: {
    to: string;
    restaurantName: string;
    endDate: string;
    reminderType: 'ending_soon' | 'ended';
    daysRemaining?: number;
}): Promise<{ success: boolean; error?: string; providerMessageId?: string }> {
    if (!process.env.RESEND_API_KEY) {
        console.error('[EMAIL] RESEND_API_KEY not configured');
        return { success: false, error: 'Email service not configured' };
    }

    const from = resolveFromEmail();
    if (!from) {
        console.error('[EMAIL] RESEND_FROM_EMAIL is required in production');
        return {
            success: false,
            error: 'Email sender not configured. Set RESEND_FROM_EMAIL to a verified domain sender.',
        };
    }

    const isEndingSoon = params.reminderType === 'ending_soon';
    const daysLabel = typeof params.daysRemaining === 'number'
        ? (params.daysRemaining <= 0 ? 'today' : `in ${params.daysRemaining} day${params.daysRemaining === 1 ? '' : 's'}`)
        : 'soon';
    const subject = isEndingSoon
        ? `${params.restaurantName}: subscription expires ${daysLabel}`
        : `${params.restaurantName}: subscription has ended`;

    const headline = isEndingSoon
        ? 'Your subscription is ending soon'
        : 'Your subscription has ended';

    const body = isEndingSoon
        ? `Your NexResto subscription for <strong>${params.restaurantName}</strong> will expire on <strong>${params.endDate}</strong>. Please renew in time to avoid access interruption.`
        : `Your NexResto subscription for <strong>${params.restaurantName}</strong> ended on <strong>${params.endDate}</strong>. Please renew to restore full dashboard access.`;

    try {
        const { data, error } = await getResendClient().emails.send({
            from,
            to: [params.to],
            subject,
            html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 620px; margin: 0 auto; padding: 28px 16px; color: #0f172a;">
                    <h1 style="margin: 0 0 10px; font-size: 24px;">${headline}</h1>
                    <p style="margin: 0 0 14px; color: #334155; line-height: 1.6;">${body}</p>

                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; margin: 12px 0 18px;">
                        <p style="margin: 0; color: #475569; font-size: 14px;">
                            Restaurant: <strong>${params.restaurantName}</strong><br />
                            Subscription End Date: <strong>${params.endDate}</strong>
                        </p>
                    </div>

                    <p style="margin: 0; color: #64748b; font-size: 12px;">
                        This is an automated billing reminder from NexResto.
                    </p>
                </div>
            `,
        });

        if (error) {
            console.error('[EMAIL] Resend subscription-reminder error:', error);
            return { success: false, error: error.message };
        }

        return { success: true, providerMessageId: data?.id };
    } catch (err) {
        console.error('[EMAIL] Failed to send subscription reminder email:', err);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to send email' };
    }
}

export async function sendDemoRequestNotificationEmail(params: {
    to: string;
    requestId: string;
    contactName: string;
    businessEmail: string;
    phone: string;
    restaurantName: string;
    outletCount: string;
    qrRequirements?: string;
}): Promise<{ success: boolean; error?: string; providerMessageId?: string }> {
    if (!process.env.RESEND_API_KEY) {
        console.error('[EMAIL] RESEND_API_KEY not configured');
        return { success: false, error: 'Email service not configured' };
    }

    const from = resolveFromEmail();
    if (!from) {
        console.error('[EMAIL] RESEND_FROM_EMAIL is required in production');
        return {
            success: false,
            error: 'Email sender not configured. Set RESEND_FROM_EMAIL to a verified domain sender.',
        };
    }

    const escapeHtml = (value: string): string => value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

    const contactName = escapeHtml(params.contactName);
    const businessEmail = escapeHtml(params.businessEmail);
    const phone = escapeHtml(params.phone);
    const restaurantName = escapeHtml(params.restaurantName);
    const outletCount = escapeHtml(params.outletCount);
    const requestId = escapeHtml(params.requestId);
    const qrRequirements = escapeHtml(String(params.qrRequirements || 'No additional requirements'));

    try {
        const { data, error } = await getResendClient().emails.send({
            from,
            to: [params.to],
            subject: `New demo request received: ${params.restaurantName}`,
            html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 680px; margin: 0 auto; padding: 28px 16px; color: #0f172a;">
                    <h1 style="margin: 0 0 8px; font-size: 24px;">New Demo Request Received</h1>
                    <p style="margin: 0 0 18px; color: #475569;">A new QR demo request was submitted from the website.</p>

                    <table style="width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;">
                        <tbody>
                            <tr><td style="padding: 10px; border-bottom: 1px solid #e2e8f0; width: 180px; color: #64748b;">Request ID</td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${requestId}</td></tr>
                            <tr><td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Restaurant</td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${restaurantName}</td></tr>
                            <tr><td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Contact</td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${contactName}</td></tr>
                            <tr><td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Email</td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${businessEmail}</td></tr>
                            <tr><td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Phone</td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${phone}</td></tr>
                            <tr><td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Outlet Count</td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${outletCount}</td></tr>
                            <tr><td style="padding: 10px; color: #64748b; vertical-align: top;">Requirements</td><td style="padding: 10px; white-space: pre-wrap;">${qrRequirements}</td></tr>
                        </tbody>
                    </table>

                    <p style="margin-top: 16px; color: #64748b; font-size: 12px;">
                        Open the Super Admin Demo Requests section to review and update status.
                    </p>
                </div>
            `,
        });

        if (error) {
            console.error('[EMAIL] Resend demo-request notification error:', error);
            return { success: false, error: error.message };
        }

        return { success: true, providerMessageId: data?.id };
    } catch (err) {
        console.error('[EMAIL] Failed to send demo-request notification email:', err);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to send email' };
    }
}

export async function sendDemoRequestLoginUrlEmail(params: {
    to: string;
    contactName: string;
    restaurantName: string;
    loginUrl: string;
}): Promise<{ success: boolean; error?: string; providerMessageId?: string }> {
    if (!process.env.RESEND_API_KEY) {
        console.error('[EMAIL] RESEND_API_KEY not configured');
        return { success: false, error: 'Email service not configured' };
    }

    const from = resolveFromEmail();
    if (!from) {
        console.error('[EMAIL] RESEND_FROM_EMAIL is required in production');
        return {
            success: false,
            error: 'Email sender not configured. Set RESEND_FROM_EMAIL to a verified domain sender.',
        };
    }

    const escapeHtml = (value: string): string => value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

    const contactName = escapeHtml(params.contactName || 'there');
    const restaurantName = escapeHtml(params.restaurantName || 'your restaurant');
    const loginUrl = escapeHtml(params.loginUrl);
    const downloadUrl = `${resolvePublicSiteOrigin()}/download`;
    const safeDownloadUrl = escapeHtml(downloadUrl);

    try {
        const { data, error } = await getResendClient().emails.send({
            from,
            to: [params.to],
            subject: `${params.restaurantName} - Your NexResto login link`,
            html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 620px; margin: 0 auto; padding: 28px 16px; color: #0f172a;">
                    <h1 style="margin: 0 0 10px; font-size: 24px;">Your NexResto Access Link</h1>
                    <p style="margin: 0 0 12px; color: #334155; line-height: 1.6;">Hi ${contactName},</p>
                    <p style="margin: 0 0 16px; color: #334155; line-height: 1.6;">
                        Thanks for completing the demo for <strong>${restaurantName}</strong>. You can now access your NexResto account using the login page below.
                    </p>

                    <div style="margin: 0 0 16px; padding: 12px; border-radius: 10px; background: #f8fafc; border: 1px solid #e2e8f0; color: #334155; font-size: 14px; line-height: 1.7;">
                        <strong>Next steps:</strong><br />
                        1. Create your account from the login page link.<br />
                        2. After account setup is complete, download and install the APK app.
                    </div>

                    <a href="${loginUrl}" style="display: inline-block; background: #ea580c; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 10px; font-weight: 600;">
                        Step 1: Open Login Page
                    </a>

                    <div style="margin-top: 12px;">
                        <a href="${safeDownloadUrl}" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 10px; font-weight: 600;">
                            Step 2: Download APK App
                        </a>
                    </div>

                    <p style="margin: 16px 0 0; color: #475569; line-height: 1.6;">
                        Direct URL: <a href="${loginUrl}" style="color: #2563eb; word-break: break-all;">${loginUrl}</a>
                    </p>

                    <p style="margin: 10px 0 0; color: #475569; line-height: 1.6;">
                        Download page: <a href="${safeDownloadUrl}" style="color: #2563eb; word-break: break-all;">${safeDownloadUrl}</a>
                    </p>

                    <p style="margin-top: 20px; color: #64748b; font-size: 12px;">
                        If you were not expecting this email, you can ignore it.
                    </p>
                </div>
            `,
        });

        if (error) {
            console.error('[EMAIL] Resend demo-login-link error:', error);
            return { success: false, error: error.message };
        }

        return { success: true, providerMessageId: data?.id };
    } catch (err) {
        console.error('[EMAIL] Failed to send demo login URL email:', err);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to send email' };
    }
}
