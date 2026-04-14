import Link from "next/link";
import { Playfair_Display, Manrope } from "next/font/google";
import { FEATURE_MATRIX, PRICING_PLANS } from "@/lib/pricing";
import { adminFirestore, isFirebaseAdminAvailable } from "@/lib/firebase-admin";

const SUBSCRIPTION_TIER_SETTINGS_DOC = 'platform_settings/subscription_tiers';

type TierKey = 'starter' | 'growth' | 'pro_chain';
type TierAvailability = Record<TierKey, boolean>;

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

function FeatureCell({ value }: { value: boolean }) {
  if (!value) {
    return <span className="text-slate-500">-</span>;
  }

  return <span className="font-semibold text-emerald-300">Yes</span>;
}

function mapPlanNameToTierKey(planName: string): TierKey {
  if (planName === 'Growth') return 'growth';
  if (planName === 'Pro Chain') return 'pro_chain';
  return 'starter';
}

async function getTierAvailability(): Promise<TierAvailability> {
  const defaults: TierAvailability = {
    starter: true,
    growth: true,
    pro_chain: true,
  };

  if (!isFirebaseAdminAvailable()) {
    return defaults;
  }

  try {
    const snap = await adminFirestore.doc(SUBSCRIPTION_TIER_SETTINGS_DOC).get();
    if (!snap.exists) return defaults;

    const data = snap.data() as { tiers?: Record<string, unknown> } | undefined;
    const tiers = (data?.tiers || {}) as Record<string, { available?: unknown }>;

    return {
      starter: typeof tiers?.starter?.available === 'boolean' ? Boolean(tiers.starter.available) : defaults.starter,
      growth: typeof tiers?.growth?.available === 'boolean' ? Boolean(tiers.growth.available) : defaults.growth,
      pro_chain: typeof tiers?.pro_chain?.available === 'boolean' ? Boolean(tiers.pro_chain.available) : defaults.pro_chain,
    };
  } catch {
    return defaults;
  }
}

