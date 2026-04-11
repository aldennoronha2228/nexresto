/**
 * Persists menu-item availability overrides in localStorage.
 *
 * This acts as a reliable fallback when Supabase tables haven't been
 * set up yet, and also ensures availability state survives page reloads
 * on the same device.
 *
 * Shape: { [itemId]: boolean }  — true = available, false = off the menu
 */
const LS_KEY = 'hotelmenu_availability';

function resolveScope(scopeId?: string): string {
    if (scopeId) return scopeId;
    if (typeof window === 'undefined') return 'default';

    const queryRestaurant = new URLSearchParams(window.location.search).get('restaurant');
    if (queryRestaurant) return queryRestaurant;

    const segments = window.location.pathname.split('/').filter(Boolean);
    const dashboardIdx = segments.indexOf('dashboard');
    if (dashboardIdx > 0) {
        return segments[dashboardIdx - 1];
    }

    return 'default';
}

function scopedKey(scopeId?: string): string {
    return `${LS_KEY}:${resolveScope(scopeId)}`;
}

export function getAvailabilityMap(scopeId?: string): Record<string, boolean> {
    if (typeof window === 'undefined') return {};
    try {
        const key = scopedKey(scopeId);
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

export function setItemAvailability(itemId: string, available: boolean, scopeId?: string): void {
    if (typeof window === 'undefined') return;
    const key = scopedKey(scopeId);
    const map = getAvailabilityMap(scopeId);
    map[itemId] = available;
    localStorage.setItem(key, JSON.stringify(map));
}

/** Apply the stored overrides on top of a list of items */
export function applyAvailabilityOverrides<T extends { id: string; available?: boolean }>(
    items: T[],
    scopeId?: string
): T[] {
    const map = getAvailabilityMap(scopeId);
    return items.map(item =>
        Object.prototype.hasOwnProperty.call(map, item.id)
            ? { ...item, available: map[item.id] }
            : item
    );
}

/** Seed the map from an initial list (sets only items not already overridden) */
export function seedAvailabilityMap<T extends { id: string; available?: boolean }>(
    items: T[],
    scopeId?: string
): void {
    if (typeof window === 'undefined') return;
    const key = scopedKey(scopeId);
    const map = getAvailabilityMap(scopeId);
    let changed = false;
    for (const item of items) {
        if (!Object.prototype.hasOwnProperty.call(map, item.id) && item.available !== undefined) {
            map[item.id] = item.available;
            changed = true;
        }
    }
    if (changed) localStorage.setItem(key, JSON.stringify(map));
}
