"use client"

import { useEffect, useState, type FormEvent, type MouseEvent, type ReactNode } from "react"
import { X, Check, ArrowRight, BarChart3, Globe2 } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

const heroSequence = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    transition: {
      delayChildren: 0.12,
      staggerChildren: 0.14,
    },
  },
}

const heroFadeInUp = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.68,
      ease: [0.22, 1, 0.36, 1],
    },
  },
}

const heroStats = [
  { label: "Trusted By", value: "120+ Restaurant Brands" },
  { label: "Monthly Orders", value: "4.8M+ Processed" },
  { label: "Deployment Speed", value: "Go-live in under 72 hours" },
]

function handleCardPointerMove(event: MouseEvent<HTMLElement>) {
  const element = event.currentTarget
  const rect = element.getBoundingClientRect()

  if (!rect.width || !rect.height) return

  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  const px = (x / rect.width) * 100
  const py = (y / rect.height) * 100
  const rx = (50 - py) / 10
  const ry = (px - 50) / 12

  element.style.setProperty("--mx", `${px}%`)
  element.style.setProperty("--my", `${py}%`)
  element.style.setProperty("--rx", `${rx.toFixed(2)}deg`)
  element.style.setProperty("--ry", `${ry.toFixed(2)}deg`)
}

function resetCardPointer(event: MouseEvent<HTMLElement>) {
  const element = event.currentTarget
  element.style.setProperty("--mx", "50%")
  element.style.setProperty("--my", "50%")
  element.style.setProperty("--rx", "0deg")
  element.style.setProperty("--ry", "0deg")
}

