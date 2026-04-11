import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { sendPasswordResetLinkEmail } from '@/lib/email';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const email = String(body?.email || '').trim().toLowerCase();

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
        }

        const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_MENU_BASE_URL || 'https://nexresto.in';
        const continueUrl = `${origin.replace(/\/$/, '')}/setup-password`;

        try {
            const link = await adminAuth.generatePasswordResetLink(email, {
                url: continueUrl,
                handleCodeInApp: false,
            });

            const mailResult = await sendPasswordResetLinkEmail(email, link);
            if (!mailResult.success) {
                return NextResponse.json({ error: mailResult.error || 'Failed to send reset email' }, { status: 500 });
            }
        } catch (err: any) {
            // Do not leak whether the email exists.
            if (err?.code && String(err.code).includes('user-not-found')) {
                return NextResponse.json({ success: true, message: 'If this email exists, a reset link has been sent.' });
            }
            throw err;
        }

        return NextResponse.json({ success: true, message: 'If this email exists, a reset link has been sent.' });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || 'Password reset request failed' }, { status: 500 });
    }
}
