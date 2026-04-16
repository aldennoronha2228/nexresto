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

function resolvePlanFromAmountPaise(amountPaise: number): UpgradablePlan | null {
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) return null;

  if (amountPaise === PLAN_PRICES.starter * 100) return 'starter';
  if (amountPaise === PLAN_PRICES.growth * 100) return 'growth';

  return null;
}

async function fetchRazorpayOrder(razorpayOrderId: string): Promise<Record<string, unknown>> {
  const razorpayKeyId = process.env.RAZORPAY_KEY_ID || '';
  const razorpaySecret = process.env.RAZORPAY_KEY_SECRET || '';

  const response = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(razorpayOrderId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${Buffer.from(`${razorpayKeyId}:${razorpaySecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  const payload = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    const errorDescription =
      typeof payload?.error === 'object' && payload.error && 'description' in payload.error
        ? String((payload.error as { description?: string }).description || 'Failed to fetch payment order')
        : 'Failed to fetch payment order';
    throw new Error(errorDescription);
  }

  return payload;
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
    const requestedPlan = String(body?.plan || '').trim().toLowerCase();

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return NextResponse.json({ error: 'Missing payment verification fields' }, { status: 400 });
    }

    const razorpayKeyId = process.env.RAZORPAY_KEY_ID || '';
    const razorpaySecret = process.env.RAZORPAY_KEY_SECRET || '';
    if (!razorpayKeyId || !razorpaySecret) {
      return NextResponse.json({ error: 'Payment gateway is not configured' }, { status: 500 });
    }

    const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
    const expectedSignature = crypto.createHmac('sha256', razorpaySecret).update(payload).digest('hex');

    if (!secureCompare(expectedSignature, razorpaySignature)) {
      return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
    }

    const razorpayOrder = await fetchRazorpayOrder(razorpayOrderId);
    const paidAmountPaise = Number(razorpayOrder.amount || 0);
    const selectedPlan = resolvePlanFromAmountPaise(paidAmountPaise);

    if (!selectedPlan) {
      return NextResponse.json({ error: 'Unsupported payment amount for available plans' }, { status: 400 });
    }

    const orderNotes = (razorpayOrder.notes || {}) as Record<string, unknown>;
    const orderRestaurantId = String(orderNotes.restaurantId || '').trim();
    if (orderRestaurantId && orderRestaurantId !== restaurantId) {
      return NextResponse.json({ error: 'Order does not belong to this restaurant account' }, { status: 403 });
    }

    const now = new Date();
    const expiresAtDate = addDays(now, 30);
    const subscriptionStartDate = now.toISOString().slice(0, 10);
    const planExpiresAt = expiresAtDate.toISOString();
    const subscriptionEndDate = planExpiresAt.slice(0, 10);
    const paidAmountInr = Math.round(paidAmountPaise / 100);

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
        requested_plan: isUpgradablePlan(requestedPlan) ? requestedPlan : null,
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
