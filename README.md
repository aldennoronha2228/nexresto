# NexResto

<p align="center">
	<strong>Multi-Tenant Restaurant Platform</strong><br />
	Dashboard, customer experience, AI assistance, and operations in one codebase.
</p>

<p align="center">
	<img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js" />
	<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
	<img alt="Firebase" src="https://img.shields.io/badge/Firebase-Auth%20%7C%20Firestore%20%7C%20Storage-FFCA28?style=for-the-badge&logo=firebase&logoColor=black" />
	<img alt="Jest" src="https://img.shields.io/badge/Tests-Jest-C21325?style=for-the-badge&logo=jest&logoColor=white" />
</p>

---

## What Is NexResto?

NexResto is a full-stack, multi-tenant platform for restaurants to run digital menus, manage orders, monitor operations, and personalize customer-facing branding.

It is built with a production-first architecture that separates app entrypoints, domain features, shared services, and infrastructure concerns.

## The 4-Layer Product Flow

| Layer | Purpose |
| --- | --- |
| Tenant & Auth | Secure store-based access with role guards for owner, manager, staff, and super-admin. |
| Operations | Orders, menu, inventory, analytics, and table-aware workflows for day-to-day management. |
| Customer Experience | Branded customer menu, cart, order history, and live theme-aware storefront behavior. |
| AI Assistance | Concierge and support assistants with Groq-first routing and fallback logic. |

## Core Capabilities

- Multi-tenant routing by `storeId`
- Restaurant and super-admin authentication flows
- Role-based access control and tenant isolation
- Table-aware customer menu + cart + order history
- Dashboard branding with live preview sync
- Firestore-first data model with fallback handling for branding

## What Is New (April 2026)

- Support chatbot UX refresh:
	- compact dark chat styling
	- quick suggestions auto-hidden after conversation starts
	- compact `Clear` action in the header
- AI provider reliability:
	- Groq prioritized for support and concierge routes
	- automatic endpoint normalization for `/chat/completions`
	- model fallback handling for Groq variants
	- OpenAI/Gemini fallback retained
- Groq quota resilience:
	- support for multiple Groq API keys
	- automatic failover when one key reaches rate/quota limits
- Dashboard UX improvements:
	- mobile table editing with tap-select + nudge movement controls
	- cleaner subscription summary controls in account settings
	- pricing cards unified via shared `PRICING_PLANS`
- Deployment stability:
	- post-build sync ensures root `.next/routes-manifest.json` availability for runtime environments that expect root output

## Branding System

Branding is persisted with a primary + fallback strategy:

- `branding/{restaurantId}` (primary)
- `restaurants/{restaurantId}.branding` (fallback/mirror)

Supported branding controls:

- Primary, secondary, and background colors
- Font family configuration
- Logo and hero image uploads
- Hero overlay opacity + headline + tagline
- Hero visibility toggles
- Catalog headline and featured images payloads
- Live preview synchronization via `postMessage`

Related API routes:

- `GET/POST /api/branding/settings`
- `POST /api/branding/upload`
- `GET /api/tenant/branding`

## Quick Start

1. Install dependencies.

```bash
npm install
```

2. Configure `.env` (or `.env.local`).

- Firebase client config: `NEXT_PUBLIC_FIREBASE_*`
- Firebase Admin credentials: `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
- Tenant defaults: `NEXT_PUBLIC_RESTAURANT_ID`
- Optional integrations:
	- Email: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
	- AI: `GROQ_API_KEY` (recommended), `GROQ_API_KEY_2`, `OPENAI_API_KEY`, `GEMINI_API_KEY`

3. Start local development.

```bash
npm run dev
```

4. Build for production.

```bash
npm run build
```

## Testing

```bash
npm test
npm run test:security
```

## Secure Build / Obfuscation

```bash
npm run build:secure
npm run obfuscate:build
npm run verify:obfuscation
```

Reference: `docs/SECURE_BUILD_OBFUSCATION.md`

## Windows Desktop Auto-Updates

The repository includes an updater-enabled desktop wrapper under `desktop/`.

Key notes:

- Existing users on legacy ZIP/EXE builds must install the new installer one time.
- After migration, the app checks GitHub Releases and prompts users to restart after update download.

Commands:

```bash
npm run desktop:dev
npm run desktop:dist
```

Release pipeline:

- Workflow: `.github/workflows/windows-desktop-release.yml`
- Tag pattern: `desktop-v1.0.1`

Installer artifacts:

- NSIS source: `desktop/scripts/installer/NexRestoSetup.nsi`
- Archived generated installers: `archive/debug-artifacts/installer/`

## Architecture Snapshot

| Path | Responsibility |
| --- | --- |
| `apps/web/` | Next.js App Router app (UI + route handlers) |
| `apps/api/` | Standalone backend boundary (Node/Express bootstrap) |
| `features/` | Feature-first domain modules (`cart`, `orders`, `menu`, `auth`) |
| `components/` | Shared UI components |
| `services/` | Service clients and external integrations |
| `lib/` | Shared runtime logic, Firebase, validation, utilities |
| `context/`, `hooks/` | Client state and reusable React hooks |
| `config/`, `types/` | Runtime configuration and cross-layer contracts |
| `database/` | Schema and migration documentation |
| `scripts/`, `docs/` | Operations, maintenance, and architecture notes |
| `__tests__/` | Automated test suites |

## Operational Notes

- Never place server secrets in `NEXT_PUBLIC_*` variables.
- Rotate leaked credentials immediately and update deployment secrets.
- Use `?restaurant=<id>&preview=1` on `/customer` for branding preview testing.
- Runtime is launched from `apps/web` via root scripts; route behavior remains preserved under `apps/web/app/api`.
