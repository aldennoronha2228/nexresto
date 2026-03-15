import { Resend } from 'resend';

let resend: Resend | null = null;

function getResendClient() {
    if (!resend) {
        resend = new Resend(process.env.RESEND_API_KEY);
    }
    return resend;
}

export async function sendOtpEmail(to: string, otp: string, restaurantName: string): Promise<{ success: boolean; error?: string }> {
    if (!process.env.RESEND_API_KEY) {
        console.error('[EMAIL] RESEND_API_KEY not configured');
        return { success: false, error: 'Email service not configured' };
    }

    try {
        const { error } = await getResendClient().emails.send({
            from: process.env.RESEND_FROM_EMAIL || 'NexResto <onboarding@resend.dev>',
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
