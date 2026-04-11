# Secure Build Obfuscation Setup

This project now supports production-oriented code obfuscation.

## 1. Build Integration

Use the secure build command:

npm run build:secure

This runs:

1. next build
2. scripts/obfuscate-build.js
3. scripts/verify-obfuscation.js

Also available:

- npm run obfuscate:build
- npm run verify:obfuscation

## 2. Obfuscation Profile

Configured with:

- compact: true
- controlFlowFlattening: true
- deadCodeInjection: true
- stringArrayEncoding: ['base64']
- renameGlobals: false

The same profile is configured in:

- next.config.ts (Webpack plugin for production client builds)
- scripts/obfuscate-build.js (post-build obfuscation fallback)

## 3. Environment Variable Shielding

Important:

- Any variable prefixed with NEXT_PUBLIC_ is intentionally exposed to browser code by Next.js design.
- Obfuscation can make discovery harder, but cannot make public variables secret.

To protect secrets:

- Keep secrets server-only (no NEXT_PUBLIC_ prefix).
- Access secrets only in server routes, server actions, or middleware/proxy.
- Never send server-only values to the client response.

Recommended split:

- Client-safe: NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_PROJECT_ID
- Server-only: FIREBASE_PRIVATE_KEY, SUPER_ADMIN_PASSWORD, RESEND_API_KEY

## 4. Deployment Gate

Before deployment to Vercel/Firebase Hosting, run:

npm run build:secure

The verification script checks:

- Build output exists
- Forbidden secret markers are not discoverable in JS chunks
- Chunks are not trivially human-readable

If verification fails, deployment should be blocked.

## 5. CI Suggestion

In CI pipeline, replace regular build with:

npm ci
npm run build:secure

Only deploy if the command succeeds.
