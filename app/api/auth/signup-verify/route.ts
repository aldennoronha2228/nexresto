import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { adminAuth, adminFirestore } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email, otp, inviteToken, requestId } = body || {};

        if (!email || !otp || !inviteToken || !requestId) {
            return NextResponse.json({ error: 'Email, OTP, and invite link are required' }, { status: 400 });
        }

        const normalizedEmail = String(email).toLowerCase().trim();
        const normalizedRequestId = String(requestId).trim();
        const incomingHash = createHash('sha256').update(String(inviteToken).trim()).digest('hex');

        const pendingRef = adminFirestore.doc(`pending_signups/${normalizedEmail}`);
        const pendingDoc = await pendingRef.get();
        if (!pendingDoc.exists) {
            return NextResponse.json({ error: 'No pending signup found. Please start over.' }, { status: 404 });
        }

        const pending = pendingDoc.data()!;
        if (pending.otp !== otp) {
            return NextResponse.json({ error: 'Invalid verification code' }, { status: 401 });
        }
        if (pending.invite_request_id !== normalizedRequestId || pending.invite_token_hash !== incomingHash) {
            return NextResponse.json({ error: 'Invite link validation failed. Please start over.' }, { status: 403 });
        }
        if (new Date(pending.expires_at).getTime() < Date.now()) {
            await pendingRef.delete();
            return NextResponse.json({ error: 'Verification code expired. Please start over.' }, { status: 410 });
        }

        const inviteRef = adminFirestore.doc(`demo_requests/${normalizedRequestId}`);
        const inviteDoc = await inviteRef.get();
        if (!inviteDoc.exists) {
            return NextResponse.json({ error: 'Invalid invite request' }, { status: 403 });
        }

        const inviteData = inviteDoc.data() || {};
        const storedHash = String(inviteData.signup_invite_token_hash || '').trim();
        const inviteEmail = String(inviteData.business_email || '').toLowerCase().trim();
        const inviteUsed = inviteData.signup_invite_token_used_at;
        const inviteExpiresRaw = inviteData.signup_invite_token_expires_at;
        const inviteExpiresAt = inviteExpiresRaw ? new Date(String(inviteExpiresRaw)) : null;

        if (!storedHash || storedHash !== incomingHash || inviteEmail !== normalizedEmail) {
            return NextResponse.json({ error: 'Invalid invite link' }, { status: 403 });
        }
        if (inviteUsed) {
            return NextResponse.json({ error: 'This invite link has already been used' }, { status: 410 });
        }
        if (!inviteExpiresAt || Number.isNaN(inviteExpiresAt.getTime()) || inviteExpiresAt.getTime() < Date.now()) {
            return NextResponse.json({ error: 'Invite link has expired. Request a new link.' }, { status: 410 });
        }

        let userRecord;
        try {
            userRecord = await adminAuth.createUser({
                email: pending.email,
                password: pending.password,
                displayName: pending.full_name,
                emailVerified: true,
            });
        } catch (err: any) {
            return NextResponse.json({ error: err.message }, { status: 500 });
        }

        const userId = userRecord.uid;
        const baseSlug = slugify(pending.restaurant_name) || 'restaurant';
        const tenantId = `${baseSlug}-${Date.now().toString(36)}`;

        try {
            await adminFirestore.doc(`restaurants/${tenantId}`).set({
                name: pending.restaurant_name,
                master_pin: pending.master_pin,
                owner_email: pending.email,
                subscription_tier: 'starter',
                subscription_status: 'active',
                created_at: FieldValue.serverTimestamp(),
            });

            await adminFirestore.doc(`restaurants/${tenantId}/staff/${userId}`).set({
                email: pending.email,
                full_name: pending.full_name,
                role: 'owner',
                invited_at: FieldValue.serverTimestamp(),
            });

            await adminAuth.setCustomUserClaims(userId, {
                role: 'owner',
                restaurant_id: tenantId,
                tenant_id: tenantId,
            });

            await adminFirestore.doc(`restaurants/${tenantId}/settings/is_site_public`).set({
                key: 'is_site_public',
                value: true,
            });

            await adminFirestore.doc(`restaurants/${tenantId}/analytics/daily`).set({
                revenue: 0,
                order_count: 0,
                last_updated: FieldValue.serverTimestamp(),
            });

            await inviteRef.set({
                signup_invite_token_used_at: FieldValue.serverTimestamp(),
                signup_completed_at: FieldValue.serverTimestamp(),
                signup_created_user_id: userId,
                signup_created_tenant_id: tenantId,
                updated_at: FieldValue.serverTimestamp(),
            }, { merge: true });
        } catch (err: any) {
            await adminAuth.deleteUser(userId);
            return NextResponse.json({ error: err.message }, { status: 500 });
        }

        await pendingRef.delete();

        return NextResponse.json({ userId, tenantId, message: 'Account created successfully! You can now sign in.' }, { status: 201 });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || 'Failed to verify signup' }, { status: 500 });
    }
}
