import Image from 'next/image';
import Link from 'next/link';

const HERO_IMAGE = '/frames/frame_001.jpg';

const FEATURE_CARDS = [
  {
    title: 'Live Menu Publishing',
    body: 'Update menu items in real time and publish instantly to your branded tenant page.',
  },
  {
    title: 'QR Ordering',
    body: 'Guests scan once and order from table-specific links with synchronized kitchen visibility.',
  },
  {
    title: 'Multi-Tenant Isolation',
    body: 'Each restaurant runs in its own isolated context for menu data, branding, and access control.',
  },
];

export default function RootPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 pb-16 pt-12 md:grid-cols-2 md:items-center md:px-6 md:pt-16">
        <div className="space-y-6">
          <p className="inline-flex items-center rounded-full border border-cyan-300/40 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">
            NexResto Platform
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight text-white md:text-5xl">
            Digital Menus and Ordering for Restaurants and Hotels
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-slate-300 md:text-lg">
            Launch branded online menus, table QR ordering, and real-time kitchen workflows with a fast tenant-aware SaaS stack.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/login"
              className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-300"
            >
              Open Dashboard
            </Link>
            <Link
              href="/customer"
              className="rounded-xl border border-slate-600 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-400 hover:bg-slate-900"
            >
              View Customer Menu
            </Link>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl shadow-cyan-950/40">
          <Image
            src={HERO_IMAGE}
            alt="NexResto digital menu dashboard preview"
            width={1280}
            height={720}
            priority
            fetchPriority="high"
            quality={68}
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 640px"
            className="h-auto w-full object-cover"
          />
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 pb-20 md:grid-cols-3 md:px-6">
        {FEATURE_CARDS.map((card) => (
          <article
            key={card.title}
            className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"
          >
            <h2 className="text-lg font-bold text-white">{card.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">{card.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
