'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { isWebView } from '@/lib/isWebView';
import { openExternalBrowser } from '@/lib/openExternalBrowser';
import type { UpgradablePlan } from '@/lib/pricing';

type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
};

type RazorpaySuccessResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpaySuccessResponse) => void;
  theme?: { color?: string };
  modal?: { ondismiss?: () => void };
  notes?: Record<string, string>;
};

type RazorpayInstance = {
  open: () => void;
  on: (event: string, callback: (response: { error?: { description?: string } }) => void) => void;
};

const PAYMENT_CANCELLED_ERROR = 'PAYMENT_CANCELLED_BY_USER';
const WEBVIEW_REDIRECT_KEY = 'nexresto_pay_external_redirect_attempted';

function normalizePlan(raw: string | null): UpgradablePlan | null {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'starter' || value === 'growth') return value;
  return null;
}

function getHttpsBaseUrl(): string {
  const envBase = String(process.env.NEXT_PUBLIC_APP_URL || '').trim();
  if (envBase.startsWith('https://')) return envBase.replace(/\/$/, '');

  if (typeof window !== 'undefined' && window.location.origin.startsWith('https://')) {
    return window.location.origin;
  }

  return '';
}

function dashboardRedirectUrl(restaurantId?: string): string {
  const safeRestaurantId = String(restaurantId || '').trim();
  if (safeRestaurantId) {
    return `/${encodeURIComponent(safeRestaurantId)}/dashboard?payment=success`;
  }

  return '/login?payment=success';
}

export default function PayPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const [statusText, setStatusText] = useState('Preparing secure payment...');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [showManualExternalOpen, setShowManualExternalOpen] = useState(false);

  const plan = useMemo(() => normalizePlan(searchParams.get('plan')), [searchParams]);

  useEffect(() => {
    if (!plan) {
      setErrorText('Invalid plan selected.');
      return;
    }

    if (isWebView()) {
      const base = getHttpsBaseUrl();
      if (!base) {
        setErrorText('HTTPS domain is required for secure payment redirect.');
        return;
      }

      const fullUrl = `${base}/pay?plan=${encodeURIComponent(plan)}`;

      // Prevent redirect loops when a WebView cannot hand off to external browser.
      const redirectFingerprint = `${plan}@${fullUrl}`;
      const previousAttempt = typeof window !== 'undefined'
        ? sessionStorage.getItem(WEBVIEW_REDIRECT_KEY)
        : null;

      if (previousAttempt !== redirectFingerprint) {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(WEBVIEW_REDIRECT_KEY, redirectFingerprint);
        }
        setStatusText('Redirecting to secure payment...');
        openExternalBrowser(fullUrl);
        setShowManualExternalOpen(true);
        return;
      }

      setStatusText('Unable to open external browser automatically. Tap the button below.');
      setShowManualExternalOpen(true);
      return;
    }

    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(WEBVIEW_REDIRECT_KEY);
    }

    let cancelled = false;

    const loadRazorpayScript = async () => {
      if (window.Razorpay) return;

      await new Promise<void>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay="true"]');
        if (existing) {
          if (window.Razorpay) resolve();
          existing.addEventListener('load', () => resolve(), { once: true });
          existing.addEventListener('error', () => reject(new Error('Failed to load Razorpay SDK')), { once: true });
          return;
        }

        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        script.dataset.razorpay = 'true';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Razorpay SDK'));
        document.body.appendChild(script);
      });
    };

    const runCheckout = async () => {
      try {
        if (!user) {
          setStatusText('Redirecting to login...');
          router.replace(`/login?next=${encodeURIComponent(`/pay?plan=${plan}`)}`);
          return;
        }

        const base = getHttpsBaseUrl();
        if (!base) {
          throw new Error('HTTPS domain is required for secure payment. Set NEXT_PUBLIC_APP_URL.');
        }

        setStatusText('Loading payment gateway...');
        await loadRazorpayScript();

        const idToken = await user.getIdToken();

        setStatusText('Creating secure payment order...');
        const orderRes = await fetch('/api/payment/order', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ plan }),
        });

        const orderPayload = (await orderRes.json()) as {
          error?: string;
          order?: RazorpayOrder;
          keyId?: string;
        };

        if (!orderRes.ok || !orderPayload?.order?.id) {
          throw new Error(orderPayload?.error || 'Failed to create payment order');
        }

        const gatewayKey = String(orderPayload.keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '').trim();
        if (!gatewayKey) {
          throw new Error('Missing Razorpay public key');
        }

        const RazorpayCtor = (window as Window & { Razorpay?: new (options: RazorpayOptions) => RazorpayInstance }).Razorpay;
        if (!RazorpayCtor) {
          throw new Error('Payment SDK unavailable');
        }

        setStatusText('Opening secure checkout...');

        await new Promise<void>((resolve, reject) => {
          const razorpay = new RazorpayCtor({
            key: gatewayKey,
            amount: orderPayload.order!.amount,
            currency: orderPayload.order!.currency,
            name: 'NexResto',
            description: `${plan === 'starter' ? 'Starter' : 'Growth'} Plan Subscription`,
            order_id: orderPayload.order!.id,
            theme: { color: '#3e54d3' },
            notes: { plan },
            modal: {
              ondismiss: () => reject(new Error(PAYMENT_CANCELLED_ERROR)),
            },
            handler: async (response: RazorpaySuccessResponse) => {
              try {
                setStatusText('Verifying payment...');

                const verifyRes = await fetch('/api/payment/verify', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                  },
                  body: JSON.stringify({
                    razorpay_order_id: response.razorpay_order_id,
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_signature: response.razorpay_signature,
                    plan,
                  }),
                });

                const verifyPayload = (await verifyRes.json()) as {
                  success?: boolean;
                  error?: string;
                  restaurantId?: string;
                };

                if (!verifyRes.ok || !verifyPayload?.success) {
                  throw new Error(verifyPayload?.error || 'Payment verification failed');
                }

                setStatusText('Payment successful. Redirecting...');
                router.replace(dashboardRedirectUrl(verifyPayload.restaurantId));
                resolve();
              } catch (error) {
                reject(error);
              }
            },
          });

          razorpay.on('payment.failed', (response) => {
            const message = response?.error?.description || 'Payment failed. Please try again.';
            reject(new Error(message));
          });

          razorpay.open();
        });
      } catch (error) {
        if (cancelled) return;

        const message = error instanceof Error ? error.message : 'Unable to process payment.';
        if (message === PAYMENT_CANCELLED_ERROR) {
          setStatusText('Payment was cancelled.');
          toast.error('Payment cancelled by user.');
          return;
        }

        setErrorText(message);
        toast.error(message);
      }
    };

    runCheckout();

    return () => {
      cancelled = true;
    };
  }, [plan, router, user]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#131313] text-[#e5e2e1] px-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/40 p-6 text-center">
        <div className="mx-auto mb-4 w-12 h-12 rounded-full border border-white/20 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
        <h1 className="text-xl font-semibold text-white">Secure Payment</h1>
        <p className="mt-3 text-sm text-[#bcc2d3]">{statusText}</p>
        {showManualExternalOpen && plan && (
          <button
            className="mt-4 inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
            onClick={() => {
              const base = getHttpsBaseUrl();
              if (!base) return;
              const fullUrl = `${base}/pay?plan=${encodeURIComponent(plan)}`;
              openExternalBrowser(fullUrl);
            }}
            type="button"
          >
            Open Secure Payment
          </button>
        )}
        {errorText && <p className="mt-4 text-sm text-rose-300">{errorText}</p>}
      </div>
    </div>
  );
}
