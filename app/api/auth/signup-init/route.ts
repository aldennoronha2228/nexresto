/**
 * POST /api/auth/signup-init  (Firebase)
 * ----------------------------------------
 * Step 1 of signup: Generates a 6-digit OTP, stores signup data in Firestore,
 * and emails the code.
 *
 * Body: { email, password, fullName, restaurantName, masterPin }
 * Returns: { success, expiresAt }
 */

import { NextResponse } from 'next/server';
import { adminAuth, adminFirestore } from '@/lib/firebase-admin';
import { sendOtpEmail } from '@/lib/email';

function generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request: Request) {
    try {
        console.log('[signup-init] PROJECT_ID:', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
        const body = await request.json();
        const { email, password, fullName, restaurantName, masterPin } = body;

        if (!email || !password || !fullName || !restaurantName || !masterPin) {
            return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
        }

        // Validate email format
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
        }

        // Validate password strength
        if (password.length < 8) {
            return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
        }

        // Validate master PIN
        if (masterPin.length < 4 || masterPin.length > 20) {
            return NextResponse.json({ error: 'Master PIN must be 4-20 characters' }, { status: 400 });
        }

        // Check if email already exists in Firebase Auth
        try {
            await adminAuth.getUserByEmail(email.toLowerCase().trim());
            return NextResponse.json({
                error: 'This email is already registered. Please sign in instead.'
            }, { status: 409 });
        } catch (err: any) {
            // auth/user-not-found is expected — means email is available
            if (err.code !== 'auth/user-not-found') {
                throw err;
            }
        }

        // Generate OTP
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

        // Store pending signup in Firestore
        const normalizedEmail = email.toLowerCase().trim();
        await adminFirestore.doc(`pending_signups/${normalizedEmail}`).set({
            email: normalizedEmail,
            password,
            full_name: fullName,
            restaurant_name: restaurantName,
            master_pin: masterPin,
            otp,
            expires_at: expiresAt,
            created_at: new Date().toISOString(),
        });

        // Send OTP via email
        const emailResult = await sendOtpEmail(email, otp, restaurantName);

        if (!emailResult.success) {
            console.error('[signup-init] Email failed:', emailResult.error);
            return NextResponse.json({
                error: emailResult.error || 'Failed to send verification email'
            }, { status: 500 });
        }

        console.log(`[signup-init] OTP sent to ${email}`);

        return NextResponse.json({
            success: true,
            expiresAt,
            message: 'Verification code sent to your email'
        });

    } catch (err: any) {
        console.error('[signup-init] Error:', err);
        console.error('[signup-init] Details:', err.stack);
        return NextResponse.json({ error: err.message, stack: err.stack }, { status: 500 });
    }
}
