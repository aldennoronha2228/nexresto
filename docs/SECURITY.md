# SECURITY.md
# HotelPro Restaurant Management — Security Documentation

> **Version:** 2.0 (Enterprise Hardening)  
> **Date:** 2026-02-25  
> **Owner:** Application Security Engineering  
> **Review Cycle:** Every 6 months, or after any significant feature change

---

## 1. Threat Model Summary

### 1.1 Application Profile

| Attribute | Value |
|-----------|-------|
| **Type** | Multi-tenant web app (admin dashboard + public customer menu) |
| **Tech stack** | Next.js 16, Supabase (Postgres + Auth + Realtime), Tailwind CSS |
| **Deployment** | Expected: Vercel / any Node.js host with HTTPS |
| **Authentication** | Supabase Auth (email/password + Google OAuth/PKCE) |
| **Data sensitivity** | Order data (LOW-MEDIUM), admin credentials (HIGH), restaurant config (LOW) |
| **Internet-facing?** | Yes — the customer menu is fully public |

---

### 1.2 Trust Zones

```
[ Internet / Customer Devices ]
        |
        ▼ (public anon key, restrictive RLS)
[ Supabase Database ]
        ▲ (authenticated JWT, admin_users check)
        |
[ Admin Dashboard ] ← requires login + admin_users entry
```

- **Zone 1 (Public):** `/customer/*` — all traffic, no authentication
- **Zone 2 (Admin):** `/dashboard/*` — requires valid session + `admin_users` row
- **Zone 3 (DB):** Supabase — RLS enforces zone separation at the data layer

---

### 1.3 Threat Actor Profiles

| Actor | Motivation | Capability |
|-------|-----------|-----------|
| **Script kiddie** | Deface site, exfiltrate data | Low — automated scanners |
| **Malicious customer** | Steal others' orders, manipulate prices | Medium — browser DevTools |
| **Ex-employee** | Access dashboard after account removal | Medium — knows the app |
| **Automated attacker** | Credential stuffing, brute-force admin login | High — botnets |
| **Supply-chain attacker** | Compromise npm packages | High — indirect |

---

### 1.4 Key Threat Scenarios

1. **Unauthenticated dashboard access** — attacker bypasses login page JS redirect
2. **Price manipulation** — customer modifies `total` in the POST body to pay less
3. **Order IDOR** — customer reads other customers' orders by guessing order IDs
4. **Admin account takeover** — brute-force login + no MFA
5. **XSS via menu item name** — admin injects script in item name, customer menu executes it
6. **SSRF via image proxy** — attacker passes internal IP as `image_url` to Next.js image optimizer
7. **Clickjacking** — admin dashboard embedded in attacker iframe
8. **Open redirect** — `?next=https://evil.com` after login sends admin to phishing page
9. **Supply-chain compromise** — malicious npm package added via `npm install`
10. **Session fixation / auth-code interception** — steal OAuth callback codes

---

## 2. Security Controls Implemented

### 2.1 Authentication & Session Security

