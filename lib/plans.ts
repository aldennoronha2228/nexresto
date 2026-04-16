import { normalizeSubscriptionTier } from '@/lib/subscription-features';

export const PLANS = ['starter', 'pro', 'growth'] as const;

export type PlanId = (typeof PLANS)[number];

export const FEATURES = ['shared_table_ordering', 'split_billing'] as const;

export type FeatureId = (typeof FEATURES)[number];

export const PLAN_FEATURES: Record<PlanId, Record<FeatureId, boolean>> = {
    starter: {
        shared_table_ordering: false,
        split_billing: false,
    },
    pro: {
        shared_table_ordering: true,
        split_billing: true,
    },
    growth: {
        shared_table_ordering: true,
        split_billing: true,
    },
};

export function normalizePlan(raw: unknown): PlanId {
    const value = String(raw || '').trim().toLowerCase();
    if (value === 'pro') return 'pro';
    if (value === 'growth') return 'growth';
    if (value === 'pro_chain' || value === '2.5k') return 'growth';

    const canonicalTier = normalizeSubscriptionTier(raw);
    if (canonicalTier === 'growth') return 'pro';
    if (canonicalTier === 'pro_chain') return 'growth';
    return 'starter';
}

export function resolvePlanFromRestaurantData(data: Record<string, unknown> | null | undefined): PlanId {
    if (!data) return 'starter';
    return normalizePlan(data.plan || data.subscription_plan || data.subscription_tier);
}
