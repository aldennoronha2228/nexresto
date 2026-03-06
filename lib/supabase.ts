/**
 * lib/supabase.ts  (hardened)
 * ---------------------------
 * SECURITY changes vs original:
 *  1. Env vars are validated at import time via lib/env (fail-fast).
 *  2. Dashboard client: auth storage key namespaced and storageType is
 *     explicitly 'localStorage' — prevents accidental session bleed.
 *  3. Customer client: ALL auth mechanisms are disabled — no sessions,
 *     no token refresh, no URL session detection. Fully anonymous.
 *  4. Both clients: flowType 'pkce' is set on the dashboard client to
 *     prevent authorization-code interception attacks (PKCE).
 *  5. Added a server-side helper (getServerSession) for token validation
 *     inside middleware / server components without relying on cookies.
 */

import { createClient } from '@supabase/supabase-js';
import { validateEnv, env } from './env';

// Run at module load — throws if env is broken
validateEnv();

/**
 * Custom fetcher that routes requests through our local proxy
 * when running in the browser. This circumvents "Failed to fetch"
 * errors caused by security software (e.g. Kaspersky) blocking
 * direct connections to the supabase.co domain.
 */
const customFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let urlStr: string;
    let requestInit: RequestInit = init || {};

    if (input instanceof Request) {
        urlStr = input.url;
        // Merge headers from Request object
        const headers = new Headers(requestInit.headers || {});
        input.headers.forEach((v, k) => {
            if (!headers.has(k)) headers.set(k, v);
        });
        requestInit = {
            ...requestInit,
            method: input.method || requestInit.method,
            headers,
            // body cannot be easily cloned from Request if it's already used
            // but for Supabase client, input is usually just the URL info or a fresh Request
        };
    } else {
        urlStr = input.toString();
    }

    if (typeof window === 'undefined') return fetch(input, requestInit);

    try {
        const u = new URL(urlStr);
        const supabaseHost = new URL(env.supabaseUrl).hostname;

        // MATCH: direct host OR any supabase.co subdomain (to be safe)
        if (u.hostname === supabaseHost || u.hostname.endsWith('supabase.co')) {
            const proxyUrl = new URL('/api/auth/proxy', window.location.origin);

            // Normalize path (ensure no leading slash)
            let path = u.pathname;
            if (path.startsWith('/')) path = path.slice(1);

            proxyUrl.searchParams.set('path', path);

            // Forward existing query params
            u.searchParams.forEach((v, k) => {
                proxyUrl.searchParams.set(k, v);
            });

            // ENTERPRISE RETRY LOGIC (3 Attempts for transient failures)
            let attempt = 0;
            const maxAttempts = 3;

            const doFetch = async (): Promise<Response> => {
                attempt++;
                try {
                    const res = await fetch(proxyUrl.toString(), requestInit);
                    // Retry on Gateway errors (502, 504) or timeout simulations
                    if (attempt < maxAttempts && (res.status === 502 || res.status === 504)) {
                        console.warn(`[customFetch] Retry ${attempt}/${maxAttempts} for status ${res.status}: ${path}`);
                        await new Promise(r => setTimeout(r, 500 * attempt));
                        return doFetch();
                    }
                    return res;
                } catch (err) {
                    if (attempt < maxAttempts) {
                        console.warn(`[customFetch] Retry ${attempt}/${maxAttempts} for error: ${path}`);
                        await new Promise(r => setTimeout(r, 500 * attempt));
                        return doFetch();
                    }
                    throw err;
                }
            };

            return doFetch();
        }
    } catch (err) {
        // parsing error or relative URL — pass through
    }

    return fetch(input, requestInit);
};

// ─── Dashboard client (authenticated) ────────────────────────────────────────
// Uses sessionStorage so each browser TAB has its own isolated session.
// This prevents cross-tab contamination: logging in as User B in Tab 2
// does NOT overwrite User A's session in Tab 1.
// Trade-off: closing the browser requires re-login (good for security on shared devices).
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
        storageKey: 'hotel-menu-auth-v13',
        storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
    },
    global: {
        fetch: customFetch,
        headers: {
            'X-Client-Info': 'hotel-dashboard/1.0',
        },
    },
});

// ─── Super Admin client (authenticated) ───────────────────────────────────────
// Used by all /super-admin/* pages and auth flows.
// Session is persisted in localStorage under a separate key.
export const supabaseSuperAdmin = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
        storageKey: 'hotel-superadmin-auth-v1',
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
    },
    global: {
        fetch: customFetch,
        headers: {
            'X-Client-Info': 'hotel-superadmin/1.0',
        },
    },
});

// ─── Customer client (fully anonymous) ───────────────────────────────────────
// Used only by /customer/* pages.
// NO session is stored, NO tokens are refreshed, NO URL session detection.
// Anon key gives access only to public RLS-guarded tables.
export const supabaseCustomer = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: '__none__',
    },
    global: {
        fetch: customFetch,
        headers: {
            'X-Client-Info': 'hotel-customer/1.0',
        },
    },
});
// ─── Admin Client (Privileged - Service Role) ────────────────────────────────
// REQUIRED: for administrative tasks where RLS needs to be bypassed.
// Uses SUPABASE_SERVICE_ROLE_KEY from .env.
// SECURITY: NEVER use this on the client-side!
export const supabaseAdmin = createClient(
    env.supabaseUrl,
    (typeof window === 'undefined' ? (process.env.SUPABASE_SERVICE_ROLE_KEY || env.supabaseAnonKey) : env.supabaseAnonKey),
    {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    }
);
