'use client';

import { useMemo, useRef, useState } from 'react';
import React from 'react';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { motion, useScroll, useTransform, AnimatePresence } from 'motion/react';
import { ArrowRight, BarChart3, CheckCircle2, ClipboardList, QrCode, ShieldCheck, Sparkles, UtensilsCrossed, Zap } from 'lucide-react';
import { GlowingEffect } from '../components/ui/glowing-effect';

const SCENE_URL = process.env.NEXT_PUBLIC_SPLINE_SCENE_URL || 'https://prod.spline.design/6Wq1Q7YGyM-iab9i/scene.splinecode';
const MOBILE_GLOW_WEBP =
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1800&q=90&fm=webp';

const FEATURE_CARDS = [
  {
    title: 'Live QR Ordering',
    body: 'Launch table-linked menus instantly and reduce ordering friction.',
    icon: QrCode,
  },
  {
    title: 'AI Floor Intelligence',
    body: 'Auto-detect and refine floor layouts with interactive 2D/3D review.',
    icon: Sparkles,
  },
  {
    title: 'Secure Multi-Tenant',
    body: 'Each hotel keeps isolated data with role-aware access control.',
    icon: ShieldCheck,
  },
  {
    title: 'Fast Operator UX',
    body: 'Mobile-first workflows designed for owners and staff on the move.',
    icon: Zap,
  },
];

const METRICS = [
  { label: 'Avg. Table Turn Lift', value: '23%' },
  { label: 'Setup Time', value: '< 15 min' },
  { label: 'Live Venues', value: '1.2k+' },
  { label: 'QR Scans / Month', value: '3.8M' },
];

const TESTIMONIALS = [
  {
    name: 'Arjun M.',
    role: 'Cafe Owner, Pune',
    quote: 'The glow and speed are not just visual. My staff learned this in one evening and table confusion dropped immediately.',
  },
  {
    name: 'Sana K.',
    role: 'Restaurant Manager, Bengaluru',
    quote: 'The floor review flow feels premium and practical. We redesigned seating in minutes before peak hours.',
  },
  {
    name: 'Rafael D.',
    role: 'Hotel Ops Lead, Goa',
    quote: 'Tenant isolation and quick onboarding mattered most. NexResto gave us both without complex setup.',
  },
];

const FAQS = [
  {
    q: 'Can my staff use this on phone during service?',
    a: 'Yes. The dashboard and QR controls are optimized for mobile workflows, with performance-safe rendering fallbacks.',
  },
  {
    q: 'Do different hotel branches share the same floor plan?',
    a: 'No. Each tenant branch is isolated and keeps its own floor layout, menu, and access rules.',
  },
  {
    q: 'Can I start with a basic setup and scale later?',
    a: 'Yes. Start with core QR and table flow, then enable AI spatial tools and advanced automation as you grow.',
  },
];

const WALKTHROUGH_PANELS = [
  {
    title: 'Sales Analytics',
    subtitle: 'Revenue pulse, hourly peaks, and top-performing items in one glance.',
    stat: '+18% weekly uplift',
    icon: BarChart3,
  },
  {
    title: 'Live Order Tracking',
    subtitle: 'Watch every order state in real time with kitchen-to-table visibility.',
    stat: '42 active orders',
    icon: ClipboardList,
  },
  {
    title: 'Menu Management',
    subtitle: 'Push updates, pricing changes, and availability instantly across devices.',
    stat: '12 items updated',
    icon: UtensilsCrossed,
  },
];

const BASIC_FEATURES = [
  'Static QR Menus',
  'Manual Floor Planner (Drag & Drop)',
  'Basic Sales Analytics',
  '24/7 Support',
];

const PRO_FEATURES = [
  'AI Auto-Layout (Video Scan)',
  'Interactive 3D Floor Plan',
  'Advanced Revenue Prediction',
  'Custom Branding',
  'Multi-device Sync',
];

function GlowButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white px-6 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-200 shadow-[0_0_24px_rgba(148,163,184,0.35)]"
    >
      {children}
    </button>
  );
}

