/**
 * lib/validate.ts
 * ---------------
 * SECURITY: Input validation schemas for all external data entry points.
 *
 * Threats mitigated:
 *  - SQL/NoSQL injection through unvalidated table/order inputs
 *  - Oversized payloads causing DoS or unexpected DB writes
 *  - Type coercion attacks (passing a number where a string is expected)
 *  - IDOR via unvalidated UUIDs or table IDs being passed through to queries
 *
 * We avoid a runtime dep on Zod to keep the bundle lean; pure TypeScript
 * guards are used instead. If you add Zod later, replace these guards.
 */

/** Generic result type */
export interface ValidationResult<T> {
    ok: boolean;
    data?: T;
    error?: string;
}

// ─── Primitive helpers ────────────────────────────────────────────────────────

function isNonEmptyString(v: unknown, max = 500): v is string {
    return typeof v === 'string' && v.trim().length > 0 && v.length <= max;
}

function isPositiveNumber(v: unknown, max = 1_000_000): v is number {
    return typeof v === 'number' && isFinite(v) && v > 0 && v <= max;
}

/** Validates an ID (Firestore uses alphanumeric 20-char strings, Supabase uses UUIDs) */
function isValidId(v: unknown): v is string {
    return typeof v === 'string' && /^[a-zA-Z0-9_\-]+$/.test(v) && v.length >= 10 && v.length <= 50;
}

/** Table IDs follow the pattern T-01 through T-99 or are arbitrary short strings, or empty if not provided */
function isTableId(v: unknown): v is string {
    return typeof v === 'string' && (/^[A-Za-z0-9\-_]{1,20}$/.test(v) || v === '');
}

function isEmail(v: unknown): v is string {
    return typeof v === 'string' && /^[^\s@]{1,254}@[^\s@]{1,253}\.[^\s@]{1,253}$/.test(v);
}

// ─── Domain schemas ───────────────────────────────────────────────────────────

export interface ValidOrderPayload {
    tableId: string;
    items: Array<{ id: string; name: string; quantity: number; price: number }>;
    total: number;
    restaurantId: string;
}

export function validateOrderPayload(raw: unknown): ValidationResult<ValidOrderPayload> {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'Payload must be an object' };
    const p = raw as Record<string, unknown>;

    if (!isTableId(p.tableId)) return { ok: false, error: 'Invalid table ID' };
    if (!isNonEmptyString(p.restaurantId, 50)) return { ok: false, error: 'Invalid restaurant ID' };

    if (!Array.isArray(p.items) || p.items.length === 0) return { ok: false, error: 'Order must contain at least one item' };
    if (p.items.length > 50) return { ok: false, error: 'Order cannot exceed 50 items' };

    for (const item of p.items) {
        if (!item || typeof item !== 'object') return { ok: false, error: 'Invalid item shape' };
        const i = item as Record<string, unknown>;
        if (!isNonEmptyString(i.name, 200)) return { ok: false, error: `Item name invalid: ${String(i.name).slice(0, 50)}` };
        if (!isPositiveNumber(i.quantity) || !Number.isInteger(i.quantity)) return { ok: false, error: 'Item quantity must be a positive integer' };
        if ((i.quantity as number) > 99) return { ok: false, error: 'Item quantity must not exceed 99' };
        if (!isPositiveNumber(i.price, 100_000)) return { ok: false, error: 'Item price invalid' };
    }

    const computedTotal = (p.items as any[]).reduce((sum: number, i: any) => sum + i.price * i.quantity, 0);
    const serviceFeeBound = computedTotal + 100; // allow up to ₹100 service fee
    if (!isPositiveNumber(p.total, 1_000_000) || (p.total as number) > serviceFeeBound) {
        return { ok: false, error: 'Total amount does not match items' };
    }

    return {
        ok: true,
        data: {
            tableId: (p.tableId as string).trim(),
            restaurantId: (p.restaurantId as string).trim(),
            items: p.items as any,
            total: p.total as number,
        },
    };
}

export interface ValidMenuItemPayload {
    name: string;
    price: number;
    category_id: string;
    type: 'veg' | 'non-veg';
    image_url?: string;
}

export function validateMenuItemPayload(raw: unknown): ValidationResult<ValidMenuItemPayload> {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'Payload must be an object' };
    const p = raw as Record<string, unknown>;

    if (!isNonEmptyString(p.name, 200)) return { ok: false, error: 'Menu item name is required (max 200 chars)' };
    if (!isPositiveNumber(p.price, 100_000)) return { ok: false, error: 'Price must be a positive number' };
    if (!isValidId(p.category_id)) return { ok: false, error: 'category_id must be a valid ID' };
    if (p.type !== 'veg' && p.type !== 'non-veg') return { ok: false, error: 'type must be "veg" or "non-veg"' };

    if (p.image_url !== undefined && p.image_url !== null && p.image_url !== '') {
        if (!isNonEmptyString(p.image_url, 2048)) return { ok: false, error: 'image_url too long' };
        try {
            const url = new URL(p.image_url as string);
            const allowedHosts = ['images.unsplash.com', 'res.cloudinary.com', 'firebasestorage.googleapis.com', 'storage.googleapis.com'];
            const isAllowed = allowedHosts.some(h => url.hostname.endsWith(h));
            if (!isAllowed && process.env.NODE_ENV === 'production') {
                return { ok: false, error: 'image_url must point to an allowed image host' };
            }
        } catch {
            return { ok: false, error: 'image_url is not a valid URL' };
        }
    }

    return {
        ok: true,
        data: {
            name: (p.name as string).trim(),
            price: p.price as number,
            category_id: p.category_id as string,
            type: p.type as 'veg' | 'non-veg',
            image_url: p.image_url ? (p.image_url as string).trim() : undefined,
        },
    };
}

export interface ValidLoginPayload {
    email: string;
    password: string;
}

export function validateLoginPayload(email: unknown, password: unknown): ValidationResult<ValidLoginPayload> {
    if (!isEmail(email)) return { ok: false, error: 'Invalid email address' };
    if (!isNonEmptyString(password, 1024)) return { ok: false, error: 'Password is required' };
    if ((password as string).length < 8) return { ok: false, error: 'Password must be at least 8 characters' };
    return { ok: true, data: { email: (email as string).toLowerCase().trim(), password: password as string } };
}

export interface ValidCategoryPayload {
    name: string;
    display_order?: number;
}

export function validateCategoryPayload(raw: unknown): ValidationResult<ValidCategoryPayload> {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'Payload must be an object' };
    const p = raw as Record<string, unknown>;
    if (!isNonEmptyString(p.name, 100)) return { ok: false, error: 'Category name is required (max 100 chars)' };
    return { ok: true, data: { name: (p.name as string).trim(), display_order: typeof p.display_order === 'number' ? p.display_order : undefined } };
}

/** Validates that a redirect URL is safe (same-origin, no protocol-relative URLs) */
export function validateRedirectUrl(url: unknown, allowedOrigins: string[] = []): string | null {
    if (!url || typeof url !== 'string') return null;
    // Reject protocol-relative URLs (//evil.com) and external URLs
    if (url.startsWith('//') || url.match(/^https?:\/\//)) {
        try {
            const parsed = new URL(url);
            const allowed = allowedOrigins.some(o => {
                try { return new URL(o).origin === parsed.origin; } catch { return false; }
            });
            return allowed ? url : null;
        } catch {
            return null;
        }
    }
    // Relative paths are safe
    if (url.startsWith('/') && !url.startsWith('//')) return url;
    return null;
}
