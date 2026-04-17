# NexResto Platform

NexResto is a multi-tenant restaurant platform built with Next.js and Firebase.

It includes:
- Restaurant dashboard (orders, menu, inventory, analytics, branding)
- Super admin console (restaurants, subscription status, logs)
- Customer menu experience with live theming support
- Firebase-backed authentication and role-based access control

## Tech Stack

- Framework: Next.js 16 (App Router)
- Language: TypeScript
- Styling: Tailwind CSS + motion
- Auth/DB/Storage: Firebase Auth, Firestore, Firebase Storage
- Testing: Jest

## Core Features

- Multi-tenant restaurant routing by `storeId`
- Role guards for owner/manager/staff/super-admin
- Restaurant and admin auth flows
- Table-aware customer menu + cart + order history
- Real branding management from dashboard
- Live customer preview from branding panel
- Branding persistence in Firestore with collection-first fallback

## What's New (April 2026)

- Nexo support chatbot restored in dashboard with:
	- dark theme UI
	- compact chat bubbles for short messages
	- quick suggestions hidden after conversation starts
	- small `Clear` chat action in header
- AI provider flow updated:
	- Groq prioritized for concierge and support chat routes
	- Groq endpoint normalization for base URLs (`/chat/completions` auto-resolved)
	- model candidate fallback support for Groq model variants
	- OpenAI/Gemini retained as fallback providers
- Mobile table editing improvements in 2D review:
	- tap-to-select table
	- table selection highlight
	- mobile nudge pad with Fine/Fast movement steps
	- tap empty grid to place selected table
	- detected table side-list tap selection support
	- chatbot floating button repositioned on tables page to reduce overlap
- Account Settings subscription UI simplified:
	- large always-on tier cards removed
	- subscription end date remains visible in a compact summary
	- one toggle button reveals current tier + additional plan details on demand
- Upgrade modal pricing/cards now use shared `PRICING_PLANS` data to stay in sync with account/pricing pages.

## Branding System (Latest)

Branding now uses both:
- `branding/{restaurantId}` (primary)
- `restaurants/{restaurantId}.branding` (fallback/mirror)

Implemented capabilities:
- Primary/secondary/background color settings
- Font family selection
- Logo upload
- Hero image upload
- Hero overlay opacity
- Hero headline + tagline
- Hero visibility toggle
- Catalog headline + featured images payload support
- Live preview sync through `postMessage` in preview mode

API routes involved:
- `GET/POST /api/branding/settings`
- `POST /api/branding/upload`
- `GET /api/tenant/branding`

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Add environment variables in `.env` (or `.env.local`) for:
- Firebase client config (`NEXT_PUBLIC_FIREBASE_*`)
- Firebase Admin credentials (`FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`)
- Restaurant defaults (`NEXT_PUBLIC_RESTAURANT_ID`)
- Optional integrations:
	- Email (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`)
		- AI providers (`GROQ_API_KEY` recommended, `OPENAI_API_KEY`, `GEMINI_API_KEY`)

3. Run dev server:

```bash
npm run dev
```

4. Build production bundle:

```bash
npm run build
```

## Tests

Run all tests:

```bash
npm test
```

Run security suite:

```bash
npm run test:security
```

## Secure Build / Obfuscation

This repo includes optional hardening scripts:

```bash
npm run build:secure
```

Related scripts:
- `npm run obfuscate:build`
- `npm run verify:obfuscation`

See detailed notes in:
- `docs/SECURE_BUILD_OBFUSCATION.md`

## Windows Desktop Auto-Updates

This repository now includes an updater-enabled Windows desktop wrapper in `desktop/`.

How updates work:
- Existing users on old ZIP/EXE builds must install the new installer one time.
- After that, the desktop app checks GitHub Releases, downloads updates, and prompts for restart.

Local desktop build commands:

```bash
npm run desktop:dist
```

Desktop app local run:

```bash
npm run desktop:dev
```

Automated release:
- Workflow file: `.github/workflows/windows-desktop-release.yml`
- Trigger by pushing tags like `desktop-v1.0.1` (or use manual workflow dispatch).

## Project Structure (High-Level)

- `app/`: App Router pages + API routes
- `components/`: dashboard/customer/ui components
- `context/`: auth/cart contexts
- `lib/`: Firebase, validation, utils, server helpers
- `scripts/`: admin/debug/maintenance scripts
- `__tests__/`: test suites

## Notes

- Keep all server secrets out of `NEXT_PUBLIC_*` variables.
- Rotate any leaked keys immediately and update deployment secrets.
- For customer preview testing, use `?restaurant=<id>&preview=1` on `/customer`.