function InteractiveGlowCard({ className, children }: { className: string; children: ReactNode }) {
  return (
    <motion.article
      onMouseMove={handleCardPointerMove}
      onMouseLeave={resetCardPointer}
      whileHover={{ scale: 1.025, y: -2 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
      className={`group relative overflow-hidden transition-transform duration-200 will-change-transform [transform:perspective(900px)_rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))] ${className}`}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(260px_circle_at_var(--mx,50%)_var(--my,50%),rgba(96,165,250,0.26),transparent_62%)] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
      />
      <div className="relative z-10">{children}</div>
    </motion.article>
  )
}

export default function Hero() {
  const [isExpanded, setIsExpanded] = useState(false)
  const [formStep, setFormStep] = useState<"idle" | "submitting" | "success">("idle")
  const [isAnimationComplete, setIsAnimationComplete] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const handleExpand = () => {
    setIsExpanded(true)
    setTimeout(() => setIsAnimationComplete(true), 400)
  }

  const handleClose = () => {
    setIsAnimationComplete(false)
    setFormError(null)
    setTimeout(() => {
      setIsExpanded(false)
      setTimeout(() => setFormStep("idle"), 500)
    }, 200)
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)
    setFormStep("submitting")

    try {
      const form = e.currentTarget
      const formData = new FormData(form)

      const payload = {
        contactName: String(formData.get("contactName") || ""),
        businessEmail: String(formData.get("businessEmail") || ""),
        phone: String(formData.get("phone") || ""),
        restaurantName: String(formData.get("restaurantName") || ""),
        outletCount: String(formData.get("outletCount") || ""),
        qrRequirements: String(formData.get("qrRequirements") || ""),
      }

      const response = await fetch("/api/demo-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}))
        const message = String(errorPayload?.error || "Failed to submit request")
        throw new Error(message)
      }

      form.reset()
      setFormStep("success")
    } catch (error) {
      setFormStep("idle")
      setFormError(error instanceof Error ? error.message : "Failed to submit request")
    }
  }

  useEffect(() => {
    document.body.style.overflow = isExpanded ? "hidden" : "unset"
    return () => {
      document.body.style.overflow = "unset"
    }
  }, [isExpanded])

  return (
    <>
      <div className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden bg-[radial-gradient(120%_95%_at_50%_0%,#10214e_0%,#070d1f_45%,#02050f_100%)] px-4 py-16 sm:px-6 sm:py-24">
        <div className="pointer-events-none absolute inset-0 transition-opacity duration-300" style={{ opacity: isExpanded ? 0 : 1 }}>
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(60% 45% at 14% 16%, rgba(59,130,246,0.26) 0%, rgba(59,130,246,0.06) 42%, transparent 74%), radial-gradient(56% 42% at 86% 14%, rgba(99,102,241,0.2) 0%, rgba(99,102,241,0.05) 44%, transparent 75%), radial-gradient(64% 54% at 52% 100%, rgba(15,23,42,0.7) 0%, rgba(2,6,23,0.94) 62%)",
            }}
          />

          <motion.div
            className="absolute -left-12 top-20 h-32 w-32 rounded-full bg-blue-500/25 blur-3xl"
            animate={{ x: [0, 24, 0], y: [0, -18, 0], opacity: [0.35, 0.6, 0.35] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          />

          <motion.div
            className="absolute right-[-5%] top-[18%] h-44 w-44 rounded-full bg-indigo-500/25 blur-3xl"
            animate={{ x: [0, -22, 0], y: [0, 16, 0], opacity: [0.28, 0.52, 0.28] }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 0.7 }}
          />

          <motion.div
            className="absolute bottom-[-10%] left-[32%] h-40 w-40 rounded-full bg-sky-400/20 blur-3xl"
            animate={{ x: [0, 14, 0], y: [0, -22, 0], opacity: [0.2, 0.45, 0.2] }}
            transition={{ duration: 11, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
          />
        </div>

        <motion.div
          variants={heroSequence}
          initial="hidden"
          animate="show"
          className="relative z-10 flex flex-col items-center gap-7 pt-16 text-center sm:gap-10 sm:pt-20"
        >
          <motion.div
            variants={heroFadeInUp}
            className="relative inline-flex max-w-[92vw] items-center overflow-hidden rounded-full border border-white/15 bg-slate-950/45 px-4 py-1.5 text-xs font-medium text-slate-200 shadow-[0_0_0_1px_rgba(59,130,246,0.18),0_8px_30px_rgba(30,64,175,0.25)] backdrop-blur-md sm:text-sm"
          >
            <motion.span
              aria-hidden
              className="absolute inset-y-0 left-[-45%] w-1/3 bg-gradient-to-r from-transparent via-white/35 to-transparent"
              animate={{ x: ["0%", "360%"] }}
              transition={{ duration: 3.2, repeat: Infinity, repeatDelay: 2.6, ease: "easeInOut" }}
            />
            <span className="mr-2 flex h-2 w-2 rounded-full bg-blue-400 shadow-[0_0_0_4px_rgba(96,165,250,0.2)]"></span>
            NexResto OS: Multi-Outlet Control Center
          </motion.div>

          <motion.h1
            variants={heroFadeInUp}
            className="max-w-4xl text-3xl font-bold tracking-[-0.04em] text-slate-50 [font-family:Inter,Geist,ui-sans-serif,system-ui,sans-serif] sm:text-5xl md:text-6xl lg:text-7xl"
          >
            NexResto powers your full <br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500 bg-clip-text text-transparent">
              restaurant growth engine
            </span>
          </motion.h1>

          <motion.p
            variants={heroFadeInUp}
            className="max-w-3xl px-1 text-sm leading-7 text-slate-400 sm:px-4 sm:text-lg sm:leading-8 md:text-xl md:leading-9"
          >
            NexResto is a unified restaurant operations platform for branded ordering, table management, staff workflows,
            and real-time performance intelligence across every branch.
          </motion.p>

          <motion.div
            variants={heroFadeInUp}
            className="grid w-full max-w-4xl gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-left backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_20px_45px_rgba(2,6,23,0.45)] sm:grid-cols-2 lg:grid-cols-3"
          >
            {heroStats.map((stat) => (
              <InteractiveGlowCard
                key={stat.label}
                className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors hover:border-white/30"
              >
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{stat.label}</p>
                <p className="mt-1 text-sm font-semibold text-slate-100">{stat.value}</p>
              </InteractiveGlowCard>
            ))}
          </motion.div>

          <AnimatePresence initial={false}>
            {!isExpanded && (
              <motion.div className="relative mt-4 inline-block">
                <motion.div
                  style={{ borderRadius: "100px" }}
                  layout
                  layoutId="cta-card"
                  transition={{ type: "tween", ease: [0.25, 1, 0.5, 1], duration: 0.4 }}
                  className="absolute inset-0 origin-center bg-blue-600 dark:bg-blue-600"
                />
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  layout={false}
                  onClick={handleExpand}
                  className="relative flex h-14 w-[min(86vw,22rem)] items-center justify-center gap-2 overflow-hidden px-6 py-3 text-base font-medium tracking-wide text-white transition-opacity hover:opacity-90 sm:w-auto sm:px-8 sm:text-lg"
                >
                  <motion.span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 left-[-40%] w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                    animate={{ x: ["0%", "420%"] }}
                    transition={{ duration: 2.8, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" }}
                  />
                  Start your journey
                  <ArrowRight className="h-5 w-5" />
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.a
            href="#platform-info"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.45 }}
            className="mt-2 inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900/40 px-4 py-2 text-xs uppercase tracking-[0.18em] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
          >
            Scroll for details
          </motion.a>
        </motion.div>
      </div>

      <section id="platform-info" className="relative scroll-mt-24 bg-zinc-950 px-4 pb-36 pt-8 sm:px-6 sm:pb-44 sm:pt-12">
        <div className="mx-auto w-full max-w-6xl space-y-8 sm:space-y-10">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.5 }}
            className="rounded-3xl border border-zinc-800 bg-zinc-900/40 p-7 sm:p-12"
          >
            <p className="text-xs uppercase tracking-[0.24em] text-zinc-400">What Is NexResto</p>
            <h2 className="mt-4 max-w-4xl text-2xl font-semibold leading-tight tracking-tight text-zinc-100 sm:text-4xl">
              NexResto helps restaurant teams run service, sales, and strategy in one connected workflow.
            </h2>
            <p className="mt-5 max-w-4xl text-zinc-400 sm:text-lg">
              From the first order of the day to end-of-shift reporting, NexResto replaces disconnected tools with one
              intelligent layer designed for speed, consistency, and multi-location growth.
            </p>
            <div className="mt-8 grid gap-5 lg:grid-cols-3">
              <article className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-6">
                <p className="text-sm font-semibold text-zinc-100">Guest Experience</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  Branded menu journeys, clear order status, and faster handoff moments that increase repeat visits.
                </p>
              </article>
              <article className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-6">
                <p className="text-sm font-semibold text-zinc-100">Team Productivity</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  One dashboard for managers, kitchen, and floor staff with fewer context switches and reduced errors.
                </p>
              </article>
              <article className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-6">
                <p className="text-sm font-semibold text-zinc-100">Growth Insights</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  Real-time analytics to optimize staffing, menu mix, and channel revenue across all outlets.
                </p>
              </article>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.5 }}
            className="rounded-3xl border border-zinc-800 bg-zinc-900/40 p-7 sm:p-12"
          >
            <p className="text-xs uppercase tracking-[0.24em] text-zinc-400">NexResto Platform Overview</p>
            <h2 className="mt-4 max-w-4xl text-2xl font-semibold leading-tight tracking-tight text-zinc-100 sm:text-4xl">
              Everything your restaurant team needs from opening prep to post-shift analytics.
            </h2>
            <p className="mt-5 max-w-4xl text-zinc-400 sm:text-lg">
              Replace scattered tools with one system for menu publishing, table orchestration, live order visibility, and multi-store reporting.
            </p>

            <div className="mt-8 grid gap-5 lg:grid-cols-3">
              <article className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-6">
                <p className="text-sm font-semibold text-zinc-100">Unified Order Flow</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  Dine-in, pickup, and delivery orders move through one queue, so kitchen and front-of-house stay synchronized.
                </p>
              </article>
              <article className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-6">
                <p className="text-sm font-semibold text-zinc-100">Live Floor Control</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  Track table occupancy, service status, and handoff timing with real-time updates across devices.
                </p>
              </article>
              <article className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-6">
                <p className="text-sm font-semibold text-zinc-100">Revenue Intelligence</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  Get hourly sales signals, item performance, and margin insights before the shift ends.
                </p>
              </article>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.5, delay: 0.08 }}
            className="mt-0 grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
              <p className="text-3xl font-semibold text-blue-400">34%</p>
              <p className="mt-2 text-sm text-zinc-400">Average faster table turnover</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
              <p className="text-3xl font-semibold text-blue-400">2.1x</p>
              <p className="mt-2 text-sm text-zinc-400">More repeat digital orders</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
              <p className="text-3xl font-semibold text-blue-400">99.95%</p>
              <p className="mt-2 text-sm text-zinc-400">Platform reliability during peak hours</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
              <p className="text-3xl font-semibold text-blue-400">48 hrs</p>
              <p className="mt-2 text-sm text-zinc-400">Typical rollout for a new branch</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.5, delay: 0.12 }}
            className="mt-0 rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-7 sm:p-12"
          >
            <p className="text-xs uppercase tracking-[0.24em] text-zinc-400">NexResto Rollout Blueprint</p>
            <div className="mt-7 grid gap-5 lg:grid-cols-3">
              <article className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
                <p className="text-sm font-semibold text-zinc-100">1. Configure</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  Import menu, assign staff roles, and connect outlet branding in a guided setup.
                </p>
              </article>
              <article className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
                <p className="text-sm font-semibold text-zinc-100">2. Operate</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  Run live service with table, kitchen, and customer touchpoints coordinated in one dashboard.
                </p>
              </article>
              <article className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
                <p className="text-sm font-semibold text-zinc-100">3. Optimize</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  Use shift-by-shift analytics to refine staffing, menu mix, and channel performance.
                </p>
              </article>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.5, delay: 0.16 }}
            id="nexresto-suite"
            className="mt-0 scroll-mt-24 rounded-3xl border border-zinc-800 bg-zinc-900/40 p-7 sm:p-12"
          >
            <p className="text-xs uppercase tracking-[0.24em] text-zinc-400">NexResto Product Suite</p>
            <div className="mt-7 grid gap-5 lg:grid-cols-3">
              <article className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-6">
                <p className="text-sm font-semibold text-zinc-100">Quick Service Chains</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  Handle high ticket volume with queue prioritization, prep-time alerts, and location-level performance snapshots.
                </p>
              </article>
              <article className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-6">
                <p className="text-sm font-semibold text-zinc-100">Casual Dining Groups</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  Coordinate tables, kitchen pacing, and online channels while keeping a consistent guest experience across outlets.
                </p>
              </article>
              <article className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-6">
                <p className="text-sm font-semibold text-zinc-100">Cloud Kitchens</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  Centralize brand menus, aggregate order sources, and monitor margin per concept from one command center.
                </p>
              </article>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-0 grid gap-5 lg:grid-cols-2"
          >
            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/40 p-7 sm:p-10">
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-400">Integrations</p>
              <h3 className="mt-3 text-xl font-semibold text-zinc-100 sm:text-2xl">Connect your existing stack in minutes.</h3>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400 sm:text-base">
                NexResto syncs with payment gateways, POS, delivery aggregators, messaging tools, and accounting pipelines
                without rebuilding your workflows.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3 text-sm text-zinc-300">
                <span className="rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2">POS Sync</span>
                <span className="rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2">Payment Routing</span>
                <span className="rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2">Delivery Apps</span>
                <span className="rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2">WhatsApp Alerts</span>
                <span className="rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2">Inventory Feeds</span>
                <span className="rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2">Finance Export</span>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/40 p-7 sm:p-10">
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-400">Security & Reliability</p>
              <h3 className="mt-3 text-xl font-semibold text-zinc-100 sm:text-2xl">Enterprise-grade controls by default.</h3>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400 sm:text-base">
                NexResto enforces tenant isolation, role-based permissions, encrypted data paths, and auditable admin logs
                so operations teams stay compliant and secure.
              </p>
              <ul className="mt-5 space-y-3 text-sm text-zinc-300">
                <li className="rounded-xl border border-zinc-700 bg-zinc-950/70 px-4 py-3">Tenant-aware access boundaries across stores</li>
                <li className="rounded-xl border border-zinc-700 bg-zinc-950/70 px-4 py-3">Strict staff permission tiers for sensitive actions</li>
                <li className="rounded-xl border border-zinc-700 bg-zinc-950/70 px-4 py-3">Immutable event logs for operational audits</li>
              </ul>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.5, delay: 0.24 }}
            id="nexresto-faq"
            className="mt-0 scroll-mt-24 rounded-3xl border border-zinc-800 bg-zinc-900/40 p-7 sm:p-12"
          >
            <p className="text-xs uppercase tracking-[0.24em] text-zinc-400">Frequently Asked Questions</p>
            <div className="mt-5 space-y-3">
              <details className="group rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 open:bg-zinc-950/90">
                <summary className="cursor-pointer list-none text-sm font-semibold text-zinc-100 sm:text-base">
                  What exactly is NexResto?
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                  NexResto is an all-in-one restaurant operations and growth platform for ordering, table management,
                  analytics, and multi-branch control.
                </p>
              </details>
              <details className="group rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 open:bg-zinc-950/90">
                <summary className="cursor-pointer list-none text-sm font-semibold text-zinc-100 sm:text-base">
                  How quickly can we go live?
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                  Most teams launch the first outlet in 48 to 72 hours, then clone configuration to additional branches.
                </p>
              </details>
              <details className="group rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 open:bg-zinc-950/90">
                <summary className="cursor-pointer list-none text-sm font-semibold text-zinc-100 sm:text-base">
                  Can we use our current menu and table setup?
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                  Yes. Menu data, category structure, and floor layouts can be imported and then adjusted in the dashboard.
                </p>
              </details>
              <details className="group rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 open:bg-zinc-950/90">
                <summary className="cursor-pointer list-none text-sm font-semibold text-zinc-100 sm:text-base">
                  Do we get support during rollout?
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                  Dedicated onboarding guidance is included, plus live support for launch week optimization and staff training.
                </p>
              </details>
            </div>

            <div className="mt-10 flex flex-col gap-3 rounded-2xl border border-blue-600/30 bg-blue-600/10 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-zinc-100">Want a personalized walkthrough?</p>
                <p className="mt-1 text-sm text-zinc-300">Tell us your outlet count, order volume, and goals. We will tailor a live demo.</p>
              </div>
              <button
                onClick={handleExpand}
                className="inline-flex items-center justify-center rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Request Demo
              </button>
            </div>
          </motion.div>

          <motion.div
            id="nexresto-pricing"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.5, delay: 0.28 }}
            className="mt-0 scroll-mt-24 rounded-3xl border border-zinc-800 bg-zinc-900/40 p-7 sm:p-12"
          >
            <p className="text-xs uppercase tracking-[0.24em] text-zinc-400">NexResto Plans</p>
            <h3 className="mt-3 text-2xl font-semibold text-zinc-100 sm:text-3xl">Choose a plan that matches your growth stage.</h3>
            <p className="mt-2 text-sm text-zinc-400">Mapped to current tiers: starter/1k, pro/2k, and 2.5k enterprise.</p>
            <div className="mt-7 grid gap-5 lg:grid-cols-3">
              <article className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-6">
                <p className="text-sm font-semibold text-zinc-100">Basic</p>
                <p className="mt-2 text-3xl font-semibold text-blue-400">₹1,000</p>
                <p className="text-xs text-zinc-500">per location / month</p>
                <ul className="mt-4 space-y-2 text-sm text-zinc-300">
                  <li>Phone Ordering</li>
                  <li>Live Order Queue</li>
                  <li>QR Code Generation</li>
                  <li>Menu Management</li>
                  <li>Single Owner Only</li>
                </ul>
              </article>
              <article className="rounded-2xl border border-blue-600/50 bg-blue-600/10 p-6">
                <p className="text-sm font-semibold text-zinc-100">Pro</p>
                <p className="mt-2 text-3xl font-semibold text-blue-300">₹2,000</p>
                <p className="text-xs text-zinc-400">per location / month</p>
                <ul className="mt-4 space-y-2 text-sm text-zinc-200">
                  <li>Everything in Basic</li>
                  <li>Multi-user Roles (Owner, Manager, Staff)</li>
                  <li>Role-based Access Control</li>
                  <li>Analytics Dashboard</li>
                  <li>Inventory Management</li>
                  <li>Custom Branding</li>
                </ul>
              </article>
              <article className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-6">
                <p className="text-sm font-semibold text-zinc-100">Enterprise</p>
                <p className="mt-2 text-3xl font-semibold text-blue-400">₹2,500</p>
                <p className="text-xs text-zinc-500">per location / month</p>
                <ul className="mt-4 space-y-2 text-sm text-zinc-300">
                  <li>Everything in Pro</li>
                  <li>Enterprise tier access (2.5k)</li>
                  <li>Priority onboarding support</li>
                  <li>Advanced security oversight</li>
                </ul>
              </article>
            </div>
          </motion.div>

          <footer className="mt-0 rounded-3xl border border-zinc-800 bg-zinc-900/30 px-7 py-8 sm:px-10">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-lg font-semibold text-zinc-100">NexResto</p>
                <p className="mt-1 text-sm text-zinc-400">Modern operating system for restaurant teams that scale with control.</p>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-300">
                <a href="#platform-info" className="transition-colors hover:text-white">Platform</a>
                <a href="#nexresto-suite" className="transition-colors hover:text-white">Suite</a>
                <a href="#nexresto-pricing" className="transition-colors hover:text-white">Plans</a>
                <a href="#nexresto-faq" className="transition-colors hover:text-white">FAQ</a>
              </div>
            </div>
          </footer>
        </div>
      </section>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-0 sm:items-center sm:p-4">
            <motion.div
              layoutId="cta-card"
              transition={{ type: "tween", ease: [0.25, 1, 0.5, 1], duration: 0.4 }}
              style={{ borderRadius: "24px" }}
              layout
              className="relative flex min-h-[100svh] w-full origin-center overflow-hidden bg-blue-700 shadow-2xl sm:h-full sm:min-h-0 sm:rounded-[24px]"
            >
              <AnimatePresence>
                {isAnimationComplete && (
                  <motion.div
                    key="mesh-bg"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-0 pointer-events-none"
                  >
                    <motion.div
                      className="h-full w-full"
                      style={{
                        backgroundImage:
                          "linear-gradient(120deg, #1d4ed8, #1e40af, #172554, #1e3a8a, #1d4ed8)",
                        backgroundSize: "240% 240%",
                      }}
                      animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
                      transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                    />
                  </motion.div>
                )}

                {isAnimationComplete && (
                  <motion.div
                    key="modal-content"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-0 size-full"
                  >
                    <button
                      onClick={handleClose}
                      className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-50 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20 sm:right-8 sm:top-8"
                    >
                      <X className="h-5 w-5" />
                    </button>

                    <div className="relative z-10 mx-auto flex h-full w-full max-w-7xl flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
                      <div className="flex flex-1 flex-col justify-start gap-6 p-6 text-white sm:p-10 lg:justify-center lg:gap-8 lg:p-16">
                        <div className="space-y-4">
                          <h2 className="text-2xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">Ready to scale?</h2>
                          <p className="max-w-md text-base text-blue-100 sm:text-lg">
                            Join thousands of restaurant teams improving speed, repeat orders, and service quality.
                          </p>
                        </div>

                        <div className="space-y-6">
                          <div className="flex items-start gap-4">
                            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 backdrop-blur-sm">
                              <BarChart3 className="h-6 w-6 text-blue-200" />
                            </div>
                            <div>
                              <h3 className="text-lg font-semibold">Analytics First</h3>
                              <p className="mt-1 text-sm leading-relaxed text-blue-100/80">
                                See live ticket velocity, prep-time trends, and top-selling dishes by location.
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start gap-4">
                            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 backdrop-blur-sm">
                              <Globe2 className="h-6 w-6 text-blue-200" />
                            </div>
                            <div>
                              <h3 className="text-lg font-semibold">Global Edge</h3>
                              <p className="mt-1 text-sm leading-relaxed text-blue-100/80">
                                Multi-store infrastructure keeps your customer experience fast in every city.
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-2 border-t border-white/20 pt-6 lg:mt-auto lg:pt-8">
                          <figure>
                            <blockquote className="mb-4 text-lg font-medium leading-relaxed sm:mb-6 sm:text-xl">
                              &ldquo;We cut order errors and doubled delivery throughput in six weeks after switching.&rdquo;
                            </blockquote>
                            <figcaption className="flex items-center gap-4">
                              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-tr from-orange-400 to-pink-500 text-lg font-bold text-white">
                                AN
                              </div>
                              <div>
                                <div className="font-semibold">Alden Noronha</div>
                                <div className="text-sm text-blue-200">Operations Lead</div>
                              </div>
                            </figcaption>
                          </figure>
                        </div>
                      </div>

                      <div className="flex flex-1 items-center justify-center bg-black/10 p-4 backdrop-blur-sm sm:p-8 lg:bg-transparent lg:p-16 lg:backdrop-blur-none">
                        <div className="w-full max-w-md rounded-2xl border border-white/20 bg-white/10 p-5 shadow-2xl backdrop-blur-md sm:p-8">
                          {formStep === "success" ? (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="flex h-[320px] flex-col items-center justify-center space-y-6 text-center sm:h-[400px]"
                            >
                              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-500 shadow-lg shadow-green-500/30">
                                <Check className="h-10 w-10 text-white" />
                              </div>
                              <div>
                                <h3 className="mb-2 text-2xl font-bold text-white">Request Received!</h3>
                                <p className="text-blue-100">Our team will contact you shortly to set up your QR ordering onboarding call.</p>
                              </div>
                              <button
                                onClick={handleClose}
                                className="rounded-lg bg-white/20 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-white/30"
                              >
                                Return to Homepage
                              </button>
                            </motion.div>
                          ) : (
                            <form onSubmit={handleSubmit} className="space-y-5">
                              <div className="space-y-1">
                                <h3 className="text-xl font-semibold text-white">Get Your Restaurant QR Demo</h3>
                                <p className="text-sm text-blue-200">Share your restaurant details and we&apos;ll tailor a QR ordering walkthrough.</p>
                              </div>

                              {formError && (
                                <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                                  {formError}
                                </p>
                              )}

                              <div className="space-y-4">
                                <div>
                                  <label htmlFor="name" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-blue-200">
                                    Contact Person
                                  </label>
                                  <input
                                    required
                                    type="text"
                                    id="name"
                                    name="contactName"
                                    placeholder="Alden Noronha"
                                    className="w-full rounded-lg border border-blue-300/20 bg-blue-950/40 px-4 py-3 text-base text-white placeholder:text-white/30 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 sm:text-sm"
                                  />
                                </div>

                                <div>
                                  <label htmlFor="email" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-blue-200">
                                    Business Email
                                  </label>
                                  <input
                                    required
                                    type="email"
                                    id="email"
                                    name="businessEmail"
                                    placeholder="ops@yourrestaurant.com"
                                    className="w-full rounded-lg border border-blue-300/20 bg-blue-950/40 px-4 py-3 text-base text-white placeholder:text-white/30 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 sm:text-sm"
                                  />
                                </div>

                                <div>
                                  <label htmlFor="phone" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-blue-200">
                                    WhatsApp / Phone
                                  </label>
                                  <input
                                    required
                                    type="tel"
                                    id="phone"
                                    name="phone"
                                    placeholder="+91 98XXXXXX10"
                                    className="w-full rounded-lg border border-blue-300/20 bg-blue-950/40 px-4 py-3 text-base text-white placeholder:text-white/30 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 sm:text-sm"
                                  />
                                </div>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                  <div>
                                    <label htmlFor="company" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-blue-200">
                                      Restaurant Name
                                    </label>
                                    <input
                                      required
                                      type="text"
                                      id="company"
                                      name="restaurantName"
                                      placeholder="Spice Route Bistro"
                                      className="w-full rounded-lg border border-blue-300/20 bg-blue-950/40 px-4 py-3 text-base text-white placeholder:text-white/30 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 sm:text-sm"
                                    />
                                  </div>
                                  <div>
                                    <label htmlFor="size" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-blue-200">
                                      Number of Outlets
                                    </label>
                                    <select
                                      id="size"
                                      name="outletCount"
                                      required
                                      defaultValue=""
                                      className="w-full cursor-pointer appearance-none rounded-lg border border-blue-300/20 bg-blue-950/40 px-4 py-3 text-base text-white transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 sm:text-sm"
                                    >
                                      <option value="" className="bg-blue-900">Select outlets</option>
                                      <option className="bg-blue-900">1 Outlet</option>
                                      <option className="bg-blue-900">2-5 Outlets</option>
                                      <option className="bg-blue-900">6-20 Outlets</option>
                                      <option className="bg-blue-900">20+ Outlets</option>
                                    </select>
                                  </div>
                                </div>

                                <div>
                                  <label htmlFor="message" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-blue-200">
                                    QR Setup Requirements
                                  </label>
                                  <textarea
                                    id="message"
                                    name="qrRequirements"
                                    rows={3}
                                    placeholder="Tell us your cuisine type, table count, and current ordering flow..."
                                    className="w-full resize-none rounded-lg border border-blue-300/20 bg-blue-950/40 px-4 py-3 text-base text-white placeholder:text-white/30 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 sm:text-sm"
                                  />
                                </div>
                              </div>

                              <button
                                disabled={formStep === "submitting"}
                                type="submit"
                                className="mt-2 flex w-full items-center justify-center rounded-lg bg-white px-8 py-3.5 font-semibold text-blue-700 transition-all hover:bg-blue-50 focus:ring-4 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-70"
                              >
                                {formStep === "submitting" ? (
                                  <span className="flex items-center gap-2">
                                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></span>
                                    Sending...
                                  </span>
                                ) : (
                                  "Request QR Demo"
                                )}
                              </button>

                              <p className="mt-4 text-center text-xs text-blue-200/60">
                                By submitting, you agree to be contacted for NexResto QR ordering onboarding.
                              </p>
                            </form>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
