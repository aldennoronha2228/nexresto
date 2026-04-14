"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type RoiInputs = {
  dailyCustomers: number;
  averageBillPerTable: number;
  staffOnOrderTaking: number;
  staffHourlyCost: number;
  currentPosMonthlyCost: number;
  orderErrorRate: number;
  avgOrderErrorCost: number;
  ourSystemMonthlyCost: number;
};

type RoiPresetId = "budget" | "midRange" | "premium" | "specialty" | "custom";

const ROI_PRESETS: Array<{ id: Exclude<RoiPresetId, "custom">; label: string; values: RoiInputs }> = [
  {
    id: "budget",
    label: "Budget Cafe",
    values: {
      dailyCustomers: 150,
      averageBillPerTable: 350,
      staffOnOrderTaking: 3,
      staffHourlyCost: 80,
      currentPosMonthlyCost: 1500,
      orderErrorRate: 8,
      avgOrderErrorCost: 80,
      ourSystemMonthlyCost: 999,
    },
  },
  {
    id: "midRange",
    label: "Mid-Range Cafe",
    values: {
      dailyCustomers: 260,
      averageBillPerTable: 550,
      staffOnOrderTaking: 4,
      staffHourlyCost: 110,
      currentPosMonthlyCost: 4200,
      orderErrorRate: 6,
      avgOrderErrorCost: 120,
      ourSystemMonthlyCost: 1499,
    },
  },
  {
    id: "premium",
    label: "Premium Cafe",
    values: {
      dailyCustomers: 360,
      averageBillPerTable: 900,
      staffOnOrderTaking: 6,
      staffHourlyCost: 180,
      currentPosMonthlyCost: 9000,
      orderErrorRate: 5,
      avgOrderErrorCost: 180,
      ourSystemMonthlyCost: 2999,
    },
  },
  {
    id: "specialty",
    label: "Specialty Coffee",
    values: {
      dailyCustomers: 240,
      averageBillPerTable: 280,
      staffOnOrderTaking: 3,
      staffHourlyCost: 95,
      currentPosMonthlyCost: 2800,
      orderErrorRate: 7,
      avgOrderErrorCost: 90,
      ourSystemMonthlyCost: 1299,
    },
  },
];

const ROI_FIELDS: Array<{ key: keyof RoiInputs; label: string }> = [
  { key: "dailyCustomers", label: "Daily Customers (covers)" },
  { key: "averageBillPerTable", label: "Average Bill per Table (₹)" },
  { key: "staffOnOrderTaking", label: "Staff on Order-Taking (per shift)" },
  { key: "staffHourlyCost", label: "Staff Hourly Cost (₹)" },
  { key: "currentPosMonthlyCost", label: "Current POS Monthly Cost (₹)" },
  { key: "orderErrorRate", label: "Order Error Rate (%)" },
  { key: "avgOrderErrorCost", label: "Avg Order Error Cost (₹)" },
  { key: "ourSystemMonthlyCost", label: "Our System Monthly Cost (₹)" },
];

const MONTH_DAYS = 30;
const STAFF_ORDER_HOURS_PER_DAY = 4;
const ERROR_REDUCTION_RATE = 0.9;
const STAFF_REDEPLOYMENT_RATE = 0.75;
const LOYALTY_UPLIFT_RATE = 0.12;

function formatInr(value: number): string {
  return `₹${new Intl.NumberFormat("en-IN").format(Math.round(value))}`;
}

