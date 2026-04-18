import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { createPaymentSessionToken } from '@/lib/payment-session';
import type { UpgradablePlan } from '@/lib/pricing';

type ExternalLinkBody = {
  plan?: string;
};

function isUpgradablePlan(plan: string): plan is UpgradablePlan {
  return plan === 'starter' || plan === 'growth';
}

function getRestaurantIdFromClaims(claims: Record<string, unknown>): string {
  return String(claims.restaurant_id || claims.tenant_id || '').trim();
}

function getBaseUrl(request: NextRequest): string {
  const envBase = String(process.env.NEXT_PUBLIC_APP_URL || '').trim();
  if (envBase.startsWith('https://')) return envBase.replace(/\/$/, '');

  const requestOrigin = request.nextUrl.origin;
  if (requestOrigin.startsWith('https://')) return requestOrigin;

  throw new Error('NEXT_PUBLIC_APP_URL must be HTTPS for external payment redirects');
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

    const body = (await request.json()) as ExternalLinkBody;
    const requestedPlan = String(body?.plan || '').trim().toLowerCase();
    if (!isUpgradablePlan(requestedPlan)) {
      return NextResponse.json({ error: 'Invalid plan selected' }, { status: 400 });
    }

    const token = createPaymentSessionToken({
      uid: decoded.uid,
      restaurantId,
      plan: requestedPlan,
      exp: Math.floor(Date.now() / 1000) + 15 * 60,
    });

    const baseUrl = getBaseUrl(request);
    const payUrl = `${baseUrl}/pay?plan=${encodeURIComponent(requestedPlan)}&pt=${encodeURIComponent(token)}`;

    return NextResponse.json({ url: payUrl });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to create external payment link';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
