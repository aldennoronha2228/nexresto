import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "NexResto terms of service and usage conditions.",
};

const lastUpdated = "April 1, 2026";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#131313] text-[#e5e2e1]">
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
            <Link className="transition-colors hover:text-white" href="/pricing">Pricing</Link>
            <Link className="transition-colors hover:text-white" href="/roi">ROI</Link>
            <Link className="transition-colors hover:text-white" href="/privacy">Privacy</Link>
          </nav>

          <Link
            className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10 sm:px-4 sm:py-2 sm:text-sm"
            href="/login"
          >
            Login
          </Link>
        </div>
      </header>

      <main
        className="px-4 pb-16 pt-28 text-[#e5e2e1] sm:px-6 lg:px-8"
        style={{
          background:
            "radial-gradient(60rem 32rem at 8% 6%, rgba(62, 84, 211, 0.2), transparent 60%), radial-gradient(44rem 28rem at 92% 10%, rgba(16, 185, 129, 0.12), transparent 60%), #131313",
        }}
      >
      <div className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-[#171717] p-6 sm:p-8">
        <div className="mb-8 border-b border-white/10 pb-6">
          <p className="text-xs uppercase tracking-[0.18em] text-[#8f8fa0]">Legal</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Terms of Service</h1>
          <p className="mt-3 text-sm text-[#c5c5d6]">
            Last updated: {lastUpdated}
          </p>
          <p className="mt-4 text-sm leading-relaxed text-[#c5c5d6]">
            These terms govern access to and use of the NexResto platform by restaurants, staff users, and authorized operators.
          </p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-[#c5c5d6]">
          <section>
            <h2 className="text-lg font-semibold text-white">1. Acceptance and Scope</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>By using NexResto, you agree to these terms and all applicable policies.</li>
              <li>These terms apply to workspace owners, employees, and any invited users.</li>
              <li>If you use NexResto on behalf of a business, you confirm authority to bind that business.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">2. Account Responsibilities</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>You must provide accurate account and business information.</li>
              <li>You are responsible for maintaining credential confidentiality and account security.</li>
              <li>You must promptly notify NexResto if unauthorized account access is suspected.</li>
              <li>Each user must use only authorized roles and permissions assigned by the organization.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">3. Acceptable Use</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>Use the service only for lawful restaurant or hospitality operations.</li>
              <li>Do not attempt to bypass security controls, rate limits, or access boundaries.</li>
              <li>Do not upload malicious content, harmful scripts, or illegal material.</li>
              <li>Do not abuse APIs or perform activity that could degrade platform stability.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">4. Subscriptions, Billing, and Plan Changes</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>Paid plans are billed according to the active subscription cycle.</li>
              <li>Plan features, limits, and usage thresholds vary by tier.</li>
              <li>Upgrades may apply immediately; downgrades may take effect next cycle as applicable.</li>
              <li>Failure to maintain payment may result in restricted access or service suspension.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">5. Data Ownership and Platform License</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>You retain ownership of your business and operational data submitted to NexResto.</li>
              <li>You grant NexResto a limited license to process data to operate and improve the service.</li>
              <li>NexResto retains ownership of platform software, workflows, and product IP.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">6. Service Availability and Support</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>We aim for high availability but do not guarantee uninterrupted or error-free service.</li>
              <li>Maintenance windows, infrastructure incidents, or third-party outages may affect access.</li>
              <li>Support is provided according to plan scope and operational capacity.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">7. Intellectual Property</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>All NexResto trademarks, code, design systems, and documentation are protected IP.</li>
              <li>You may not copy, resell, reverse engineer, or create unauthorized derivative products.</li>
              <li>Any feedback provided may be used to improve the service without additional compensation.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">8. Disclaimers</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>The service is provided on an as-available basis within practical operating limits.</li>
              <li>We do not guarantee specific business outcomes such as revenue increase or cost reduction.</li>
              <li>You are responsible for operational decisions made based on platform insights.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">9. Limitation of Liability</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>To the extent permitted by law, NexResto is not liable for indirect or consequential losses.</li>
              <li>Liability, if applicable, is limited to amounts paid for service in the applicable period.</li>
              <li>These limits apply unless restricted by non-waivable law.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">10. Suspension and Termination</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>We may suspend accounts for abuse, non-payment, security risk, or legal non-compliance.</li>
              <li>You may stop using the service at any time according to your billing terms.</li>
              <li>Following termination, data handling follows the active privacy and retention policy.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">11. Governing Terms and Updates</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>These terms may be updated to reflect legal, product, or operational changes.</li>
              <li>Continued use after an update indicates acceptance of the revised terms.</li>
              <li>If any provision is unenforceable, remaining provisions continue in effect.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">12. Contact</h2>
            <p className="mt-3">
              For contractual or legal questions, contact NexResto through your official support or account management channel.
            </p>
          </section>
        </div>

        <div className="mt-10 border-t border-white/10 pt-6 text-sm">
          <Link href="/" className="font-medium text-emerald-300 hover:text-emerald-200">
            Back to Home
          </Link>
        </div>
      </div>
      </main>

      <footer className="border-t border-white/5 bg-black/60">
        <div className="mx-auto max-w-7xl px-6 py-8 text-sm text-stone-500 lg:px-8">(c) 2026 NexResto. Premium Dining Experience.</div>
      </footer>

    </div>
  );
}