function calculateRoi(inputs: RoiInputs) {
  const monthlyOrders = inputs.dailyCustomers * MONTH_DAYS;
  const monthlyRevenue = monthlyOrders * inputs.averageBillPerTable;
  const monthlyRevenueLost = monthlyOrders * (inputs.orderErrorRate / 100) * inputs.avgOrderErrorCost;
  const staffHoursOnOrdering = inputs.staffOnOrderTaking * STAFF_ORDER_HOURS_PER_DAY * MONTH_DAYS;
  const staffCostOnOrdering = staffHoursOnOrdering * inputs.staffHourlyCost;
  const currentMonthlyBurden = monthlyRevenueLost + staffCostOnOrdering + inputs.currentPosMonthlyCost;

  const errorSavings = monthlyRevenueLost * ERROR_REDUCTION_RATE;
  const staffRedeploymentValue = staffCostOnOrdering * STAFF_REDEPLOYMENT_RATE;
  const loyaltyRevenueUplift = monthlyRevenue * LOYALTY_UPLIFT_RATE;
  const posDelta = inputs.currentPosMonthlyCost - inputs.ourSystemMonthlyCost;
  const netMonthlyGain = errorSavings + staffRedeploymentValue + loyaltyRevenueUplift + posDelta;
  const paybackDays =
    netMonthlyGain <= 0 ? null : Math.max(0, Math.round(inputs.ourSystemMonthlyCost / (netMonthlyGain / MONTH_DAYS)));

  return {
    monthlyRevenueLost,
    staffHoursOnOrdering,
    staffCostOnOrdering,
    currentMonthlyBurden,
    errorSavings,
    staffRedeploymentValue,
    loyaltyRevenueUplift,
    netMonthlyGain,
    paybackDays,
  };
}

