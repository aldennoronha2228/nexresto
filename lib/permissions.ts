import { PLAN_FEATURES, type FeatureId, type PlanId } from '@/lib/plans';

export function hasFeature(plan: PlanId, feature: FeatureId): boolean {
    return PLAN_FEATURES[plan][feature] === true;
}
