'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { PLAN_PRICES, type UpgradablePlan } from '@/lib/pricing';

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
  prefill?: {
    name?: string;
    email?: string;
  };
  notes?: Record<string, string>;
  theme?: {
    color?: string;
  };
  modal?: {
    ondismiss?: () => void;
  };
};

type RazorpayInstance = {
  open: () => void;
  on: (event: string, callback: (response: { error?: { description?: string } }) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

type Props = {
  planName: string;
  planKey: 'starter' | 'growth' | 'pro';
  ctaLabel: string;
  isFeatured?: boolean;
  isAvailable?: boolean;
};

export default function PricingCheckoutButton({
  planName,
  planKey,
  ctaLabel,
  isFeatured = false,
  isAvailable = true,
}: Props) {
  const router = useRouter();
  const { user, tenantId, refreshTenant } = useAuth();
  const [activePlan, setActivePlan] = useState<UpgradablePlan | null>(null);
  const [isRazorpayReady, setRazorpayReady] = useState(false);

  useEffect(() => {
    if (window.Razorpay) {
      setRazorpayReady(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => setRazorpayReady(true);
    script.onerror = () => setRazorpayReady(false);
    document.body.appendChild(script);

    return () => {
      script.onload = null;
      script.onerror = null;
    };
  }, []);

  const isComingSoon = planKey === 'pro';
  const isDisabled = isComingSoon || !isAvailable || !isRazorpayReady;
  const isProcessing = activePlan !== null;

  const buttonClassName = useMemo(
    () =>
      `mt-8 w-full rounded-full border px-5 py-2.5 text-base font-semibold tracking-[0.02em] transition ${
        isDisabled
          ? 'cursor-not-allowed border-amber-400/25 bg-amber-500/10 text-amber-300'
          : isFeatured
          ? 'border-[#3e54d3] bg-[#3e54d3] text-[#d8dbff] hover:opacity-90'
          : 'border-white/20 bg-transparent text-white hover:bg-white/10'
      }`,
    [isDisabled, isFeatured]
  );

  const handleUpgrade = async (plan: UpgradablePlan) => {
    if (isProcessing) return;

    if (!user) {
      toast.error('Please log in to upgrade your plan.');
      router.push('/login');
      return;
    }

    if (!window.Razorpay) {
      toast.error('Payment SDK failed to load. Please refresh and try again.');
      return;
    }

    setActivePlan(plan);

    try {
      const idToken = await user.getIdToken();

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

      await new Promise<void>((resolve, reject) => {
        const razorpay = new window.Razorpay!({
          key: gatewayKey,
          amount: orderPayload.order!.amount,
          currency: orderPayload.order!.currency,
          name: 'NexResto',
          description: `${planName} Plan Subscription`,
          order_id: orderPayload.order!.id,
          theme: { color: '#3e54d3' },
          handler: async (response: RazorpaySuccessResponse) => {
            try {
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
                error?: string;
                success?: boolean;
                restaurantId?: string;
              };

              if (!verifyRes.ok || !verifyPayload?.success) {
                throw new Error(verifyPayload?.error || 'Payment verification failed');
              }

              await refreshTenant();
              toast.success('✅ Plan upgraded successfully');
              const dashboardTenant = verifyPayload.restaurantId || tenantId;
              router.push(dashboardTenant ? `/${dashboardTenant}/dashboard` : '/login');
              resolve();
            } catch (error) {
              reject(error);
            }
          },
          modal: {
            ondismiss: () => reject(new Error('Payment cancelled by user')),
          },
          notes: {
            plan,
            amount: String(PLAN_PRICES[plan]),
          },
        });

        razorpay.on('payment.failed', (response) => {
          const message = response?.error?.description || 'Payment failed. Please try again.';
          reject(new Error(message));
        });

        razorpay.open();
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to process payment';
      toast.error(message);
    } finally {
      setActivePlan(null);
    }
  };

  const displayLabel = isComingSoon
    ? 'Coming Soon'
    : !isAvailable
    ? 'Temporarily unavailable'
    : ctaLabel;

  if (isComingSoon) {
    return (
      <button disabled className={buttonClassName} type="button">
        {displayLabel}
      </button>
    );
  }

  const upgradablePlan = planKey as UpgradablePlan;

  return (
    <button
      className={buttonClassName}
      disabled={isDisabled || isProcessing}
      onClick={() => handleUpgrade(upgradablePlan)}
      type="button"
    >
      {isProcessing && activePlan === upgradablePlan ? 'Processing...' : displayLabel}
    </button>
  );
}
