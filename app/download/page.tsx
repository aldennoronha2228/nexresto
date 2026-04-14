import Link from 'next/link';
import { ArrowDownToLine, Clock3, ShieldCheck } from 'lucide-react';
import type { ComponentType } from 'react';

type PlatformCard = {
  name: string;
  icon?: ComponentType<{ className?: string }>;
  iconSrc?: string;
  iconAlt?: string;
  iconSizeClass?: string;
  iconBoxSizeClass?: string;
  status: string;
  details: string;
  available: boolean;
  href?: string;
  ctaLabel: string;
  buildInfo: string;
  iconTone: string;
  badgeTone: string;
};

const PLATFORMS: PlatformCard[] = [
  {
    name: 'Android',
    iconSrc: '/download/android.svg',
    iconAlt: 'Android logo',
    status: 'Available',
    details: 'Native Android app for live operations, order flow, and service controls.',
    available: true,
    href: '/nexresto-android.apk',
    ctaLabel: 'Download APK',
    buildInfo: 'APK • v1.0.0 • 6.0 MB',
    iconTone: 'text-emerald-300 border-emerald-300/25 bg-emerald-500/10',
    badgeTone: 'border border-emerald-300/30 bg-emerald-500/10 text-emerald-300',
  },
  {
    name: 'iOS',
    iconSrc: '/download/ios.svg',
    iconAlt: 'Apple logo',
    status: 'Coming Soon',
    details: 'Optimized iPhone and iPad experience for premium restaurant teams.',
    available: false,
    ctaLabel: 'Coming Soon',
    buildInfo: 'TestFlight build planned',
    iconTone: 'text-slate-200 border-slate-300/20 bg-slate-500/10',
    badgeTone: 'border border-amber-300/30 bg-amber-500/10 text-amber-300',
  },
  {
    name: 'Windows',
    iconSrc: '/download/windows.svg',
    iconAlt: 'Windows logo',
    iconSizeClass: 'h-10 w-10',
    iconBoxSizeClass: 'h-16 w-16',
    status: 'Available',
    details: 'Desktop installer for front desk and operations workflows. Run the setup EXE to install.',
    available: true,
    href: '/download/NexRestoSetup.exe',
    ctaLabel: 'Download Installer',
    buildInfo: 'EXE Installer • win32-x64',
    iconTone: 'border-orange-300/35 bg-black/45',
    badgeTone: 'border border-emerald-300/30 bg-emerald-500/10 text-emerald-300',
  },
];

export default function DownloadPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#131313] text-[#e5e2e1]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-20 h-80 w-80 rounded-full bg-[#3e54d3]/18 blur-3xl" />
        <div className="absolute right-0 top-32 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute bottom-10 left-1/3 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />
      </div>

      <header className="relative z-10 border-b border-white/5 bg-black/55 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8">
          <div className="flex items-center gap-3">
            <img
              alt="NexResto logo mark"
              className="h-10 w-10 rounded-xl border border-white/15 bg-black/30 p-1"
              src="/nexresto-mark.svg?v=20260415a"
            />
            <span className="text-xl font-bold tracking-tight text-white">NexResto Download Center</span>
          </div>

          <Link
            href="/"
            className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Back Home
          </Link>
        </div>
      </header>

      <main className="relative z-10 px-6 pb-20 pt-12 lg:px-8 lg:pt-16">
        <section className="mx-auto max-w-7xl">
          <div className="mb-10">
            <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#bbc3ff]">
              Platform Downloads
            </p>
            <h1 className="mt-6 text-4xl font-extrabold leading-tight text-white sm:text-5xl lg:text-6xl">
              Choose Your Device
            </h1>
            <p className="mt-4 text-base leading-relaxed text-[#c5c5d6] sm:text-lg">
              Select your platform below. Android, iOS, and Windows builds are listed here with release readiness.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3 text-xs text-[#9ea4b8]">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
                Verified package
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                <Clock3 className="h-3.5 w-3.5 text-[#bbc3ff]" />
                Updated April 2026
              </span>
            </div>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {PLATFORMS.map((platform) => {
              const Icon = platform.icon;
              return (
                <article key={platform.name} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#20201f] p-7 transition hover:border-white/20 hover:bg-[#242423]">
                  <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-white/5 blur-2xl" />

                  <div className={`mb-5 inline-flex items-center justify-center rounded-2xl border ${platform.iconBoxSizeClass || 'h-14 w-14'} ${platform.iconTone}`}>
                    {platform.iconSrc ? (
                      <img
                        src={platform.iconSrc}
                        alt={platform.iconAlt || `${platform.name} logo`}
                        className={`${platform.iconSizeClass || 'h-8 w-8'} object-contain`}
                      />
                    ) : Icon ? (
                      <Icon className="h-6 w-6" />
                    ) : null}
                  </div>

                  <h2 className="text-2xl font-bold text-white">{platform.name}</h2>
                  <p className="mt-3 text-sm leading-relaxed text-[#c5c5d6]">{platform.details}</p>
                  <p className="mt-3 text-xs uppercase tracking-[0.12em] text-[#8f8fa0]">{platform.buildInfo}</p>

                  <div className={`mt-5 inline-flex rounded-md px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${platform.badgeTone}`}>
                    {platform.status}
                  </div>

                  {platform.available && platform.href ? (
                    <a
                      href={platform.href}
                      download
                      className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#3e54d3]/60 bg-[#3e54d3]/20 px-4 py-2.5 text-sm font-semibold text-[#d8dbff] transition hover:bg-[#3e54d3]/30"
                    >
                      <ArrowDownToLine className="h-4 w-4" />
                      {platform.ctaLabel}
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="mt-7 w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-[#9ea1b8]"
                    >
                      {platform.ctaLabel}
                    </button>
                  )}
                </article>
              );
            })}
          </div>

          <p className="mt-8 text-sm text-[#9ca3b7]">
            Need another platform release first? Contact support and we will prioritize your deployment queue.
          </p>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/5 bg-black/60">
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
