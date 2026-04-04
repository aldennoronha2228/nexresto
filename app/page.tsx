"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useSuperAdminAuth } from "@/context/SuperAdminAuthContext";

type DemoFormData = {
  contactName: string;
  businessEmail: string;
  phone: string;
  restaurantName: string;
  outletCount: string;
  qrRequirements: string;
};

const INITIAL_FORM: DemoFormData = {
  contactName: "",
  businessEmail: "",
  phone: "",
  restaurantName: "",
  outletCount: "1 Outlet",
  qrRequirements: "",
};

const BRANDS = ["L'ATELIER", "SAVOY", "NOBU", "MIRA", "ZUMA", "STK"];

export default function RootPage() {
  const router = useRouter();
  const { session, loading, tenantLoading, userRole, tenantId, mustChangePassword } = useAuth();
  const { session: adminSession, loading: adminLoading, userRole: adminUserRole } = useSuperAdminAuth();
  const demoSectionRef = useRef<HTMLElement | null>(null);

  const [formData, setFormData] = useState<DemoFormData>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const shouldBlockPublicHome =
    loading ||
    tenantLoading ||
    adminLoading ||
    mustChangePassword ||
    Boolean(adminSession) ||
    Boolean(session);

  useEffect(() => {
    if (loading || tenantLoading || adminLoading) return;

    if (mustChangePassword) {
      router.replace("/change-password");
      return;
    }

    if (adminSession && adminUserRole === "super_admin") {
      router.replace("/super-admin");
      return;
    }

    if (!session) return;

    if (userRole === "super_admin") {
      router.replace("/super-admin");
      return;
    }

    if (tenantId) {
      router.replace(`/${tenantId}/dashboard/orders`);
    }
  }, [
    session,
    loading,
    tenantLoading,
    userRole,
    tenantId,
    mustChangePassword,
    adminSession,
    adminLoading,
    adminUserRole,
    router,
  ]);

  useEffect(() => {
    if (shouldBlockPublicHome) return;
    if (typeof window === "undefined") return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealNodes = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const staggerGroups = Array.from(document.querySelectorAll<HTMLElement>("[data-stagger]"));
    const parallaxNodes = Array.from(document.querySelectorAll<HTMLElement>(".parallax-node"));

    let observer: IntersectionObserver | null = null;

    if (!prefersReduced && "IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-visible");
            observer?.unobserve(entry.target);
          });
        },
        { threshold: 0.14, rootMargin: "0px 0px -8% 0px" }
      );

      revealNodes.forEach((node) => observer?.observe(node));
      staggerGroups.forEach((node) => observer?.observe(node));
    } else {
      revealNodes.forEach((node) => node.classList.add("is-visible"));
      staggerGroups.forEach((node) => node.classList.add("is-visible"));
    }

    let ticking = false;

    const shouldRunParallax = () =>
      !prefersReduced && window.innerWidth >= 1024 && parallaxNodes.length > 0;

    const resetParallax = () => {
      parallaxNodes.forEach((node) => {
        node.style.transform = "translate3d(0, 0, 0)";
      });
    };

    const updateParallax = () => {
      const scrollY = window.scrollY || window.pageYOffset || 0;
      parallaxNodes.forEach((node) => {
        const speed = Number(node.dataset.parallax || "0");
        const translateY = Math.round(scrollY * speed);
        node.style.transform = `translate3d(0, ${translateY}px, 0)`;
      });
      ticking = false;
    };

    const onScroll = () => {
      if (!shouldRunParallax()) {
        resetParallax();
        return;
      }
      if (!ticking) {
        window.requestAnimationFrame(updateParallax);
        ticking = true;
      }
    };

    const onResize = () => {
      if (shouldRunParallax()) {
        updateParallax();
      } else {
        resetParallax();
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    if (shouldRunParallax()) {
      updateParallax();
    } else {
      resetParallax();
    }

    return () => {
      if (observer) observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [shouldBlockPublicHome]);

  if (shouldBlockPublicHome) {
    return <div className="min-h-screen bg-[#131313]" aria-hidden="true" />;
  }

  const scrollToDemo = () => {
    demoSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/demo-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to submit demo request");
      }

      setFormData(INITIAL_FORM);
      setMessage({ type: "success", text: "Demo request submitted successfully. Our team will contact you soon." });
    } catch (error) {
      const text = error instanceof Error ? error.message : "Failed to submit demo request";
      setMessage({ type: "error", text });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#131313] text-[#e5e2e1]">
      <header className="fixed top-0 z-50 w-full border-b border-white/5 bg-black/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <img
              alt="NexResto logo mark"
              className="h-9 w-9 rounded-xl border border-white/15 bg-black/30 p-1"
              src="/nexresto-mark.svg?v=20260402a"
            />
            <span className="text-xl font-bold tracking-tight text-white">NexResto</span>
          </div>

          <nav className="hidden items-center gap-6 text-sm text-stone-300 md:flex">
            <a className="transition-colors hover:text-white" href="#features">Features</a>
            <a className="transition-colors hover:text-white" href="#platform">Platform</a>
            <a className="transition-colors hover:text-white" href="#demo-request">Demo</a>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10 sm:px-4 sm:py-2 sm:text-sm"
              href="/login"
            >
              Login
            </Link>
            <button
              className="rounded-full bg-[#3e54d3] px-4 py-1.5 text-xs font-semibold text-[#d8dbff] transition hover:opacity-90 sm:px-5 sm:py-2 sm:text-sm"
              onClick={scrollToDemo}
              type="button"
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      <main className="hero-gradient pt-24 lg:pt-28">
        <section className="px-6 pb-16 pt-8 lg:min-h-[calc(100dvh-7rem)] lg:px-8 lg:pb-20" id="platform">
          <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 xl:gap-16">
            <div className="reveal reveal-left" data-reveal>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#bbc3ff]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#3e54d3]" />
                Private Beta
              </div>

              <h1 className="text-4xl font-extrabold leading-tight text-white sm:text-5xl lg:text-6xl xl:text-7xl">
                A complete operating system for modern restaurant teams.
              </h1>

              <p className="mt-6 max-w-xl text-base leading-relaxed text-[#c5c5d6] sm:text-lg">
                Manage service flow, menu operations, analytics, and guest experience from one premium dashboard built for high performance dining environments.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  className="rounded-lg bg-[#3e54d3] px-6 py-3.5 text-sm font-semibold text-[#d8dbff] shadow-xl shadow-[#3e54d3]/20 transition hover:opacity-90"
                  onClick={scrollToDemo}
                  type="button"
                >
                  Request Concierge Access
                </button>
                <a className="rounded-lg border border-white/15 bg-white/5 px-6 py-3.5 text-center text-sm font-medium text-white transition hover:bg-white/10" href="#features">
                  Explore Features
                </a>
              </div>

              <div className="stagger-group mt-10 grid gap-3 sm:grid-cols-3" data-stagger>
                <div className="stagger-item surface-card rounded-lg p-4 lg:p-5" style={{ ["--stagger-delay" as string]: 0 }}>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-[#8f8fa0]">Live Revenue</p>
                  <p className="mt-2 text-2xl font-bold text-white">$12,482</p>
                </div>
                <div className="stagger-item surface-card rounded-lg p-4 lg:p-5" style={{ ["--stagger-delay" as string]: 1 }}>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-[#8f8fa0]">Table Turnover</p>
                  <p className="mt-2 text-2xl font-bold text-white">2.8x</p>
                </div>
                <div className="stagger-item surface-card rounded-lg p-4 lg:p-5" style={{ ["--stagger-delay" as string]: 2 }}>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-[#8f8fa0]">Order Accuracy</p>
                  <p className="mt-2 text-2xl font-bold text-white">99.2%</p>
                </div>
              </div>
            </div>

            <div className="reveal reveal-right relative" data-reveal>
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0e0e0e] shadow-2xl parallax-node" data-parallax="0.05">
                <img
                  alt="NexResto dashboard preview with operational insights"
                  className="aspect-[4/3] w-full object-cover"
                  src="https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1400&q=80"
                />
              </div>
              <div className="parallax-node absolute -bottom-5 -left-5 hidden rounded-lg border border-white/15 bg-black/70 px-4 py-3 shadow-xl md:block" data-parallax="0.12">
                <p className="text-[10px] uppercase tracking-[0.16em] text-[#bbc3ff]">Daily Covers</p>
                <p className="text-2xl font-bold text-white">264</p>
              </div>
              <div className="parallax-node absolute -right-4 top-4 hidden rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 md:block" data-parallax="0.1">
                <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-300">Service Health</p>
                <p className="text-xl font-bold text-white">Excellent</p>
              </div>
            </div>
          </div>
        </section>

        <section className="reveal reveal-zoom border-y border-white/5 bg-[#1b1b1b]/50 py-10" data-reveal>
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <p className="mb-6 text-center text-[11px] uppercase tracking-[0.2em] text-[#8f8fa0]">Trusted by Culinary Operators</p>
            <div className="marquee-wrap">
              <div className="marquee-track gap-14 text-2xl font-bold text-white/40">
                {[...BRANDS, ...BRANDS].map((brand, i) => (
                  <span key={`${brand}-${i}`}>{brand}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 py-20 lg:px-8" id="features">
          <div className="mx-auto max-w-7xl">
            <div className="reveal reveal-left mb-12 max-w-2xl" data-reveal>
              <h2 className="text-3xl font-bold text-white sm:text-4xl">Precision tools for fast, profitable service</h2>
              <p className="mt-3 text-[#c5c5d6]">Purpose built workflows for kitchen, floor, and leadership teams.</p>
            </div>

            <div className="stagger-group grid gap-6 md:grid-cols-2 xl:grid-cols-3" data-stagger>
              <article className="stagger-item surface-card rounded-xl p-7" style={{ ["--stagger-delay" as string]: 0 }}>
                <p className="mb-4 inline-flex rounded-md bg-[#3e54d3]/20 px-2 py-1 text-xs font-semibold text-[#bbc3ff]">Forecasting</p>
                <h3 className="text-xl font-bold text-white">AI Service Predictions</h3>
                <p className="mt-3 text-sm leading-relaxed text-[#c5c5d6]">Predict demand, optimize prep windows, and reduce wait time variance.</p>
              </article>

              <article className="stagger-item surface-card rounded-xl p-7" style={{ ["--stagger-delay" as string]: 1 }}>
                <p className="mb-4 inline-flex rounded-md bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-300">Operations</p>
                <h3 className="text-xl font-bold text-white">Live Floor Mapping</h3>
                <p className="mt-3 text-sm leading-relaxed text-[#c5c5d6]">Monitor table turnover and service load in real time across sections.</p>
              </article>

              <article className="stagger-item surface-card rounded-xl p-7" style={{ ["--stagger-delay" as string]: 2 }}>
                <p className="mb-4 inline-flex rounded-md bg-amber-500/20 px-2 py-1 text-xs font-semibold text-amber-300">Finance</p>
                <h3 className="text-xl font-bold text-white">Unified Margin Feed</h3>
                <p className="mt-3 text-sm leading-relaxed text-[#c5c5d6]">Connect item level margin data to live ticket and table behavior.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="px-6 pb-20 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-8 rounded-2xl border border-white/10 bg-[#171717] p-8 lg:grid-cols-12 lg:gap-10 lg:p-10">
            <div className="reveal reveal-left lg:col-span-5" data-reveal>
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#8f8fa0]">Desktop Control Center</p>
              <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl">Optimized for large screen operations</h2>
              <p className="mt-4 text-sm leading-relaxed text-[#c5c5d6] sm:text-base">
                NexResto is designed for desktop workflows where service leaders need quick scanning, fast decisions, and clear visibility across all active stations.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="surface-card rounded-lg p-4">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-[#8f8fa0]">Avg Prep Time</p>
                  <p className="mt-2 text-2xl font-bold text-white">11m 24s</p>
                </div>
                <div className="surface-card rounded-lg p-4">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-[#8f8fa0]">Table Utilization</p>
                  <p className="mt-2 text-2xl font-bold text-white">87%</p>
                </div>
              </div>
            </div>

            <div className="stagger-group grid gap-4 sm:grid-cols-2 lg:col-span-7" data-stagger>
              <article className="stagger-item surface-card rounded-xl p-5" style={{ ["--stagger-delay" as string]: 0 }}>
                <p className="text-xs uppercase tracking-[0.14em] text-[#8f8fa0]">Live Orders</p>
                <p className="mt-2 text-sm text-[#c5c5d6]">Queue visibility for all active tickets with clear service priority.</p>
              </article>
              <article className="stagger-item surface-card rounded-xl p-5" style={{ ["--stagger-delay" as string]: 1 }}>
                <p className="text-xs uppercase tracking-[0.14em] text-[#8f8fa0]">Table Intelligence</p>
                <p className="mt-2 text-sm text-[#c5c5d6]">Track occupancy, turnover speed, and section level load in one view.</p>
              </article>
              <article className="stagger-item surface-card rounded-xl p-5" style={{ ["--stagger-delay" as string]: 2 }}>
                <p className="text-xs uppercase tracking-[0.14em] text-[#8f8fa0]">Menu Margin Feed</p>
                <p className="mt-2 text-sm text-[#c5c5d6]">Connect item performance to contribution margin in real time.</p>
              </article>
              <article className="stagger-item surface-card rounded-xl p-5" style={{ ["--stagger-delay" as string]: 3 }}>
                <p className="text-xs uppercase tracking-[0.14em] text-[#8f8fa0]">Shift Reporting</p>
                <p className="mt-2 text-sm text-[#c5c5d6]">Generate manager ready summaries with key service and sales signals.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="px-6 pb-20 lg:px-8">
          <div className="mx-auto grid max-w-7xl items-center gap-10 rounded-2xl border border-white/10 bg-[#1b1b1b] p-8 md:p-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="reveal reveal-left" data-reveal>
              <p className="text-sm leading-relaxed text-[#e5e2e1] sm:text-base lg:text-lg">
                NexResto changed how our team coordinates service under pressure. Everything is tighter, faster, and more deliberate.
              </p>
              <div className="mt-6 flex items-center gap-4">
                <img alt="Executive chef portrait" className="h-12 w-12 rounded-full border border-white/20 object-cover" src="https://images.unsplash.com/photo-1607631568010-a87245c0daf8?auto=format&fit=crop&w=300&q=80" />
                <div>
                  <p className="text-sm font-semibold text-white">Chef Julian Vane</p>
                  <p className="text-xs uppercase tracking-[0.12em] text-[#8f8fa0]">Executive Chef, L Opera</p>
                </div>
              </div>
            </div>

            <div className="reveal reveal-right" data-reveal>
              <div className="surface-card rounded-xl p-6">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#8f8fa0]">Why Teams Switch</p>
                <ul className="mt-4 space-y-3 text-sm text-[#c5c5d6]">
                  <li>Higher table throughput without sacrificing service quality.</li>
                  <li>Cleaner coordination between front of house and kitchen.</li>
                  <li>Transparent daily margin and performance visibility.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 pb-20 lg:px-8" id="demo-request" ref={demoSectionRef}>
          <div className="mx-auto max-w-7xl rounded-2xl border border-white/10 bg-[#171717] p-7 md:p-10">
            <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="reveal reveal-left" data-reveal>
                <p className="mb-3 text-[11px] uppercase tracking-[0.2em] text-[#8f8fa0]">Demo Request</p>
                <h2 className="text-3xl font-bold text-white sm:text-4xl">Get Started With NexResto</h2>
                <p className="mt-4 text-[#c5c5d6]">Share your details and we will schedule your onboarding walkthrough.</p>

                <button
                  className="mt-7 inline-flex items-center gap-2 rounded-lg bg-[#3e54d3] px-5 py-3 text-sm font-semibold text-[#d8dbff] transition hover:opacity-90"
                  onClick={scrollToDemo}
                  type="button"
                >
                  Secure Your Spot
                  <span aria-hidden="true">-&gt;</span>
                </button>
              </div>

              <form className="reveal reveal-right glass-panel space-y-4 rounded-xl border border-white/10 p-5 md:p-6" data-reveal onSubmit={onSubmit}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs uppercase tracking-widest text-[#8f8fa0]" htmlFor="contactName">Contact Name</label>
                    <input
                      className="w-full rounded-md border border-white/10 bg-[#161616] px-3 py-2 text-sm text-white"
                      id="contactName"
                      maxLength={80}
                      minLength={2}
                      name="contactName"
                      onChange={(event) => setFormData((prev) => ({ ...prev, contactName: event.target.value }))}
                      required
                      type="text"
                      value={formData.contactName}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs uppercase tracking-widest text-[#8f8fa0]" htmlFor="businessEmail">Business Email</label>
                    <input
                      className="w-full rounded-md border border-white/10 bg-[#161616] px-3 py-2 text-sm text-white"
                      id="businessEmail"
                      maxLength={120}
                      name="businessEmail"
                      onChange={(event) => setFormData((prev) => ({ ...prev, businessEmail: event.target.value }))}
                      required
                      type="email"
                      value={formData.businessEmail}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs uppercase tracking-widest text-[#8f8fa0]" htmlFor="phone">Phone</label>
                    <input
                      className="w-full rounded-md border border-white/10 bg-[#161616] px-3 py-2 text-sm text-white"
                      id="phone"
                      maxLength={32}
                      minLength={7}
                      name="phone"
                      onChange={(event) => setFormData((prev) => ({ ...prev, phone: event.target.value }))}
                      required
                      type="tel"
                      value={formData.phone}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs uppercase tracking-widest text-[#8f8fa0]" htmlFor="restaurantName">Restaurant Name</label>
                    <input
                      className="w-full rounded-md border border-white/10 bg-[#161616] px-3 py-2 text-sm text-white"
                      id="restaurantName"
                      maxLength={120}
                      minLength={2}
                      name="restaurantName"
                      onChange={(event) => setFormData((prev) => ({ ...prev, restaurantName: event.target.value }))}
                      required
                      type="text"
                      value={formData.restaurantName}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-xs uppercase tracking-widest text-[#8f8fa0]" htmlFor="outletCount">Number of Outlets</label>
                  <select
                    className="w-full rounded-md border border-white/10 bg-[#161616] px-3 py-2 text-sm text-white"
                    id="outletCount"
                    name="outletCount"
                    onChange={(event) => setFormData((prev) => ({ ...prev, outletCount: event.target.value }))}
                    required
                    value={formData.outletCount}
                  >
                    <option value="1 Outlet">1 Outlet</option>
                    <option value="2-5 Outlets">2-5 Outlets</option>
                    <option value="6-20 Outlets">6-20 Outlets</option>
                    <option value="20+ Outlets">20+ Outlets</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-xs uppercase tracking-widest text-[#8f8fa0]" htmlFor="qrRequirements">QR and Workflow Requirements</label>
                  <textarea
                    className="w-full rounded-md border border-white/10 bg-[#161616] px-3 py-2 text-sm text-white"
                    id="qrRequirements"
                    maxLength={1200}
                    name="qrRequirements"
                    onChange={(event) => setFormData((prev) => ({ ...prev, qrRequirements: event.target.value }))}
                    placeholder="Tell us about your setup and rollout goals"
                    rows={4}
                    value={formData.qrRequirements}
                  />
                </div>

                {message && (
                  <div
                    className={`rounded-md border px-3 py-2 text-sm ${
                      message.type === "success"
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        : "border-rose-500/40 bg-rose-500/10 text-rose-300"
                    }`}
                  >
                    {message.text}
                  </div>
                )}

                <button
                  className="w-full rounded-md bg-[#3e54d3] px-4 py-3 text-base font-semibold text-[#d8dbff] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={submitting}
                  type="submit"
                >
                  {submitting ? "Submitting..." : "Submit Demo Request"}
                </button>
              </form>
            </div>
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
                src="/nexresto-mark.svg?v=20260402a"
              />
              <p className="text-lg font-bold text-white">NexResto</p>
            </div>
            <p className="mt-3 max-w-sm text-sm text-stone-400">Crafting the digital future of premium dining operations.</p>
          </div>
          <div>
            <p className="mb-3 text-sm font-medium text-white">Company</p>
            <div className="space-y-2 text-sm text-stone-400">
              <a className="block hover:text-emerald-400" href="#platform">Platform</a>
              <a className="block hover:text-emerald-400" href="#features">Features</a>
              <a className="block hover:text-emerald-400" href="#demo-request">Demo</a>
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
        <div className="mx-auto max-w-7xl px-6 pb-10 text-sm text-stone-500 lg:px-8">(c) 2026 NexResto. Premium Dining Experience.</div>
      </footer>

      <style jsx global>{`
        .hero-gradient {
          background:
            radial-gradient(60rem 32rem at 8% 6%, rgba(62, 84, 211, 0.2), transparent 60%),
            radial-gradient(44rem 28rem at 92% 10%, rgba(16, 185, 129, 0.12), transparent 60%),
            #131313;
        }

        .surface-card {
          background: #20201f;
          border: 1px solid rgba(68, 70, 84, 0.32);
        }

        .glass-panel {
          background: rgba(32, 32, 31, 0.72);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }

        .reveal {
          opacity: 0;
          transform: translate3d(0, 28px, 0);
          transition: opacity 700ms ease, transform 700ms ease;
          will-change: opacity, transform;
        }

        .reveal-left {
          transform: translate3d(-36px, 18px, 0);
        }

        .reveal-right {
          transform: translate3d(36px, 18px, 0);
        }

        .reveal-zoom {
          transform: translate3d(0, 22px, 0) scale(0.95);
        }

        .reveal.is-visible {
          opacity: 1;
          transform: translate3d(0, 0, 0);
        }

        .stagger-group .stagger-item {
          opacity: 0;
          transform: translate3d(0, 20px, 0);
          transition: opacity 650ms ease, transform 650ms ease;
          transition-delay: calc(var(--stagger-delay, 0) * 90ms);
          will-change: opacity, transform;
        }

        .stagger-group.is-visible .stagger-item {
          opacity: 1;
          transform: translate3d(0, 0, 0);
        }

        .marquee-wrap {
          overflow: hidden;
          mask-image: linear-gradient(to right, transparent, black 12%, black 88%, transparent);
          -webkit-mask-image: linear-gradient(to right, transparent, black 12%, black 88%, transparent);
        }

        .marquee-track {
          display: flex;
          width: max-content;
          animation: marquee-scroll 26s linear infinite;
        }

        @keyframes marquee-scroll {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .reveal,
          .stagger-group .stagger-item,
          .marquee-track {
            animation: none !important;
            transition: none !important;
            transform: none !important;
            opacity: 1 !important;
          }
        }
      `}</style>
    </div>
  );
}
