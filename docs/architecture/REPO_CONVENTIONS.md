# Repository Conventions

## Intent
Keep tenant safety, server/client boundaries, and domain ownership explicit as the codebase grows.

## Directory Guidelines
- `app/api/...`: route handlers only (request parsing, authz, response mapping).
- `lib/server/...`: server-only modules (admin authz, Firestore admin helpers, scheduled jobs).
- `lib/client/...`: browser-only utilities (local/session storage, UI-only helpers).
- `features/<domain>/...`: reusable domain logic and validators (menu, orders, inventory, auth).
- `types/...`: shared DTOs/contracts used by routes and UI.
- `docs/architecture/...`: tenancy model, authz flow, migration notes, and runbooks.

## Tenant Safety Rules
- URL/query tenant scope is authoritative for all reads/writes.
- All sensitive APIs must call shared tenant authorization helpers.
- Cross-tenant attempts must return `403` with clear tenant-mismatch messaging.
- No global fallback datasets in tenant customer flows.
- Browser cache keys must be tenant-scoped.

## API Handler Pattern
1. Validate auth header and tenant id.
2. Authorize with shared helper (`read`/`manage`).
3. Run tenant-scoped Firestore query path (`restaurants/{tenantId}/...`).
4. Return typed payload and stable status code.
5. Use typed/defensive error mapping (avoid `any`).

## Refactor Migration Plan
1. Move repeated route auth logic into `lib/server/authz`.
2. Move route-local data mapping into `features/*/server` modules.
3. Move client cache helpers into `lib/client/storage`.
4. Add shared DTO types in `types/contracts` for API requests/responses.
5. Keep route files thin and declarative.
