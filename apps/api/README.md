# API App (Planned)

This folder is reserved for a future standalone backend service (Node/Express or Fastify).

Current production backend routes are implemented in Next.js Route Handlers under `apps/web/app/api/*` to avoid breaking existing behavior.

## Migration plan

1. Move route handlers feature-by-feature into this service.
2. Reuse logic from `lib/server` and `services`.
3. Keep contract parity with existing `/api/*` endpoints.
4. Cut over behind versioned endpoints and integration tests.
