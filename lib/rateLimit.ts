/**
 * lib/rateLimit.ts
 * ----------------
 * SECURITY: Simple in-process sliding-window rate limiter for login endpoints.
 *
 * Threats mitigated:
 *  - Credential stuffing attacks (trying thousands of passwords from the same IP)
 *  - Brute-force attacks against admin login
 *
 * NOTE: This is an in-memory store — it resets on server restart and does NOT
 * share state across multiple instances / serverless functions. For production
 * with multiple replicas, replace the Map with an upstash/redis client.
 *
 * Usage (in a server action or API route):
 *   const { allowed, retryAfterSecs } = checkRateLimit(ip, 'login', 5, 60);
 *   if (!allowed) return { error: `Too many attempts. Retry in ${retryAfterSecs}s` };
 */

interface Window {
    hits: number;
    windowStart: number;
}

// { `${key}:${action}` → Window }
const store = new Map<string, Window>();

/**
 * @param identifier  IP address or user identifier
 * @param action      Logical action key (e.g. "login", "signup")
 * @param maxHits     Maximum allowed hits per window
 * @param windowSecs  Window duration in seconds
 */
export function checkRateLimit(
    identifier: string,
    action: string,
    maxHits: number,
    windowSecs: number
): { allowed: boolean; remainingHits: number; retryAfterSecs: number } {
    const key = `${identifier}:${action}`;
    const now = Date.now();
    const windowMs = windowSecs * 1000;

    const entry = store.get(key);

    if (!entry || now - entry.windowStart > windowMs) {
        // New window
        store.set(key, { hits: 1, windowStart: now });
        return { allowed: true, remainingHits: maxHits - 1, retryAfterSecs: 0 };
    }

    entry.hits += 1;
    store.set(key, entry);

    const retryAfterSecs = Math.ceil((entry.windowStart + windowMs - now) / 1000);

    if (entry.hits > maxHits) {
        return { allowed: false, remainingHits: 0, retryAfterSecs };
    }

    return { allowed: true, remainingHits: maxHits - entry.hits, retryAfterSecs: 0 };
}

/** Clear all rate-limit entries for an identifier (call on successful login) */
export function clearRateLimit(identifier: string, action: string): void {
    store.delete(`${identifier}:${action}`);
}

// Purge stale entries every 10 minutes to prevent memory leaks
if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        const cutoff = Date.now() - 15 * 60 * 1000; // 15 min
        for (const [key, entry] of store.entries()) {
            if (entry.windowStart < cutoff) store.delete(key);
        }
    }, 10 * 60 * 1000);
}
