# Tenant Isolation Migration Notes

## Summary
This update tightens tenant isolation and introduces scoped cache keys plus centralized tenant authorization for sensitive API routes.

## Breaking/Structural Changes
- Added shared server authorization helper:
  - `lib/server/authz/tenant.ts`
- Updated routes to use centralized tenant authorization with stale-claims fallback:
  - `app/api/menu/list/route.ts`
  - `app/api/menu/categories/route.ts`
  - `app/api/menu/import/route.ts`
  - `app/api/tenant/name/route.ts`
  - `app/api/search/global/route.ts`

## Local Storage Key Changes
- Customer table memory is now tenant-scoped by `restaurantId`:
  - `nexresto:last-table-id:<restaurantId>`
- Customer order history is now tenant-scoped by `restaurant` query param:
  - `nexresto:order-history:<restaurantId>`
- Legacy unscoped menu availability fallback reads were removed.

## Operational Migration Guidance
1. Existing browsers may still hold legacy unscoped keys.
2. Safe cleanup recommendation on next login/customer-page load:
   - remove `hotelmenu_availability`
   - remove `orderHistory`
   - remove `nexresto:last-table-id`
3. Verify customer flows with at least 2 tenants in separate tabs and the same browser profile.

## Risk Mitigation
- Cross-tenant API reads/writes now return explicit 403 tenant-mismatch errors.
- Stale custom claims no longer force false negatives when valid tenant staff docs exist.
- Customer menu remains fail-closed on tenant fetch failure (no global static fallback data).
