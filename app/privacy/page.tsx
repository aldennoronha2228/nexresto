import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "NexResto privacy policy and data handling practices.",
};

const lastUpdated = "April 1, 2026";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-slate-900/70 p-6 sm:p-8">
        <div className="mb-8 border-b border-white/10 pb-6">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Legal</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Privacy Policy</h1>
          <p className="mt-3 text-sm text-slate-300">
            Last updated: {lastUpdated}
          </p>
          <p className="mt-4 text-sm leading-relaxed text-slate-300">
            This policy explains how NexResto collects, uses, stores, and protects information when you use our platform.
          </p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-slate-300">
          <section>
            <h2 className="text-lg font-semibold text-white">1. Information We Collect</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>
                Account information: name, email, phone, restaurant name, role, and authentication details.
              </li>
              <li>
                Business configuration data: menus, table layouts, branding assets, pricing, and outlet settings.
              </li>
              <li>
                Transactional data: orders, order status history, and operational activity needed to deliver service.
              </li>
              <li>
                Technical data: device type, browser metadata, IP address, and security logs for fraud prevention.
              </li>
              <li>
                Support and communication data: tickets, feedback, and messages sent through support channels.
              </li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">2. How We Use Information</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>To provide core product functionality and maintain your restaurant workspace.</li>
              <li>To process requests such as onboarding demos, account setup, and support follow-ups.</li>
              <li>To improve reliability, monitor performance, and detect abuse or unauthorized access.</li>
              <li>To communicate service updates, product notices, and important security alerts.</li>
              <li>To meet compliance, auditing, and legal obligations.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">3. Legal Bases and Permissions</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>Contract necessity: data required to deliver subscribed services.</li>
              <li>Legitimate interest: service improvement, analytics, and security controls.</li>
              <li>Consent: optional communications and any data processing where consent is required.</li>
              <li>Legal obligation: retention or disclosure required by applicable law.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">4. Data Sharing and Processors</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>
                We do not sell personal data.
              </li>
              <li>
                We may share limited data with trusted infrastructure providers for hosting, analytics, and email delivery.
              </li>
              <li>
                Access is limited to authorized personnel and service providers under confidentiality obligations.
              </li>
              <li>
                We may disclose data if required for legal requests, fraud prevention, or rights protection.
              </li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">5. Data Retention</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>Account and business data is retained while your workspace is active.</li>
              <li>Operational logs may be retained longer for security, audit, and compliance requirements.</li>
              <li>When deletion is requested, we remove or anonymize data unless retention is legally required.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">6. Security Measures</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>Transport encryption (HTTPS), secure authentication flows, and role-based access controls.</li>
              <li>Environment isolation and tenant-aware authorization controls.</li>
              <li>Monitoring for suspicious activity, abuse patterns, and unauthorized access attempts.</li>
              <li>Regular review of security configuration and incident response procedures.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">7. Your Privacy Rights</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>You may request access to data associated with your account.</li>
              <li>You may request correction of inaccurate information.</li>
              <li>You may request deletion of data, subject to legal and contractual requirements.</li>
              <li>You may object to or limit specific processing where applicable under local law.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">8. International Data Handling</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>Data may be processed in regions where our infrastructure providers operate.</li>
              <li>Where required, we apply contractual and organizational safeguards for cross-border transfers.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">9. Policy Updates</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>We may update this policy to reflect legal, technical, or product changes.</li>
              <li>Material changes will be communicated through in-product notice or account email.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">10. Contact</h2>
            <p className="mt-3">
              For privacy requests, contact our support team through the official NexResto support channel used by your organization.
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
  );
}

