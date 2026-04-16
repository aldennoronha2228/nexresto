import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { PLAN_PRICES, type UpgradablePlan } from '@/lib/pricing';
import { verifyPaymentSessionToken } from '@/lib/payment-session';

type OrderRequestBody = {
  plan?: string;
};

function isUpgradablePlan(plan: string): plan is UpgradablePlan {
  return plan === 'starter' || plan === 'growth';
}

function getRestaurantIdFromClaims(claims: Record<string, unknown>): string {
  const restaurantId = String(claims.restaurant_id || claims.tenant_id || '').trim();
  return restaurantId;
}

function buildRazorpayReceipt(restaurantId: string): string {
  const maxLength = 40;
  const timestamp = Date.now().toString(36);
  const prefix = 'nx';
  const normalizedRestaurantId = restaurantId.toLowerCase().replace(/[^a-z0-9]/g, '') || 'rest';
  const separatorLength = 2;
  const staticLength = prefix.length + separatorLength + timestamp.length;
  const maxRestaurantPartLength = Math.max(1, maxLength - staticLength);
  const restaurantPart = normalizedRestaurantId.slice(0, maxRestaurantPartLength);
  return `${prefix}_${restaurantPart}_${timestamp}`;
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    const body = (await request.json()) as OrderRequestBody;
    const requestedPlan = String(body?.plan || '').trim().toLowerCase();

    if (!isUpgradablePlan(requestedPlan)) {
      return NextResponse.json({ error: 'Invalid plan selected' }, { status: 400 });
    }

    const bearerToken = authHeader.replace('Bearer ', '').trim();

    let restaurantId = '';
    let sessionPlan: UpgradablePlan | null = null;

    try {
      const decoded = await adminAuth.verifyIdToken(bearerToken);
      restaurantId = getRestaurantIdFromClaims(decoded as unknown as Record<string, unknown>);
    } catch {
      const sessionPayload = verifyPaymentSessionToken(bearerToken);
      if (!sessionPayload) {
        return NextResponse.json({ error: 'Invalid authorization token' }, { status: 401 });
      }

      restaurantId = sessionPayload.restaurantId;
      sessionPlan = sessionPayload.plan;
    }

    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant context not found' }, { status: 403 });
    }

    if (sessionPlan && sessionPlan !== requestedPlan) {
      return NextResponse.json({ error: 'Plan mismatch for external payment session' }, { status: 400 });
    }

    const razorpayKeyId = process.env.RAZORPAY_KEY_ID || '';
    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || '';

    if (!razorpayKeyId || !razorpayKeySecret) {
      return NextResponse.json({ error: 'Payment gateway is not configured' }, { status: 500 });
    }

    const amount = PLAN_PRICES[requestedPlan] * 100;

    const razorpayResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount,
        currency: 'INR',
        receipt: buildRazorpayReceipt(restaurantId),
        notes: {
          restaurantId,
          plan: requestedPlan,
        },
      }),
      cache: 'no-store',
    });

    const orderPayload = (await razorpayResponse.json()) as Record<string, unknown>;

    if (!razorpayResponse.ok) {
      const errorMessage =
        typeof orderPayload?.error === 'object' && orderPayload.error && 'description' in orderPayload.error
          ? String((orderPayload.error as { description?: string }).description || 'Failed to create payment order')
          : 'Failed to create payment order';
      return NextResponse.json({ error: errorMessage }, { status: razorpayResponse.status });
    }

    return NextResponse.json({
      order: orderPayload,
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || razorpayKeyId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to create order';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
