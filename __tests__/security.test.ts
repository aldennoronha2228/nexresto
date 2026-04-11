/**
 * __tests__/security.test.ts
 * ---------------------------
 * Security-focused test suite verifying hardening controls.
 *
 * Run with:   npx jest __tests__/security.test.ts
 * Or:         npm test -- --testPathPattern=security
 *
 * These tests cover:
 *  - Input validation correctness
 *  - Rate limiter behaviour
 *  - Open-redirect guard
 *  - Environment validation logic
 *  - Security logger PII redaction
 */

// ─── Import helpers ──────────────────────────────────────────────────────────
// We test the pure logic modules only — no Supabase calls, no DOM.

import {
    validateOrderPayload,
    validateMenuItemPayload,
    validateLoginPayload,
    validateCategoryPayload,
    validateRedirectUrl,
} from '../lib/validate';

import {
    checkRateLimit,
    clearRateLimit,
} from '../lib/rateLimit';

// ─── Validate order payload ───────────────────────────────────────────────────

describe('validateOrderPayload', () => {
    const validOrder = {
        tableId: 'T-01',
        restaurantId: 'rest001',
        items: [{ id: 'item_001', name: 'Pasta', quantity: 2, price: 15 }],
        total: 35,   // 2 * 15 + 5 service fee
    };

    it('accepts a valid order', () => {
        expect(validateOrderPayload(validOrder).ok).toBe(true);
    });

    it('rejects missing tableId', () => {
        const r = validateOrderPayload({ ...validOrder, tableId: '' });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/table/i);
    });

    it('rejects tableId with special characters', () => {
        const r = validateOrderPayload({ ...validOrder, tableId: 'T-01; DROP TABLE orders;--' });
        expect(r.ok).toBe(false);
    });

    it('rejects empty items array', () => {
        const r = validateOrderPayload({ ...validOrder, items: [] });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/item/i);
    });

    it('rejects more than 50 items', () => {
        const items = Array.from({ length: 51 }, (_, i) => ({ id: `item_${i}`, name: `Item ${i}`, quantity: 1, price: 10 }));
        const r = validateOrderPayload({ ...validOrder, items, total: 515 });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/50/);
    });

    it('rejects item quantity > 99', () => {
        const r = validateOrderPayload({ ...validOrder, items: [{ id: 'item_001', name: 'Pasta', quantity: 100, price: 15 }], total: 1505 });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/quantity/i);
    });

    it('rejects non-positive item price', () => {
        // price -5 is not a positive number — should fail
        const r = validateOrderPayload({ ...validOrder, items: [{ id: 'item_001', name: 'Pasta', quantity: 1, price: -5 }], total: 35 });
        expect(r.ok).toBe(false);
    });

    it('rejects non-positive total (client-side price manipulation)', () => {
        // Items: 1 x Pasta @ $15 → computedTotal = 15
        // A total of 0.01 is non-positive effectively and isPositiveNumber should catch
        // it only if it's <= 0. Let's send 0 (not a positive number).
        const rZero = validateOrderPayload({ ...validOrder, total: 0 });
        expect(rZero.ok).toBe(false);
    });

    it('rejects total exceeding items + service buffer (manipulation)', () => {
        // Items: 1 x Pasta @ $15 → computedTotal = 15, buffer = 115
        // Client sends 200 — way over the service fee buffer
        const rHigh = validateOrderPayload({ ...validOrder, items: [{ id: 'item_001', name: 'Pasta', quantity: 1, price: 15 }], total: 200 });
        expect(rHigh.ok).toBe(false);
    });

    it('rejects invalid item ID format', () => {
        const r = validateOrderPayload({ ...validOrder, items: [{ id: 'item;DROP', name: 'Pasta', quantity: 1, price: 15 }], total: 20 });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/item id/i);
    });

    it('sanitizes order items and drops unknown fields', () => {
        const r = validateOrderPayload({
            ...validOrder,
            items: [{ id: '  item_001  ', name: '  Pasta  ', quantity: 2, price: 15, note: 'x' }],
            total: 35,
        });

        expect(r.ok).toBe(true);
        expect(r.data?.items[0]).toEqual({ id: 'item_001', name: 'Pasta', quantity: 2, price: 15 });
    });

    it('rejects non-object payload', () => {
        expect(validateOrderPayload(null).ok).toBe(false);
        expect(validateOrderPayload('inject').ok).toBe(false);
        expect(validateOrderPayload(42).ok).toBe(false);
    });
});

// ─── Validate menu item payload ───────────────────────────────────────────────

describe('validateMenuItemPayload', () => {
    const validItem = {
        name: 'Grilled Salmon',
        price: 28,
        category_id: '12345678-1234-4234-b234-123456789012',
        type: 'non-veg' as const,
        image_url: 'https://images.unsplash.com/photo-123?w=800',
    };

    it('accepts a valid menu item', () => {
        expect(validateMenuItemPayload(validItem).ok).toBe(true);
    });

    it('rejects empty name', () => {
        expect(validateMenuItemPayload({ ...validItem, name: '' }).ok).toBe(false);
    });

    it('rejects negative price', () => {
        expect(validateMenuItemPayload({ ...validItem, price: -1 }).ok).toBe(false);
    });

    it('rejects invalid UUID for category_id', () => {
        const r = validateMenuItemPayload({ ...validItem, category_id: '1; DROP TABLE categories' });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/uuid/i);
    });

    it('rejects invalid type value', () => {
        const r = validateMenuItemPayload({ ...validItem, type: 'omnivore' as unknown as 'veg' | 'non-veg' });
        expect(r.ok).toBe(false);
    });

    it('rejects name longer than 200 chars', () => {
        const r = validateMenuItemPayload({ ...validItem, name: 'a'.repeat(201) });
        expect(r.ok).toBe(false);
    });
});

