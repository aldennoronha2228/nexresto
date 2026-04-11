import { GET as searchGlobal } from '@/app/api/search/global/route';

const verifyIdTokenMock = jest.fn();
const getUserMock = jest.fn();
const docGetMock = jest.fn();

jest.mock('@/lib/firebase-admin', () => ({
    adminAuth: {
        verifyIdToken: (...args: unknown[]) => verifyIdTokenMock(...args),
        getUser: (...args: unknown[]) => getUserMock(...args),
    },
    adminFirestore: {
        doc: (...args: unknown[]) => ({
            get: (...inner: unknown[]) => docGetMock(...args, ...inner),
        }),
        collection: () => ({
            orderBy: () => ({
                limit: () => ({
                    get: async () => ({ docs: [] }),
                }),
            }),
        }),
    },
}));

describe('Search API tenant isolation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        verifyIdTokenMock.mockResolvedValue({ uid: 'user-a' });
        getUserMock.mockResolvedValue({
            customClaims: { role: 'staff', restaurant_id: 'hotel-a' },
        });
        docGetMock.mockResolvedValue({ exists: false, data: () => ({}) });
    });

    it('returns 403 for cross-tenant search access', async () => {
        const req = new Request('http://localhost/api/search/global?restaurantId=hotel-b&q=soup', {
            headers: { authorization: 'Bearer token-a' },
        });

        const res = await searchGlobal(req as any);
        const body = await res.json();

        expect(res.status).toBe(403);
        expect(String(body?.error || '')).toContain('tenant mismatch');
    });

    it('allows search via staff-doc stale-claims fallback', async () => {
        docGetMock.mockResolvedValue({ exists: true, data: () => ({ role: 'staff' }) });

        const req = new Request('http://localhost/api/search/global?restaurantId=hotel-b&q=soup', {
            headers: { authorization: 'Bearer token-a' },
        });

        const res = await searchGlobal(req as any);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(Array.isArray(body?.orders)).toBe(true);
        expect(Array.isArray(body?.menuItems)).toBe(true);
    });
});
