import { GET as listMenu } from '@/app/api/menu/list/route';
import { POST as createCategory } from '@/app/api/menu/categories/route';
import { POST as importMenu } from '@/app/api/menu/import/route';

const verifyIdTokenMock = jest.fn();
const getUserMock = jest.fn();
const docGetMock = jest.fn();
const categoriesGetMock = jest.fn();
const menuItemsGetMock = jest.fn();

jest.mock('@/lib/firebase-admin', () => ({
    adminAuth: {
        verifyIdToken: (...args: unknown[]) => verifyIdTokenMock(...args),
        getUser: (...args: unknown[]) => getUserMock(...args),
    },
    adminFirestore: {
        doc: (...args: unknown[]) => ({
            get: (...inner: unknown[]) => docGetMock(...args, ...inner),
        }),
        collection: (path: string) => ({
            orderBy: (field: string) => ({
                get: () => {
                    if (path.includes('/categories') && field === 'display_order') {
                        return categoriesGetMock();
                    }
                    if (path.includes('/menu_items') && field === 'name') {
                        return menuItemsGetMock();
                    }
                    return Promise.resolve({ docs: [] });
                },
            }),
        }),
    },
}));

describe('Menu API tenant isolation', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        verifyIdTokenMock.mockResolvedValue({ uid: 'user-a' });
        getUserMock.mockResolvedValue({
            customClaims: { role: 'owner', restaurant_id: 'hotel-a' },
        });
        docGetMock.mockResolvedValue({ exists: false, data: () => ({}) });
        categoriesGetMock.mockResolvedValue({ docs: [] });
        menuItemsGetMock.mockResolvedValue({ docs: [] });
    });

    it('blocks /api/menu/list for cross-tenant token access with 403', async () => {
        const req = new Request('http://localhost/api/menu/list?restaurantId=hotel-b', {
            headers: { authorization: 'Bearer token-a' },
        });

        const res = await listMenu(req as any);
        const body = await res.json();

        expect(res.status).toBe(403);
        expect(String(body?.error || '')).toContain('tenant mismatch');
    });

    it('allows /api/menu/list via stale-claims fallback when staff doc matches requested tenant', async () => {
        docGetMock.mockResolvedValue({ exists: true, data: () => ({ role: 'admin' }) });
        categoriesGetMock.mockResolvedValue({
            docs: [{ id: 'cat-1', data: () => ({ name: 'Main', display_order: 1 }) }],
        });
        menuItemsGetMock.mockResolvedValue({
            docs: [{ id: 'item-1', data: () => ({ name: 'Soup', price: 120, category_id: 'cat-1' }) }],
        });

        const req = new Request('http://localhost/api/menu/list?restaurantId=hotel-b', {
            headers: { authorization: 'Bearer token-a' },
        });

        const res = await listMenu(req as any);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(Array.isArray(body?.categories)).toBe(true);
        expect(Array.isArray(body?.menuItems)).toBe(true);
    });

    it('blocks /api/menu/categories POST for cross-tenant token access with 403', async () => {
        const req = new Request('http://localhost/api/menu/categories', {
            method: 'POST',
            headers: {
                authorization: 'Bearer token-a',
                'content-type': 'application/json',
            },
            body: JSON.stringify({ restaurantId: 'hotel-b', name: 'Starters' }),
        });

        const res = await createCategory(req as any);
        const body = await res.json();

        expect(res.status).toBe(403);
        expect(String(body?.error || '')).toContain('tenant mismatch');
    });

    it('blocks /api/menu/import POST for cross-tenant token access with 403', async () => {
        const form = new FormData();
        form.append('tenantId', 'hotel-b');

        const req = new Request('http://localhost/api/menu/import', {
            method: 'POST',
            headers: { authorization: 'Bearer token-a' },
            body: form,
        });

        const res = await importMenu(req);
        const body = await res.json();

        expect(res.status).toBe(403);
        expect(String(body?.error || '')).toContain('tenant mismatch');
    });
});