function GlowFeatureItem({ text }: { text: string }) {
  return (
    <motion.li
      initial={{ opacity: 0.55, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.35 }}
      className="flex items-center gap-3 text-sm text-white/80"
    >
      <motion.span
        initial={{ opacity: 0.4, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.4 }}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-sky-200/35 bg-sky-300/10 text-sky-200 shadow-[0_0_14px_rgba(125,211,252,0.45)]"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
      </motion.span>
      {text}
    </motion.li>
  );
}

function GlowLogic() {
  return (
    <GlowingEffect
      spread={40}
      glow={true}
      disabled={false}
      proximity={180}
      inactiveZone={0}
      movementDuration={1.1}
      borderWidth={3}
    />
  );
}

export default function LandingPage() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isProHovered, setIsProHovered] = useState(false);

  const { scrollYProgress } = useScroll({ target: containerRef, offset: ['start start', 'end end'] });
  const sceneLift = useTransform(scrollYProgress, [0, 1], ['0%', '-18%']);
  const sceneScale = useTransform(scrollYProgress, [0, 1], [1, 1.16]);
  const scanY = useTransform(scrollYProgress, [0.08, 0.95], ['4%', '92%']);
  const bentoOpacity = useTransform(scrollYProgress, [0.08, 0.25], [0.3, 1]);
  const bentoGlow = useTransform(scrollYProgress, [0.12, 0.85], [0.2, 0.7]);
  const ribbonOpacity = useTransform(scrollYProgress, [0.14, 0.32], [0.15, 1]);

  const year = useMemo(() => new Date().getFullYear(), []);

  const goToLogin = () => {
    setIsNavigating(true);
    setTimeout(() => {
      router.push('/login');
    }, 460);
  };

  return (
    <div ref={containerRef} className="relative min-h-screen overflow-x-hidden bg-[#03050b] text-white">
      <Script type="module" src="https://unpkg.com/@splinetool/viewer@1.10.29/build/spline-viewer.js" strategy="afterInteractive" />
      <motion.div style={{ y: sceneLift, scale: sceneScale }} className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_15%,rgba(148,163,184,0.14),transparent_42%),radial-gradient(circle_at_78%_22%,rgba(56,189,248,0.12),transparent_45%),radial-gradient(circle_at_55%_80%,rgba(99,102,241,0.11),transparent_45%)]" />
        <div className="absolute -left-24 top-24 h-72 w-72 rounded-full bg-slate-300/10 blur-3xl" />
        <div className="absolute -right-24 bottom-20 h-80 w-80 rounded-full bg-sky-300/10 blur-3xl" />
        <motion.div
          animate={{ opacity: isProHovered ? 0.9 : 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="absolute inset-0 bg-[radial-gradient(circle_at_62%_38%,rgba(163,230,53,0.2),transparent_40%),radial-gradient(circle_at_25%_72%,rgba(132,204,22,0.16),transparent_42%)]"
        />

        <div className="absolute inset-0 hidden md:block">
          {React.createElement('spline-viewer', {
            url: SCENE_URL,
            style: { width: '100%', height: '100%' },
          })}
          <div className="absolute inset-0 bg-gradient-to-b from-[#03050bcc] via-transparent to-[#03050b]" />
        </div>

        <div className="absolute inset-0 md:hidden">
          <img src={MOBILE_GLOW_WEBP} alt="NexResto glow" className="h-full w-full object-cover opacity-60" loading="eager" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#03050b66] via-[#03050bcc] to-[#03050b]" />
        </div>
      </motion.div>

      <header className="fixed inset-x-0 top-5 z-40 flex justify-center px-4">
        <div className="nexo-glow-border flex w-full max-w-3xl items-center justify-between rounded-full border border-white/15 bg-black/20 px-5 py-3 backdrop-blur-md">
          <GlowLogic />
          <div className="text-sm font-semibold tracking-[0.22em] text-white/90">NEXRESTO</div>
          <nav className="hidden items-center gap-7 text-xs text-white/75 md:flex">
            <a href="#features" className="hover:text-white transition">Features</a>
            <a href="#flow" className="hover:text-white transition">Workflow</a>
            <a href="#ready" className="hover:text-white transition">Start</a>
          </nav>
          <GlowButton onClick={goToLogin}>
            Get Started <ArrowRight className="h-4 w-4" />
          </GlowButton>
        </div>
      </header>

      <main className="relative z-10">
        <section className="mx-auto flex min-h-screen max-w-6xl flex-col items-start justify-center px-6 pt-32 md:px-10">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
            <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-slate-200 shadow-[0_0_18px_rgba(148,163,184,0.25)]">
              Pro-Grade Hospitality OS
            </span>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight text-white md:text-6xl">
              Build the next-generation dining journey with AI floor planning and live QR ordering.
            </h1>
            <p className="mt-5 max-w-2xl text-sm text-white/75 md:text-base">
              A cinematic operations layer for modern restaurants: visually map your space, control tables in real time,
              and onboard teams without complexity.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <GlowButton onClick={goToLogin}>
                Get Started <ArrowRight className="h-4 w-4" />
              </GlowButton>
              <div className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/70 shadow-[0_0_16px_rgba(148,163,184,0.2)]">
                Secure Firebase auth gate + tenant isolation
              </div>
            </div>

            <motion.div style={{ opacity: ribbonOpacity }} className="mt-10 grid w-full max-w-4xl grid-cols-2 gap-3 md:grid-cols-4">
              {METRICS.map((item) => (
                <div key={item.label} className="nexo-glow-border rounded-2xl border border-white/10 bg-black/35 px-4 py-4 shadow-[0_0_20px_rgba(148,163,184,0.18)]">
                  <GlowLogic />
                  <p className="text-lg font-semibold text-white">{item.value}</p>
                  <p className="mt-1 text-xs text-white/65">{item.label}</p>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </section>

        <section id="features" className="relative mx-auto max-w-6xl px-6 pb-20 md:px-10">
          <motion.div style={{ opacity: bentoOpacity }} className="nexo-glow-border relative overflow-hidden rounded-3xl border border-white/10 bg-black/35 p-6 backdrop-blur-md md:p-8">
            <GlowLogic />
            <motion.div
              style={{ top: scanY, opacity: bentoGlow }}
              className="pointer-events-none absolute left-0 right-0 h-12 bg-gradient-to-b from-transparent via-white/30 to-transparent blur-xl"
            />

            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-semibold">Neural Ops Bento Grid</h2>
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-slate-200 shadow-[0_0_18px_rgba(148,163,184,0.24)]">
                Pro
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {FEATURE_CARDS.map((card, index) => {
                const Icon = card.icon;
                return (
                  <motion.article
                    key={card.title}
                    initial={{ opacity: 0, y: 25 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-80px' }}
                    transition={{ duration: 0.45, delay: index * 0.08 }}
                    className="min-h-[12rem] list-none"
                  >
                    <div className="relative h-full rounded-[1.25rem] border border-white/10 p-2 md:rounded-[1.5rem] md:p-3">
                      <GlowLogic />
                      <div className="relative flex h-full flex-col justify-between gap-5 overflow-hidden rounded-xl border border-white/10 bg-[#050913]/95 p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.55)]">
                        <div className="mb-1 inline-flex w-fit rounded-xl border border-white/15 bg-white/[0.03] p-2 text-slate-200">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-3xl font-semibold leading-none tracking-[-0.03em] text-white/90 md:text-[2rem] md:leading-none">
                            {card.title}
                          </h3>
                          <p className="mt-3 text-base text-white/55">{card.body}</p>
                        </div>
                      </div>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          </motion.div>
        </section>

        <section id="flow" className="mx-auto max-w-6xl px-6 py-10 md:px-10">
          <div className="grid gap-4 md:grid-cols-3">
            {['Capture', 'Refine', 'Deploy'].map((step, index) => (
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.12 }}
                className="nexo-glow-border rounded-2xl border border-white/10 bg-black/35 p-5"
              >
                <GlowLogic />
                <div className="text-xs uppercase tracking-[0.24em] text-white/45">Step {index + 1}</div>
                <div className="mt-2 text-xl font-semibold">{step}</div>
                <p className="mt-2 text-sm text-white/70">
                  {index === 0 && 'Scan your restaurant layout and detect tables with precision AI.'}
                  {index === 1 && 'Adjust with 2D/3D controls and validate table arrangement quickly.'}
                  {index === 2 && 'Save and launch QR-ready operations for your whole venue.'}
                </p>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-14 md:px-10">
          <div className="nexo-glow-border mb-6 rounded-3xl border border-white/10 bg-black/40 p-6 md:p-8">
            <GlowLogic />
            <h3 className="text-3xl font-semibold leading-tight">Your Entire Restaurant in Your Pocket.</h3>
            <p className="mt-3 max-w-3xl text-sm text-white/70 md:text-base">
              Manage menus, track sales, and optimize floor plans from a single, beautiful dashboard.
            </p>
            <div className="nexo-glow-border mt-5 rounded-2xl border border-white/10 bg-black/40 p-4">
              <GlowLogic />
              <p className="text-xs uppercase tracking-[0.22em] text-white/45">Live Layer</p>
              <p className="mt-2 text-sm text-white/75">Hovering notifications and insights float over core operations to keep owners instantly aware.</p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {WALKTHROUGH_PANELS.map((panel, index) => {
              const Icon = panel.icon;
              return (
                <motion.div
                  key={panel.title}
                  initial={{ opacity: 0, y: 28 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-80px' }}
                  transition={{ duration: 0.5, delay: index * 0.08 }}
                  className="nexo-glow-border relative min-h-[280px] overflow-hidden rounded-3xl border border-white/12 bg-[#05070f]/90 p-5"
                >
                  <GlowLogic />
                  <div className="absolute inset-0 bg-[linear-gradient(to_bottom_right,rgba(148,163,184,0.08),rgba(15,23,42,0.24),rgba(2,6,23,0.8))]" />
                  <div className="relative z-10">
                    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/70">
                      <Icon className="h-3.5 w-3.5 text-sky-200" />
                      {panel.title}
                    </div>

                    <div className="nexo-glow-border rounded-2xl border border-white/10 bg-black/40 p-4">
                      <GlowLogic />
                      <div className="mb-4 grid grid-cols-3 gap-2">
                        <div className="h-14 rounded-xl border border-white/10 bg-white/[0.04]" />
                        <div className="h-14 rounded-xl border border-white/10 bg-white/[0.04]" />
                        <div className="h-14 rounded-xl border border-white/10 bg-white/[0.04]" />
                      </div>
                      <div className="h-20 rounded-xl border border-white/10 bg-gradient-to-r from-white/[0.03] via-slate-300/[0.06] to-white/[0.03]" />
                    </div>

                    <motion.div
                      initial={{ opacity: 0, x: 24 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.25 }}
                      className="absolute right-6 top-16 rounded-xl border border-sky-300/25 bg-sky-300/10 px-3 py-2 text-xs text-sky-100 shadow-[0_0_18px_rgba(125,211,252,0.35)]"
                    >
                      New Order • Table T-07
                    </motion.div>

                    <p className="mt-5 text-lg font-semibold">{panel.stat}</p>
                    <p className="mt-1 text-sm text-white/70">{panel.subtitle}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-8 md:px-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="nexo-glow-border rounded-3xl border border-white/10 bg-black/45 p-6 md:p-8"
          >
            <GlowLogic />
            <p className="text-xs uppercase tracking-[0.24em] text-white/45">The 3D Advantage</p>
            <h3 className="mt-2 text-3xl font-semibold">Spatial Intelligence is your edge.</h3>
            <p className="mt-3 max-w-3xl text-sm text-white/70 md:text-base">
              AI Auto-Layout is the bridge between your physical restaurant and your digital command center. Scan your floor,
              generate a smart arrangement, then refine in interactive 3D before service starts.
            </p>
          </motion.div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-10 md:px-10">
          <div className="nexo-glow-border rounded-3xl border border-white/10 bg-black/45 p-6 md:p-8">
            <GlowLogic />
            <div className="mb-5 flex items-center justify-between gap-4">
              <h3 className="text-2xl font-semibold">Why teams switch to NexResto</h3>
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-slate-200 shadow-[0_0_18px_rgba(148,163,184,0.24)]">
                Electric Workflow
              </span>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {TESTIMONIALS.map((item, index) => (
                <motion.article
                  key={item.name}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, delay: index * 0.08 }}
                  className="nexo-glow-border rounded-2xl border border-white/10 bg-white/[0.04] p-5"
                >
                  <GlowLogic />
                  <p className="text-sm leading-relaxed text-white/80">“{item.quote}”</p>
                  <p className="mt-4 text-sm font-semibold text-white">{item.name}</p>
                  <p className="text-xs text-white/55">{item.role}</p>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-10 md:px-10">
          <div className="nexo-glow-border rounded-3xl border border-white/10 bg-black/45 p-6 md:p-8">
            <GlowLogic />
            <h3 className="text-2xl font-semibold">Frequently asked</h3>
            <div className="mt-5 space-y-3">
              {FAQS.map((item) => (
                <div key={item.q} className="nexo-glow-border rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <GlowLogic />
                  <p className="text-sm font-semibold text-white">{item.q}</p>
                  <p className="mt-1 text-sm text-white/65">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-10 md:px-10">
          <div className="mb-5 text-center">
            <p className="text-xs uppercase tracking-[0.24em] text-white/45">Pricing</p>
            <h3 className="mt-2 text-3xl font-semibold">Choose your operating tier</h3>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <motion.article
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="nexo-glow-border rounded-3xl border border-white/12 bg-black/50 p-6"
            >
              <GlowLogic />
              <p className="text-sm font-semibold text-white">Basic</p>
              <p className="mt-2 text-4xl font-semibold">₹1,000<span className="text-base font-medium text-white/60">/mo</span></p>
              <ul className="mt-6 space-y-3">
                {BASIC_FEATURES.map((f) => (
                  <GlowFeatureItem key={f} text={f} />
                ))}
              </ul>
            </motion.article>

            <motion.article
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              onHoverStart={() => setIsProHovered(true)}
              onHoverEnd={() => setIsProHovered(false)}
              className="nexo-glow-border relative rounded-3xl border border-lime-300/40 bg-black/50 p-6 shadow-[0_0_22px_rgba(163,230,53,0.34)]"
            >
              <GlowLogic />
              <div className="absolute -top-3 right-5 rounded-full border border-lime-300/45 bg-lime-300/15 px-3 py-1 text-xs font-medium text-lime-100 shadow-[0_0_14px_rgba(163,230,53,0.4)]">
                Most Popular
              </div>
              <p className="text-sm font-semibold text-white">Pro</p>
              <p className="mt-2 text-4xl font-semibold">₹2,000<span className="text-base font-medium text-white/60">/mo</span></p>
              <ul className="mt-6 space-y-3">
                {PRO_FEATURES.map((f) => (
                  <GlowFeatureItem key={f} text={f} />
                ))}
              </ul>
            </motion.article>
          </div>
        </section>

        <section id="ready" className="mx-auto max-w-6xl px-6 pb-24 pt-8 text-center md:px-10">
          <div className="nexo-glow-border rounded-3xl border border-white/10 bg-black/45 p-8 shadow-[0_0_30px_rgba(148,163,184,0.2)]">
            <GlowLogic />
            <h3 className="text-3xl font-semibold">Join the 100+ Smart Restaurants in Manipal. Get Started Today.</h3>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-white/70">
              Tap Get Started and enter the authenticated NexResto control plane.
            </p>
            <div className="mt-7">
              <GlowButton onClick={goToLogin}>
                Get Started <ArrowRight className="h-4 w-4" />
              </GlowButton>
            </div>
          </div>
          <p className="mt-8 text-xs text-white/45">© {year} NexResto</p>
        </section>
      </main>

      <AnimatePresence>
        {isNavigating && (
          <motion.div
            initial={{ scaleY: 0, transformOrigin: 'top' }}
            animate={{ scaleY: 1 }}
            exit={{ scaleY: 0 }}
            transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
            className="fixed inset-0 z-50 bg-[radial-gradient(circle_at_center,#f8fafc_0%,#cbd5e1_16%,#03050b_70%)]"
          />
        )}
      </AnimatePresence>
    </div>
  );
}
