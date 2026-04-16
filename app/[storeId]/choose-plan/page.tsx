'use client';

import Link from 'next/link';
import { Playfair_Display, Manrope } from 'next/font/google';
import { useParams } from 'next/navigation';
import PricingCheckoutButton from '@/components/pricing/PricingCheckoutButton';

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
});

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
});

export default function ChoosePlanPage() {
  const params = useParams<{ storeId: string }>();
  const storeId = params?.storeId || '';

  return (
    <div className={`${manrope.className} min-h-screen bg-[#131313] text-[#e5e2e1]`}>
      <header className="fixed top-0 z-50 w-full border-b border-white/5 bg-black/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <img
              alt="NexResto logo mark"
              className="h-9 w-9 rounded-xl border border-white/15 bg-black/30 p-1"
              src="/nexresto-mark.svg?v=20260415a"
            />
            <span className="text-xl font-bold tracking-tight text-white">NexResto</span>
          </div>

          <Link
            className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
            href={storeId ? `/${storeId}` : '/'}
          >
            Back
          </Link>
        </div>
      </header>

      <main
        className="pt-24 lg:pt-28"
        style={{
          background:
            'radial-gradient(60rem 32rem at 8% 6%, rgba(62, 84, 211, 0.2), transparent 60%), radial-gradient(44rem 28rem at 92% 10%, rgba(16, 185, 129, 0.12), transparent 60%), #131313',
        }}
      >
        <section className="px-6 pb-10 pt-10 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#bbc3ff]">Subscription Required</p>
            <h1 className={`${playfair.className} mt-4 text-4xl font-semibold leading-[1.02] tracking-[-0.015em] text-white sm:text-5xl`}>
              Your Free Trial Has Ended
            </h1>
            <p className="mx-auto mt-5 max-w-3xl text-base font-medium leading-relaxed text-[#bcc2d3] sm:text-xl">
              Choose a plan to continue using NexResto. Payment activates your account instantly for 30 days.
            </p>
          </div>
        </section>

        <section className="px-6 pb-20 lg:px-8">
          <div className="mx-auto grid w-full max-w-6xl gap-5 md:grid-cols-2 xl:grid-cols-3">
            <article className="relative rounded-2xl border border-white/10 bg-[#1b1b1b] p-6">
              <h2 className={`${playfair.className} text-[2.05rem] font-semibold leading-[1.02] tracking-[-0.01em] text-[#f5f4f2]`}>Starter</h2>
              <p className="mt-1.5 text-[15px] font-medium text-[#9ca7ba]">Up to 15 tables</p>
              <p className="tabular-nums mt-6 text-[clamp(2rem,4vw,3rem)] font-semibold leading-none tracking-[-0.015em] text-white">Rs 999</p>
              <p className="mt-2 text-base font-medium text-[#9ca7ba]">/ month</p>
              <PricingCheckoutButton
                planName="Starter"
                planKey="starter"
                ctaLabel="Start with Starter"
                isAvailable
              />
            </article>

            <article className="relative rounded-2xl border border-[#3e54d3]/60 bg-[#171823] p-6">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-[#3e54d3] px-4 py-1 text-xs font-semibold tracking-[0.1em] text-[#d8dbff]">
                Most Popular
              </div>
              <h2 className={`${playfair.className} text-[2.05rem] font-semibold leading-[1.02] tracking-[-0.01em] text-[#f5f4f2]`}>Growth</h2>
              <p className="mt-1.5 text-[15px] font-medium text-[#9ca7ba]">Unlimited tables · AI powered</p>
              <p className="tabular-nums mt-6 text-[clamp(2rem,4vw,3rem)] font-semibold leading-none tracking-[-0.015em] text-white">Rs 2,499</p>
              <p className="mt-2 text-base font-medium text-[#9ca7ba]">/ month</p>
              <PricingCheckoutButton
                planName="Growth"
                planKey="growth"
                ctaLabel="Choose Growth"
                isAvailable
                isFeatured
              />
            </article>

            <article className="relative rounded-2xl border border-white/10 bg-[#1b1b1b] p-6 opacity-80">
              <h2 className={`${playfair.className} text-[2.05rem] font-semibold leading-[1.02] tracking-[-0.01em] text-[#f5f4f2]`}>Pro Chain</h2>
              <p className="mt-1.5 text-[15px] font-medium text-[#9ca7ba]">Up to 5 branches</p>
              <p className="tabular-nums mt-6 text-[clamp(2rem,4vw,3rem)] font-semibold leading-none tracking-[-0.015em] text-white">Rs 7,999</p>
              <p className="mt-2 text-base font-medium text-[#9ca7ba]">/ month</p>
              <PricingCheckoutButton
                planName="Pro Chain"
                planKey="pro"
                ctaLabel="Coming Soon"
                isAvailable={false}
              />
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}