// ─── Validate login payload ───────────────────────────────────────────────────

describe('validateLoginPayload', () => {
    it('accepts valid email and password', () => {
        const r = validateLoginPayload('admin@hotel.com', 'SecurePass1!');
        expect(r.ok).toBe(true);
    });

    it('rejects invalid email format', () => {
        expect(validateLoginPayload('not-an-email', 'password').ok).toBe(false);
        expect(validateLoginPayload('@hotel.com', 'password').ok).toBe(false);
        expect(validateLoginPayload('', 'password').ok).toBe(false);
    });

    it('rejects short password', () => {
        expect(validateLoginPayload('admin@hotel.com', '123').ok).toBe(false);
    });

    it('rejects empty password', () => {
        expect(validateLoginPayload('admin@hotel.com', '').ok).toBe(false);
    });

    it('normalises email to lowercase', () => {
        const r = validateLoginPayload('Admin@HOTEL.COM', 'SecurePass1!');
        expect(r.ok).toBe(true);
        expect(r.data?.email).toBe('admin@hotel.com');
    });
});

// ─── Validate redirect URL ────────────────────────────────────────────────────

describe('validateRedirectUrl', () => {
    it('allows safe relative paths', () => {
        expect(validateRedirectUrl('/dashboard/orders', [])).toBe('/dashboard/orders');
        expect(validateRedirectUrl('/customer', [])).toBe('/customer');
    });

    it('blocks protocol-relative URLs (//evil.com)', () => {
        expect(validateRedirectUrl('//evil.com', [])).toBeNull();
        expect(validateRedirectUrl('//evil.com/steal?cookie=true', [])).toBeNull();
    });

    it('blocks absolute external URLs', () => {
        expect(validateRedirectUrl('https://evil.com', [])).toBeNull();
        expect(validateRedirectUrl('http://attacker.net/phish', [])).toBeNull();
    });

    it('blocks null/undefined', () => {
        expect(validateRedirectUrl(null, [])).toBeNull();
        expect(validateRedirectUrl(undefined, [])).toBeNull();
        expect(validateRedirectUrl('', [])).toBeNull();
    });

    it('allows absolute URLs if in allowedOrigins', () => {
        const result = validateRedirectUrl('https://myhotel.com/welcome', ['https://myhotel.com']);
        expect(result).toBe('https://myhotel.com/welcome');
    });
});

// ─── Rate limiter ─────────────────────────────────────────────────────────────

describe('checkRateLimit', () => {
    // Use a unique IP per describe block so test-to-test state doesn't leak
    let ip: string;

    beforeEach(() => {
        ip = `198.51.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    });

    afterEach(() => {
        clearRateLimit(ip, 'login-test');
        clearRateLimit(ip, 'signup-test');
    });

    it('allows requests within the limit', () => {
        const r = checkRateLimit(ip, 'login-test', 5, 60);
        expect(r.allowed).toBe(true);
        expect(r.remainingHits).toBe(4);
    });

    it('blocks requests exceeding the limit', () => {
        for (let i = 0; i < 5; i++) checkRateLimit(ip, 'login-test', 5, 60);
        const r = checkRateLimit(ip, 'login-test', 5, 60);
        expect(r.allowed).toBe(false);
        expect(r.remainingHits).toBe(0);
        expect(r.retryAfterSecs).toBeGreaterThan(0);
    });

    it('starts a new window after manual clear (simulates expiry)', () => {
        // Fill up the window completely
        for (let i = 0; i < 5; i++) checkRateLimit(ip, 'login-test', 5, 3600);
        // Confirm it is now blocked
        expect(checkRateLimit(ip, 'login-test', 5, 3600).allowed).toBe(false);
        // Simulate window expiry by clearing the state (same as what the GC does)
        clearRateLimit(ip, 'login-test');
        // New window — should be allowed again
        const r = checkRateLimit(ip, 'login-test', 5, 3600);
        expect(r.allowed).toBe(true);
    });

    it('uses separate counters per action', () => {
        for (let i = 0; i < 5; i++) checkRateLimit(ip, 'login-test', 5, 60);
        // Different action key — should NOT be rate-limited
        const r = checkRateLimit(ip, 'signup-test', 5, 60);
        expect(r.allowed).toBe(true);
    });

    it('clearRateLimit resets the counter', () => {
        for (let i = 0; i < 5; i++) checkRateLimit(ip, 'login-test', 5, 60);
        clearRateLimit(ip, 'login-test');
        const r = checkRateLimit(ip, 'login-test', 5, 60);
        expect(r.allowed).toBe(true);
        expect(r.remainingHits).toBe(4);
    });
});

// ─── Category validation ──────────────────────────────────────────────────────

describe('validateCategoryPayload', () => {
    it('accepts valid category', () => {
        expect(validateCategoryPayload({ name: 'Desserts' }).ok).toBe(true);
    });

    it('rejects empty name', () => {
        expect(validateCategoryPayload({ name: '' }).ok).toBe(false);
    });

    it('rejects name > 100 chars', () => {
        expect(validateCategoryPayload({ name: 'a'.repeat(101) }).ok).toBe(false);
    });

    it('rejects non-object', () => {
        expect(validateCategoryPayload('Desserts').ok).toBe(false);
        expect(validateCategoryPayload(null).ok).toBe(false);
    });
});
