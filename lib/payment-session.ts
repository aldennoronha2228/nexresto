import 'server-only';
import crypto from 'crypto';
import type { UpgradablePlan } from './pricing';

export type PaymentSessionPayload = {
  uid: string;
  restaurantId: string;
  plan: UpgradablePlan;
  exp: number;
};

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function getPaymentSessionSecret(): string {
  const secret = String(
    process.env.PAYMENT_LINK_SECRET || process.env.NEXTAUTH_SECRET || process.env.RAZORPAY_KEY_SECRET || ''
  ).trim();

  if (!secret) {
    throw new Error('Missing PAYMENT_LINK_SECRET for external payment session tokens');
  }

  return secret;
}

export function createPaymentSessionToken(payload: PaymentSessionPayload): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const message = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac('sha256', getPaymentSessionSecret()).update(message).digest('base64url');
  return `${message}.${signature}`;
}

export function verifyPaymentSessionToken(token: string): PaymentSessionPayload | null {
  try {
    const [encodedHeader, encodedPayload, signature] = String(token || '').split('.');
    if (!encodedHeader || !encodedPayload || !signature) return null;

    const message = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = crypto.createHmac('sha256', getPaymentSessionSecret()).update(message).digest('base64url');

    const sigA = Buffer.from(signature);
    const sigB = Buffer.from(expectedSignature);
    if (sigA.length !== sigB.length || !crypto.timingSafeEqual(sigA, sigB)) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as PaymentSessionPayload;
    if (!payload?.uid || !payload?.restaurantId || !payload?.plan || !payload?.exp) {
      return null;
    }

    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    if (payload.plan !== 'starter' && payload.plan !== 'growth') {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
