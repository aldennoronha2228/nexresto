# Tenant Isolation Strategy

## Scope Source of Truth
- URL scope is authoritative for tenant-bound dashboard/menu operations.
- Dashboard paths use `/<storeId>/...` as the primary tenant identifier.
- Customer paths require `?restaurant=<id>`; missing ID fails closed (empty data + retry UI).

## Authorization Model
- API routes `/api/menu/list`, `/api/menu/categories`, `/api/menu/import` require Bearer tokens.
- Access is granted only when one of these is true:
  - `role == super_admin`
  - `claims.restaurant_id` or `claims.tenant_id` matches requested `restaurantId`
  - Stale-claims fallback: staff role document in `restaurants/{restaurantId}/staff/{uid}` confirms allowed role.
- Cross-tenant mismatch returns `403` with explicit tenant-mismatch errors.

## Data Access Paths
- Menu/categories are loaded only from explicit tenant paths:
  - `restaurants/{restaurantId}/categories`
  - `restaurants/{restaurantId}/menu_items`
- Customer menu mapping accepts only categories that exist in the same tenant category set.

## Fail-Closed Behavior
- Customer menu does not use static/shared fallback data when tenant fetch fails.
- Failure state shows empty menu and explicit retry action.

## Local Cache Isolation
- Availability overrides are scoped by tenant key in localStorage.
- Customer table memory is scoped by `restaurantId` to avoid cross-tenant table bleed.
- Legacy unscoped availability fallback reads were removed to enforce strict isolation.

## Firestore Rules Reinforcement
- For menu/category reads:
  - unauthenticated users: allowed (customer public menu flow)
  - authenticated users: only own tenant or super admin
- Writes remain restricted to owner/admin/super-admin in tenant scope.
