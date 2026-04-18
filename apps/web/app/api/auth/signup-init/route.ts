import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { adminAuth, adminFirestore } from '@/lib/firebase-admin';
import { sendOtpEmail } from '@/lib/email';

function generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            email,
            password,
            fullName,
            restaurantName,
            masterPin,
            inviteToken,
            requestId,
        } = body || {};

        if (!email || !password || !fullName || !restaurantName || !masterPin || !inviteToken || !requestId) {
            return NextResponse.json({ error: 'Missing required signup fields' }, { status: 400 });
        }

        const normalizedEmail = String(email).toLowerCase().trim();
        const normalizedRequestId = String(requestId).trim();
        const token = String(inviteToken).trim();

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
        }
        if (String(password).length < 8) {
            return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
        }
        if (String(masterPin).length < 4 || String(masterPin).length > 20) {
            return NextResponse.json({ error: 'Master PIN must be 4-20 characters' }, { status: 400 });
        }

        const inviteDocRef = adminFirestore.doc(`demo_requests/${normalizedRequestId}`);
        const inviteDoc = await inviteDocRef.get();
        if (!inviteDoc.exists) {
            return NextResponse.json({ error: 'Invalid invite link' }, { status: 403 });
        }

        const inviteData = inviteDoc.data() || {};
        const inviteEmail = String(inviteData.business_email || '').toLowerCase().trim();
        if (!inviteEmail || inviteEmail !== normalizedEmail) {
            return NextResponse.json({ error: 'Invite link is not valid for this email' }, { status: 403 });
        }

        const storedHash = String(inviteData.signup_invite_token_hash || '').trim();
        const expiresAtRaw = inviteData.signup_invite_token_expires_at;
        const expiresAt = expiresAtRaw ? new Date(String(expiresAtRaw)) : null;
        const usedAt = inviteData.signup_invite_token_used_at;
        const incomingHash = createHash('sha256').update(token).digest('hex');

        if (!storedHash || incomingHash !== storedHash) {
            return NextResponse.json({ error: 'Invalid or expired invite link' }, { status: 403 });
        }
        if (usedAt) {
            return NextResponse.json({ error: 'This invite link has already been used' }, { status: 410 });
        }
        if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
            return NextResponse.json({ error: 'Invite link has expired. Request a new link.' }, { status: 410 });
        }

        try {
            await adminAuth.getUserByEmail(normalizedEmail);
            return NextResponse.json({ error: 'This email is already registered. Please sign in instead.' }, { status: 409 });
        } catch (err: any) {
            if (err.code !== 'auth/user-not-found') {
                throw err;
            }
        }

        const otp = generateOTP();
        const expiresAtIso = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        await adminFirestore.doc(`pending_signups/${normalizedEmail}`).set({
            email: normalizedEmail,
            password,
            full_name: String(fullName).trim(),
            restaurant_name: String(restaurantName).trim(),
            master_pin: String(masterPin),
            otp,
            expires_at: expiresAtIso,
            created_at: new Date().toISOString(),
            invite_request_id: normalizedRequestId,
            invite_token_hash: incomingHash,
        });

        const emailResult = await sendOtpEmail(normalizedEmail, otp, String(restaurantName).trim());
        if (!emailResult.success) {
            return NextResponse.json({ error: emailResult.error || 'Failed to send verification email' }, { status: 500 });
        }

        return NextResponse.json({ success: true, expiresAt: expiresAtIso, message: 'Verification code sent to your email' });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || 'Failed to initialize signup' }, { status: 500 });
    }
}
