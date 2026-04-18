// ─── Shared data across the entire application ───────────────────────────────
// Both the customer-facing menu AND the dashboard "Add Item" panel use the
// same items and categories, imported from the single source of truth below.

export { menuItems, categories } from '@/data/menuData';
export type { MenuItem as MenuDataItem } from '@/context/CartContext';

// ─── Table shape ─────────────────────────────────────────────────────────────

export interface Table {
    id: string;
    name: string;
    seats: number;
    x: number;
    y: number;
    status: 'available' | 'busy' | 'reserved' | 'pending_payment'; // Added pending_payment
}

// Re-export MenuItem alias for backwards compatibility with dashboard pages
// that import { menuItems, type MenuItem } from '@/data/sharedData'
export interface MenuItem {
    id: string;
    name: string;
    category: string;
    price: number;
    available: boolean;
    image: string;   // Unsplash URL (same as customer menu)
    description: string;
}

// ─── Tables ──────────────────────────────────────────────────────────────────

const defaultTables: Table[] = [
    { id: 'T-01', name: 'Table 1', seats: 2, x: 50, y: 50, status: 'available' },
    { id: 'T-02', name: 'Table 2', seats: 4, x: 200, y: 50, status: 'pending_payment' }, // Example pending_payment
    { id: 'T-03', name: 'Table 3', seats: 2, x: 350, y: 50, status: 'available' },
    { id: 'T-04', name: 'Table 4', seats: 6, x: 500, y: 50, status: 'available' },
    { id: 'T-05', name: 'Table 5', seats: 4, x: 50, y: 200, status: 'busy' },
    { id: 'T-06', name: 'Table 6', seats: 2, x: 200, y: 200, status: 'available' },
    { id: 'T-07', name: 'Table 7', seats: 4, x: 350, y: 200, status: 'available' },
    { id: 'T-08', name: 'Table 8', seats: 2, x: 500, y: 200, status: 'busy' },
    { id: 'T-09', name: 'Table 9', seats: 8, x: 50, y: 350, status: 'available' },
    { id: 'T-10', name: 'Table 10', seats: 4, x: 250, y: 350, status: 'available' },
    { id: 'T-11', name: 'Table 11', seats: 6, x: 450, y: 350, status: 'reserved' },
    { id: 'T-12', name: 'Table 12', seats: 2, x: 70, y: 260, status: 'busy' },
    { id: 'T-13', name: 'Table 13', seats: 4, x: 170, y: 260, status: 'available' },
    { id: 'T-14', name: 'Table 14', seats: 2, x: 270, y: 260, status: 'available' },
    { id: 'T-15', name: 'Table 15', seats: 6, x: 20, y: 440, status: 'reserved' },
    { id: 'T-16', name: 'Table 16', seats: 4, x: 150, y: 440, status: 'available' },
    { id: 'T-17', name: 'Table 17', seats: 2, x: 270, y: 440, status: 'available' },
    { id: 'T-18', name: 'Table 18', seats: 3, x: 370, y: 440, status: 'busy' },
];

export const getDefaultTables = (): Table[] => defaultTables.map((table) => ({ ...table }));

let tablesData: Table[] | null = null;

const TABLES_STORAGE_KEY_PREFIX = 'hotelmenu_floorplan_tables';
const tablesCache = new Map<string, Table[]>();

function resolveTableScope(scopeId?: string): string {
    if (scopeId) return scopeId;
    if (typeof window === 'undefined') return 'default';

    const segments = window.location.pathname.split('/').filter(Boolean);
    const dashboardIdx = segments.indexOf('dashboard');
    if (dashboardIdx > 0) {
        return segments[dashboardIdx - 1];
    }

    return 'default';
}

function getTablesStorageKey(scopeId?: string): string {
    return `${TABLES_STORAGE_KEY_PREFIX}:${resolveTableScope(scopeId)}`;
}

export const getTables = (scopeId?: string): Table[] => {
    const resolvedScope = resolveTableScope(scopeId);
    const storageKey = getTablesStorageKey(resolvedScope);

    if (typeof window !== 'undefined') {
        try {
            const stored = localStorage.getItem(storageKey);
            if (stored) {
                const parsed = JSON.parse(stored) as Table[];
                tablesCache.set(resolvedScope, parsed);
                return parsed;
            }
        } catch (e) {
            console.error('Failed to parse tables from localStorage', e);
        }
    }

    const cached = tablesCache.get(resolvedScope);
    if (cached) {
        return cached;
    }

    if (!tablesData) {
        tablesData = [...defaultTables];
    }

    const initial = [...tablesData];
    tablesCache.set(resolvedScope, initial);
    return initial;
};

export const setTables = (tables: Table[], scopeId?: string) => {
    const resolvedScope = resolveTableScope(scopeId);
    const storageKey = getTablesStorageKey(resolvedScope);
    tablesCache.set(resolvedScope, tables);

    // Keep the last-written scope in legacy memory for backwards compatibility.
    tablesData = tables;

    if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey, JSON.stringify(tables));
    }
};

export const updateTableStatus = (
    tableId: string,
    status: 'available' | 'busy' | 'reserved',
    scopeId?: string
) => {
    const tables = getTables(scopeId).map(t => t.id === tableId ? { ...t, status } : t);
    setTables(tables, scopeId);
};
