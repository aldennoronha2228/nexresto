
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminFirestore } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
    try {
        const { email, password } = await request.json();

        const normalizedEmail = String(email || '').trim().toLowerCase();
        const rawPassword = String(password || '');

        const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
        const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD;

        if (!superAdminEmail || !superAdminPassword) {
            return NextResponse.json({ error: 'Super Admin not configured' }, { status: 500 });
        }

        const normalizedSuperAdminEmail = String(superAdminEmail).trim().toLowerCase();
        const normalizedSuperAdminPassword = String(superAdminPassword).trim();

        // Keep password exact from user input but ignore accidental env whitespace.
        if (normalizedEmail !== normalizedSuperAdminEmail || rawPassword !== normalizedSuperAdminPassword) {
            return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        }

        // Credentials match .env! 
        // Ensure this user exists in Firebase Auth
        let user;
        try {
            user = await adminAuth.getUserByEmail(normalizedSuperAdminEmail);
            // Update password in Firebase to match .env
            await adminAuth.updateUser(user.uid, { password: normalizedSuperAdminPassword });
        } catch (error: any) {
            if (error.code === 'auth/user-not-found') {
                user = await adminAuth.createUser({
                    email: normalizedSuperAdminEmail,
                    password: normalizedSuperAdminPassword,
                    emailVerified: true,
                    displayName: 'Super Admin',
                });
            } else {
                throw error;
            }
        }

        // ─── STRICT DATABASE SYNC: admin_profiles ───────────────────────────
        // 1. Ensure the CURRENT super admin has a profile record
        const { Timestamp } = await import('firebase-admin/firestore');
        await adminFirestore.doc(`admin_profiles/${user.uid}`).set({
            email: normalizedSuperAdminEmail,
            role: 'super_admin',
            updated_at: Timestamp.now(),
        }, { merge: true });

        // ───────────────────────────────────────────────────────────────────

        // Set the super_admin claim
        await adminAuth.setCustomUserClaims(user.uid, { role: 'super_admin' });

        // Generate a custom token for the frontend to sign in with
        const customToken = await adminAuth.createCustomToken(user.uid);

        return NextResponse.json({ customToken });
    } catch (error: any) {
        console.error('[AdminVerify] Error:', error);
        return NextResponse.json({ error: 'System error' }, { status: 500 });
    }
}