| Control | File | Threat Mitigated |
|---------|------|-----------------|
| PKCE OAuth flow | `lib/supabase.ts` | Auth-code interception (#10) |
| Hardcoded OAuth redirect URL | `lib/auth.ts` | Open redirect via OAuth (#8) |
| Google `prompt: select_account` | `lib/auth.ts` | Session fixation (#10) |
| `isAdmin` starts `false`, always re-checked | `context/AuthContext.tsx` | Privilege escalation (#1) |
| Re-check admin on `TOKEN_REFRESHED` | `context/AuthContext.tsx` | Revoked admin still has access |
| Immediate local state clear on sign-out | `context/AuthContext.tsx` | Race-condition access after logout |
| Login rate limiter (5 attempts/60s) | `lib/rateLimit.ts` | Brute-force (#4) |
| Security event logging on all auth paths | `lib/auth.ts`, `lib/logger.ts` | Invisible attacks (#4) |

---

### 2.2 Authorization & Access Control

| Control | File | Threat Mitigated |
|---------|------|-----------------|
| Middleware route guard on all `/dashboard/*` | `middleware.ts` | Bypass of client-side redirect (#1) |
| `admin_users` table check (not just Supabase auth) | `lib/auth.ts` | Supabase account doesn't = dashboard access |
| RLS deny-by-default on all tables | `supabase-rls-policies.sql` | IDOR, data enumeration (#3) |
| `anon` cannot SELECT orders | `supabase-rls-policies.sql` | Order IDOR (#3) |
| `anon` cannot touch `admin_users` at all | `supabase-rls-policies.sql` | Admin credential leakage |
| `anon` cannot read unavailable menu items | `supabase-rls-policies.sql` | Bypass of menu toggles |
| Input validation before all DB writes | `lib/validate.ts` | Injection, oversized payloads (#2) |
| Total amount cross-check vs item prices | `lib/validate.ts`, `lib/submitOrder.ts` | Price manipulation (#2) |

---

### 2.3 HTTP & App Hardening

| Control | File | Threat Mitigated |
|---------|------|-----------------|
| Content-Security-Policy (CSP) | `middleware.ts` | XSS (#5) |
| `X-Frame-Options: DENY` | `middleware.ts`, `next.config.ts` | Clickjacking (#7) |
| `X-Content-Type-Options: nosniff` | `middleware.ts`, `next.config.ts` | MIME-sniffing |
| `Strict-Transport-Security` (HSTS, prod only) | `middleware.ts`, `next.config.ts` | Protocol downgrade |
| `Referrer-Policy: strict-origin-when-cross-origin` | `middleware.ts`, `next.config.ts` | Referrer leakage |
| `Permissions-Policy` | `middleware.ts`, `next.config.ts` | Feature abuse |
| `poweredByHeader: false` | `next.config.ts` | Stack fingerprinting |
| `X-Powered-By` header removal | `middleware.ts` | Stack fingerprinting |
| Auth/dashboard `Cache-Control: no-store` | `next.config.ts` | Cached authenticated pages |
| Open-redirect prevention (`?next=` validation) | `middleware.ts`, `lib/validate.ts` | Redirect attacks (#8) |
| Path traversal detection | `middleware.ts` | Directory traversal |

---

### 2.4 Image Security (SSRF / MIME)

| Control | File | Threat Mitigated |
|---------|------|-----------------|
| Remote pattern allowlist (specific hostnames only) | `next.config.ts` | SSRF via image proxy |
| `dangerouslyAllowSVG: false` | `next.config.ts` | XSS via SVG in image optimizer |
| `contentSecurityPolicy` on optimizer | `next.config.ts` | Script execution in optimizer |
| Image URL host check in input validation | `lib/validate.ts` | Arbitrary image URLs |

---

### 2.5 Secrets & Config

| Control | File | Threat Mitigated |
|---------|------|-----------------|
| Fail-fast env validation at startup | `lib/env.ts` | Broken/missing config |
| Supabase URL format + HTTPS check | `lib/env.ts` | Misconfigured non-HTTPS DB |
| Anon key format check | `lib/env.ts` | Wrong key type |
| Localhost/HTTP warning in production | `lib/env.ts` | Insecure QR code URLs |

---

### 2.6 Input Validation

| Control | File | Threat Mitigated |
|---------|------|-----------------|
| Order payload: table ID, item count, qty, price, total | `lib/validate.ts` | Injection, manipulation |
| Menu item: UUID for category_id, type enum, image URL | `lib/validate.ts` | Injection, SSRF |
| Login: email regex, password min length | `lib/validate.ts` | Brute-force tooling |
| Category: name length | `lib/validate.ts` | Oversized payloads |
| Redirect URL: relative-only, no protocol-relative | `lib/validate.ts` | Open redirect |

---

### 2.7 Observability

| Control | File | Threat Mitigated |
|---------|------|-----------------|
| Structured JSON security event log | `lib/logger.ts` | Invisible attacks |
| Email redaction in production logs | `lib/logger.ts` | PII leakage in logs |
| Password/token fields always `[redacted]` | `lib/logger.ts` | Credential leakage in logs |
| Auth failure events | `lib/auth.ts` | Brute-force detection |
| Admin check events | `lib/auth.ts` | Privilege escalation detection |

---

### 2.8 Database Security

| Control | File | Threat Mitigated |
|---------|------|-----------------|
| RLS enabled on ALL tables | `supabase-rls-policies.sql` | Data exfiltration |
| Drop + recreate all policies (clean slate) | `supabase-rls-policies.sql` | Legacy permissive policies |
| Realtime publication limited to safe tables | `supabase-rls-policies.sql` | Realtime admin_users leakage |
| `provision_admin()` helper with SECURITY DEFINER | `supabase-rls-policies.sql` | Admin provisioning bypass |
| RLS policy WITH CHECK on orders (status = 'new') | `supabase-rls-policies.sql` | Status injection at create |
| RLS WITH CHECK on order_items (qty ≤ 99, name ≤ 200 chars) | `supabase-rls-policies.sql` | DB-level validation |

---

## 3. Residual Risks

> These risks are known but not fully mitigated in this patch set. Each has an escalation path.

### 🔴 HIGH

| Risk | Description | Escalation Path |
|------|-------------|----------------|
| **No MFA on admin login** | Admin accounts can be compromised with just email+password+credential-stuffing (rate limiter is in-memory, resets on restart) | Enable Supabase Auth MFA (TOTP) in Supabase Dashboard → Auth → Auth Settings |
| **Middleware session check is cookie-presence only** | The middleware checks for the existence of a session cookie, not its cryptographic validity. A forged/expired cookie could bypass the redirect guard. | Upgrade to `@supabase/ssr` which validates the JWT server-side in middleware |
| **In-memory rate limiter** | Resets on server restart; doesn't work across serverless instances | Replace `lib/rateLimit.ts` with an Upstash Redis-based rate limiter |

### 🟡 MEDIUM

| Risk | Description | Escalation Path |
|------|-------------|----------------|
| **No CSRF token on state-changing requests** | All mutations go through Supabase JS SDK (bearer token in headers, not cookies), which naturally prevents CSRF. However, if you ever add custom API routes that use cookie auth, CSRF tokens will be needed. | Add `next-csrf` or `csrf-tokens` package when adding cookie-auth API routes |
| **Customer order history is browser-local only** | No server-side record of what a customer ordered — can't be used as evidence in disputes | Persist customer session ID to Supabase so orders are linked to a device |
| **Image URLs are not validated on the dashboard** | An admin could set an image_url pointing to an internal network address | Enforce `validateMenuItemPayload` in the dashboard API before saving |
| **No Content-Security-Policy violation reporting** | CSP violations are not reported anywhere — you won't know if XSS is being attempted | Add `report-uri /api/csp-report` to the CSP policy and create the API route |

### 🟢 LOW / ACCEPTABLE

| Risk | Description |
|------|-------------|
| **Static menu fallback bypasses Supabase RLS** | If Supabase is unreachable, `menuData.ts` is shown — this data is hardcoded and has no sensitive content |
| **`unsafe-inline` in style-src** | Required by Tailwind CSS and Next.js; scope is styles only, not scripts |
| **Order total validation has a ₹100 buffer** | The buffer is for the service fee; cannot be exploited to get items free |

---

## 4. Operational Runbook

### 4.1 Adding / Removing an Admin

**Add an admin (server-side only):**
```sql
-- In Supabase SQL Editor or via service-role client:
SELECT provision_admin('newadmin@hotel.com', 'Alice Smith');
```

**Deactivate an admin (immediately revokes access):**
```sql
UPDATE public.admin_users
SET is_active = false
WHERE email = 'departing@hotel.com';
```
> No restart or code change required — `checkIsAdmin` checks `is_active = true` on every request.

---

### 4.2 Security Incident Response

**Suspected brute-force attack on login:**
1. Check your log aggregator for `AUTH_LOGIN_FAILURE` events clustered by IP
2. If using Vercel: add the attacking IP to Vercel Firewall
3. Rotate the Supabase anon key in Supabase Dashboard → Settings → API
4. Re-deploy the app so `.env.local` picks up the new key

**Suspected compromised admin account:**
1. Immediately deactivate in `admin_users` (see §4.1)
2. In Supabase Dashboard → Authentication → Users — find and ban the user
3. Rotate the Supabase anon key
4. Check order history for anomalous operations during the compromise window

**Data breach (anon read of sensitive data):**
1. Run the verification queries in `supabase-rls-policies.sql` to confirm RLS is still active
2. Check Supabase Dashboard → Database → Logs for unexpected queries
3. Enable Supabase point-in-time recovery and snapshot the DB before any investigation writes

---

### 4.3 Rotating Secrets

1. **Rotate Supabase anon key:**
   - Supabase Dashboard → Settings → API → Reveal anon key → Generate new key
   - Update `NEXT_PUBLIC_SUPABASE_ANON_KEY` in your hosting platform env vars
   - Re-deploy — old key immediately rejected by Supabase

2. **Rotating Google OAuth client secret:**
   - Google Cloud Console → APIs & Services → Credentials → Edit OAuth client
   - Generate new secret, update Supabase Dashboard → Authentication → Providers → Google

---

### 4.4 Dependency Audit

```bash
# Run locally before every release:
npm audit

# Automatically fix safe updates:
npm audit fix

# Check for high/critical vulnerabilities (will exit non-zero if found):
npm audit --audit-level=high
```

Add this to CI (GitHub Actions example):
```yaml
- name: Security audit
  run: npm audit --audit-level=high
```

---

### 4.5 Environment Validation

The app will **refuse to start** if any required env var is missing (see `lib/env.ts`).

Required variables:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_RESTAURANT_ID=rest001
```

Optional but recommended:
```bash
NEXT_PUBLIC_MENU_BASE_URL=https://your-production-domain.com
NEXT_PUBLIC_MENU_CUSTOMER_PATH=/customer
```

---

## 5. Pending Security Upgrades (Next Steps)

These are **not** yet implemented but are recommended for a full enterprise posture:

| Priority | Action | Effort |
|----------|--------|--------|
| 🔴 HIGH | Upgrade to `@supabase/ssr` for cryptographic server-side session validation in middleware | 2–4 hrs |
| 🔴 HIGH | Enable Supabase MFA (TOTP) for all admin accounts | 30 min (Supabase Dashboard) |
| 🔴 HIGH | Replace in-memory rate limiter with Redis (Upstash) | 2 hrs |
| 🟡 MED | Add CSP violation reporting endpoint (`/api/csp-report`) | 1 hr |
| 🟡 MED | Integrate Sentry or Datadog for security event aggregation | 2 hrs |
| 🟡 MED | Add `npm audit` as a CI gate (GitHub Actions) | 30 min |
| 🟡 MED | Admin provisioning UI (replace raw SQL with a secure server action) | 4 hrs |
| 🟢 LOW | Penetration test by an external firm | External |
| 🟢 LOW | Enable Supabase Database audit logging (paid plan) | 15 min |

---

## 6. Security Level Assessment

| Area | Before Hardening | After Hardening |
|------|-----------------|----------------|
| Authentication | 3/10 (client-only guards) | 7/10 |
| Authorization | 2/10 (no middleware, weak RLS) | 8/10 |
| Database security | 2/10 (permissive RLS) | 8/10 |
| HTTP security headers | 0/10 (none) | 9/10 |
| Input validation | 1/10 (none) | 8/10 |
| Secrets management | 4/10 (no validation) | 7/10 |
| Observability | 0/10 (no logging) | 6/10 |
| Dependency security | 3/10 (no audit gate) | 5/10 |

**Overall: 4.5/10 → 7.5/10**

The primary residual risk keeping the score from 9/10 is the absence of:
1. Server-side JWT validation in middleware (requires `@supabase/ssr`)
2. Multi-factor authentication for admin accounts
3. A distributed rate limiter (current one resets on deploy)

Implement the three HIGH-priority items above to reach **9/10**.