export default async function PricingPage() {
  const tierAvailability = await getTierAvailability();

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

          <nav className="hidden items-center gap-6 text-sm text-stone-300 md:flex">
            <Link className="transition-colors hover:text-white" href="/">Home</Link>
            <Link className="transition-colors text-white" href="/pricing">Pricing</Link>
            <Link className="transition-colors hover:text-white" href="/roi">ROI</Link>
            <Link className="transition-colors hover:text-white" href="/#demo-request">Demo</Link>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10 sm:px-4 sm:py-2 sm:text-sm"
              href="/login"
            >
              Login
            </Link>
            <Link
              className="rounded-full bg-[#3e54d3] px-4 py-1.5 text-xs font-semibold text-[#d8dbff] transition hover:opacity-90 sm:px-5 sm:py-2 sm:text-sm"
              href="/#demo-request"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main
        className="pt-24 lg:pt-28"
        style={{
          background:
            "radial-gradient(60rem 32rem at 8% 6%, rgba(62, 84, 211, 0.2), transparent 60%), radial-gradient(44rem 28rem at 92% 10%, rgba(16, 185, 129, 0.12), transparent 60%), #131313",
        }}
      >
        <section className="px-6 pb-16 pt-10 lg:px-8 lg:pb-20">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#bbc3ff]">Pricing</p>
            <h1 className={`${playfair.className} mt-4 text-4xl font-semibold leading-[1.02] tracking-[-0.015em] text-white sm:text-5xl lg:text-6xl`}>
              Transparent Pricing. No Surprises.
            </h1>
            <p className="mx-auto mt-5 max-w-3xl text-base font-medium leading-relaxed text-[#bcc2d3] sm:text-xl">
              Monthly. Cancel anytime. No annual lock-in. No per-order commission.
            </p>
          </div>
        </section>

        <section className="px-6 pb-20 lg:px-8">
          <div className="mx-auto grid w-full max-w-6xl gap-5 md:grid-cols-2 xl:grid-cols-3">
            {PRICING_PLANS.map((plan) => {
              const tierKey = mapPlanNameToTierKey(plan.name);
              const isAvailable = tierAvailability[tierKey];

              return (
              <article
                className={`relative rounded-2xl border p-6 ${
                  plan.featured ? "border-[#3e54d3]/60 bg-[#171823]" : "border-white/10 bg-[#1b1b1b]"
                } ${!isAvailable ? 'opacity-80' : ''}`}
                key={plan.name}
              >
                {plan.featured && isAvailable && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-[#3e54d3] px-4 py-1 text-xs font-semibold tracking-[0.1em] text-[#d8dbff]">
                    Most Popular
                  </div>
                )}

                <h2 className={`${playfair.className} text-[2.05rem] font-semibold leading-[1.02] tracking-[-0.01em] text-[#f5f4f2]`}>{plan.name}</h2>
                <p className="mt-1.5 text-[15px] font-medium text-[#9ca7ba]">{plan.subtitle}</p>

                <p className="tabular-nums mt-6 text-[clamp(2rem,4vw,3rem)] font-semibold leading-none tracking-[-0.015em] text-white">
                  {plan.priceInr}
                </p>
                {plan.priceUsd && <p className="mt-2 text-base font-medium text-[#9ca7ba]">{plan.priceUsd}</p>}

                <p className="mt-7 text-sm font-semibold uppercase tracking-[0.08em] text-emerald-300">{plan.detailTitle}</p>
                <ul className="mt-3.5 space-y-2.5 text-[0.97rem] leading-snug text-[#c5c5d6]">
                  {plan.details.map((detail) => (
                    <li className="flex items-start gap-3" key={detail}>
                      <span className="mt-0.5 text-base font-bold text-emerald-300">✓</span>
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>

                <button
                  disabled={!isAvailable}
                  className={`mt-8 w-full rounded-full border px-5 py-2.5 text-base font-semibold tracking-[0.02em] transition ${
                    !isAvailable
                      ? "cursor-not-allowed border-amber-400/25 bg-amber-500/10 text-amber-300"
                      : plan.featured
                      ? "border-[#3e54d3] bg-[#3e54d3] text-[#d8dbff] hover:opacity-90"
                      : "border-white/20 bg-transparent text-white hover:bg-white/10"
                  }`}
                  type="button"
                >
                  {isAvailable ? plan.cta : 'Temporarily unavailable'}
                </button>
              </article>
            )})}
          </div>
        </section>

        <section className="px-6 pb-24 lg:px-8">
          <div className="mx-auto max-w-7xl text-center">
            <h2 className={`${playfair.className} text-4xl font-semibold leading-tight tracking-[-0.01em] text-white sm:text-5xl`}>Full Feature Comparison</h2>
            <p className="mt-3 text-base font-medium text-[#c5c5d6] sm:text-xl">Every feature across every plan - see exactly what you get.</p>
          </div>

          <div className="mx-auto mt-10 max-w-7xl overflow-x-auto rounded-2xl border border-white/10 bg-[#1b1b1b]">
            <table className="w-full min-w-[860px] border-collapse text-left">
              <thead>
                <tr className="bg-[#20201f]">
                  <th className="px-5 py-4 text-[17px] font-semibold tracking-[0.01em] text-white">Feature</th>
                  <th className="px-5 py-4 text-center text-[17px] font-semibold tracking-[0.01em] text-[#8f8fa0]">Starter</th>
                  <th className="bg-[#212338] px-5 py-4 text-center text-[17px] font-semibold tracking-[0.01em] text-[#bbc3ff]">Growth</th>
                  <th className="px-5 py-4 text-center text-[17px] font-semibold tracking-[0.01em] text-[#8f8fa0]">Pro Chain</th>
                </tr>
              </thead>
              <tbody>
                {FEATURE_MATRIX.map((row, index) => (
                  <tr className={index % 2 === 0 ? "bg-[#1b1b1b]" : "bg-[#1f1f1f]"} key={row.feature}>
                    <td className="border-t border-white/10 px-5 py-4 text-[15px] font-medium text-[#c5c5d6]">{row.feature}</td>
                    <td className="border-t border-white/10 px-5 py-4 text-center text-base"><FeatureCell value={row.starter} /></td>
                    <td className="border-t border-white/10 bg-[#1f2234] px-5 py-4 text-center text-base"><FeatureCell value={row.growth} /></td>
                    <td className="border-t border-white/10 px-5 py-4 text-center text-base"><FeatureCell value={row.pro} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 bg-black/60">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-12 md:grid-cols-4 lg:px-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2">
              <img
                alt="NexResto logo mark"
                className="h-7 w-7 rounded-md border border-white/15 bg-black/30 p-1"
                src="/nexresto-mark.svg?v=20260415a"
              />
              <p className="text-lg font-bold text-white">NexResto</p>
            </div>
            <p className="mt-3 max-w-sm text-sm text-stone-400">Crafting the digital future of premium dining operations.</p>
          </div>
          <div>
            <p className="mb-3 text-sm font-medium text-white">Company</p>
            <div className="space-y-2 text-sm text-stone-400">
              <Link className="block hover:text-emerald-400" href="/#platform">Platform</Link>
              <Link className="block hover:text-emerald-400" href="/#features">Features</Link>
              <Link className="block hover:text-emerald-400" href="/pricing">Pricing</Link>
              <Link className="block hover:text-emerald-400" href="/roi">ROI</Link>
              <Link className="block hover:text-emerald-400" href="/#demo-request">Demo</Link>
            </div>
          </div>
          <div>
            <p className="mb-3 text-sm font-medium text-white">Legal</p>
            <div className="space-y-2 text-sm text-stone-400">
              <Link className="block hover:text-emerald-400" href="/privacy">Privacy</Link>
              <Link className="block hover:text-emerald-400" href="/terms">Terms</Link>
            </div>
          </div>
        </div>
        <div className="mx-auto flex max-w-7xl px-6 pb-6 lg:px-8">
          <Link
            className="inline-flex items-center gap-2 rounded-lg border border-[#3e54d3]/60 bg-[#3e54d3]/20 px-5 py-2.5 text-sm font-semibold text-[#d8dbff] transition hover:bg-[#3e54d3]/30"
            href="/download"
          >
            Download App
            <span aria-hidden="true">-&gt;</span>
          </Link>
        </div>
        <div className="mx-auto max-w-7xl px-6 pb-10 text-sm text-stone-500 lg:px-8">(c) 2026 NexResto. Premium Dining Experience.</div>
      </footer>

    </div>
  );
}