export default function RoiPage() {
  const [roiPresetId, setRoiPresetId] = useState<RoiPresetId>("budget");
  const [roiInputs, setRoiInputs] = useState<RoiInputs>({ ...ROI_PRESETS[0].values });
  const roiSummary = useMemo(() => calculateRoi(roiInputs), [roiInputs]);

  const onRoiPresetSelect = (presetId: RoiPresetId) => {
    setRoiPresetId(presetId);
    if (presetId === "custom") return;
    const selected = ROI_PRESETS.find((preset) => preset.id === presetId);
    if (!selected) return;
    setRoiInputs({ ...selected.values });
  };

  const onRoiInputChange = (key: keyof RoiInputs, rawValue: string) => {
    const parsed = rawValue === "" ? 0 : Number(rawValue);
    if (!Number.isFinite(parsed)) return;
    setRoiPresetId("custom");
    setRoiInputs((prev) => ({ ...prev, [key]: Math.max(0, parsed) }));
  };

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

      <main className="hero-gradient pt-24 lg:pt-28">
        <section className="px-6 pb-16 pt-10 lg:px-8 lg:pb-20">
          <div className="mx-auto max-w-7xl rounded-2xl border border-white/10 bg-[#171717] p-6 text-[#e5e2e1] md:p-8 lg:p-10">
            <div className="mx-auto max-w-3xl text-center">
              <p className="mb-3 text-[11px] uppercase tracking-[0.2em] text-[#8f8fa0]">ROI Intelligence</p>
              <h1 className="text-4xl font-extrabold tracking-tight text-white md:text-6xl">ROI Calculator</h1>
              <p className="mt-5 text-base leading-relaxed text-[#c5c5d6] md:text-lg">
                Model your monthly operational impact with the same decision-grade clarity you get across the NexResto platform.
              </p>
            </div>

            <div className="mt-9 flex flex-wrap justify-center gap-3">
              {ROI_PRESETS.map((preset) => {
                const active = roiPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    className={`rounded-full border px-5 py-2 text-sm font-semibold transition sm:px-6 sm:py-2.5 ${
                      active
                        ? "border-[#3e54d3] bg-[#3e54d3]/20 text-[#d8dbff]"
                        : "border-white/15 bg-[#20201f] text-[#c5c5d6] hover:border-[#3e54d3]/70 hover:text-white"
                    }`}
                    onClick={() => onRoiPresetSelect(preset.id)}
                    type="button"
                  >
                    {preset.label}
                  </button>
                );
              })}
              <button
                className={`rounded-full border px-5 py-2 text-sm font-semibold transition sm:px-6 sm:py-2.5 ${
                  roiPresetId === "custom"
                    ? "border-[#3e54d3] bg-[#3e54d3]/20 text-[#d8dbff]"
                    : "border-white/15 bg-[#20201f] text-[#c5c5d6] hover:border-[#3e54d3]/70 hover:text-white"
                }`}
                onClick={() => onRoiPresetSelect("custom")}
                type="button"
              >
                Custom
              </button>
            </div>

            <div className="mt-10 rounded-2xl border border-white/10 bg-[#1b1b1b] p-5 md:p-8">
              <h2 className="text-3xl font-bold text-white">Enter Your Restaurant&apos;s Numbers</h2>
              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {ROI_FIELDS.map((field) => (
                  <label className="block" key={field.key}>
                    <span className="mb-2 block text-sm uppercase tracking-[0.12em] text-[#8f8fa0]">{field.label}</span>
                    <input
                      className="w-full rounded-xl border border-white/10 bg-[#161616] px-4 py-3 text-2xl font-semibold text-white outline-none transition focus:border-[#3e54d3] focus:ring-2 focus:ring-[#3e54d3]/25"
                      min={0}
                      onChange={(event) => onRoiInputChange(field.key, event.target.value)}
                      type="number"
                      value={roiInputs[field.key]}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-8 rounded-2xl border border-white/10 bg-[#1b1b1b] p-5 md:p-8">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">Your Monthly ROI Summary</h2>
                <span
                  className={`rounded-full px-4 py-1.5 text-sm font-bold ${
                    roiSummary.paybackDays === null ? "border border-white/15 bg-[#20201f] text-[#c5c5d6]" : "bg-emerald-500/20 text-emerald-300"
                  }`}
                >
                  {roiSummary.paybackDays === null ? "Payback not reached" : `Payback in ${roiSummary.paybackDays} days`}
                </span>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <article className="surface-card rounded-xl p-5 text-center">
                  <p className="text-sm uppercase tracking-[0.12em] text-[#8f8fa0]">Monthly Revenue Lost (Errors)</p>
                  <p className="mt-3 text-3xl font-black text-rose-300">{formatInr(roiSummary.monthlyRevenueLost)}</p>
                </article>
                <article className="surface-card rounded-xl p-5 text-center">
                  <p className="text-sm uppercase tracking-[0.12em] text-[#8f8fa0]">Staff Hours on Order-Taking/month</p>
                  <p className="mt-3 text-3xl font-black text-rose-300">{Math.round(roiSummary.staffHoursOnOrdering)} hrs</p>
                </article>
                <article className="surface-card rounded-xl p-5 text-center">
                  <p className="text-sm uppercase tracking-[0.12em] text-[#8f8fa0]">Staff Cost on Order-Taking/month</p>
                  <p className="mt-3 text-3xl font-black text-rose-300">{formatInr(roiSummary.staffCostOnOrdering)}</p>
                </article>
                <article className="surface-card rounded-xl p-5 text-center">
                  <p className="text-sm uppercase tracking-[0.12em] text-[#8f8fa0]">Current Total Monthly Burden</p>
                  <p className="mt-3 text-3xl font-black text-amber-300">{formatInr(roiSummary.currentMonthlyBurden)}</p>
                </article>
                <article className="surface-card rounded-xl p-5 text-center">
                  <p className="text-sm uppercase tracking-[0.12em] text-[#8f8fa0]">Error Savings with Our System</p>
                  <p className="mt-3 text-3xl font-black text-emerald-300">{formatInr(roiSummary.errorSavings)}</p>
                </article>
                <article className="surface-card rounded-xl p-5 text-center">
                  <p className="text-sm uppercase tracking-[0.12em] text-[#8f8fa0]">Staff Redeployment Value/month</p>
                  <p className="mt-3 text-3xl font-black text-emerald-300">{formatInr(roiSummary.staffRedeploymentValue)}</p>
                </article>
                <article className="surface-card rounded-xl p-5 text-center">
                  <p className="text-sm uppercase tracking-[0.12em] text-[#8f8fa0]">Loyalty Revenue Uplift (12%)</p>
                  <p className="mt-3 text-3xl font-black text-emerald-300">{formatInr(roiSummary.loyaltyRevenueUplift)}</p>
                </article>
                <article className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-5 text-center">
                  <p className="text-sm uppercase tracking-[0.12em] text-[#8f8fa0]">Net Monthly Gain</p>
                  <p className="mt-3 text-3xl font-black text-emerald-300">{formatInr(roiSummary.netMonthlyGain)}</p>
                </article>
              </div>
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
                src="/nexresto-mark.svg?v=20260415a"
              />
              <p className="text-lg font-bold text-white">NexResto</p>
            </div>
            <p className="mt-3 max-w-sm text-sm text-stone-400">Crafting the digital future of premium dining operations.</p>
          </div>
          <div>
            <p className="mb-3 text-sm font-medium text-white">Company</p>
            <div className="space-y-2 text-sm text-stone-400">
              <Link className="block hover:text-emerald-400" href="/">Home</Link>
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
      `}</style>
    </div>
  );
}
