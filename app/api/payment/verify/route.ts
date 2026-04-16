import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminAuth, adminFirestore } from '@/lib/firebase-admin';
import { PLAN_PRICES, type UpgradablePlan } from '@/lib/pricing';

type VerifyRequestBody = {
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
  plan?: string;
};

function isUpgradablePlan(plan: string): plan is UpgradablePlan {
  return plan === 'starter' || plan === 'growth';
}

function getRestaurantIdFromClaims(claims: Record<string, unknown>): string {
  const restaurantId = String(claims.restaurant_id || claims.tenant_id || '').trim();
  return restaurantId;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function secureCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    const idToken = authHeader.replace('Bearer ', '').trim();
    const decoded = await adminAuth.verifyIdToken(idToken);

    const restaurantId = getRestaurantIdFromClaims(decoded as unknown as Record<string, unknown>);
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant context not found' }, { status: 403 });
    }

    const body = (await request.json()) as VerifyRequestBody;

    const razorpayOrderId = String(body?.razorpay_order_id || '').trim();
    const razorpayPaymentId = String(body?.razorpay_payment_id || '').trim();
    const razorpaySignature = String(body?.razorpay_signature || '').trim();
    const selectedPlan = String(body?.plan || '').trim().toLowerCase();

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return NextResponse.json({ error: 'Missing payment verification fields' }, { status: 400 });
    }

    if (!isUpgradablePlan(selectedPlan)) {
      return NextResponse.json({ error: 'Invalid plan selected' }, { status: 400 });
    }

    const razorpaySecret = process.env.RAZORPAY_KEY_SECRET || '';
    if (!razorpaySecret) {
      return NextResponse.json({ error: 'Payment gateway is not configured' }, { status: 500 });
    }

    const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
    const expectedSignature = crypto.createHmac('sha256', razorpaySecret).update(payload).digest('hex');

    if (!secureCompare(expectedSignature, razorpaySignature)) {
      return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
    }

    const now = new Date();
    const expiresAtDate = addDays(now, 30);
    const subscriptionStartDate = now.toISOString().slice(0, 10);
    const planExpiresAt = expiresAtDate.toISOString();
    const subscriptionEndDate = planExpiresAt.slice(0, 10);
    const paidAmountInr = PLAN_PRICES[selectedPlan];

    const restaurantRef = adminFirestore.doc(`restaurants/${restaurantId}`);
    const restaurantSnap = await restaurantRef.get();
    const existingData = (restaurantSnap.data() || {}) as Record<string, unknown>;
    const disabledReason = String(existingData.account_disabled_reason || '').trim();

    const updatePayload: Record<string, unknown> = {
      plan: selectedPlan,
      planStatus: 'active',
      planExpiresAt,
      subscription_tier: selectedPlan,
      subscription_status: 'active',
      subscription_start_date: subscriptionStartDate,
      subscription_end_date: subscriptionEndDate,
      last_payment: {
        provider: 'razorpay',
        order_id: razorpayOrderId,
        payment_id: razorpayPaymentId,
        amount_inr: paidAmountInr,
        paid_at: now.toISOString(),
        verified_at: planExpiresAt,
        plan: selectedPlan,
      },
      updated_at: Timestamp.now(),
    };

    if (disabledReason === 'subscription_expired') {
      updatePayload.account_temporarily_disabled = false;
      updatePayload.account_disabled_reason = FieldValue.delete();
      updatePayload.account_temporarily_reenabled_at = Timestamp.now();
    }

    await restaurantRef.set(updatePayload, { merge: true });

    return NextResponse.json({
      success: true,
      restaurantId,
      plan: selectedPlan,
      planStatus: 'active',
      planExpiresAt,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to verify payment';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
