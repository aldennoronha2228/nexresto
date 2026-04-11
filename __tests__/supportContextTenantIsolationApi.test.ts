import { GET as getSupportContext } from '@/app/api/support/context/route';

const verifyIdTokenMock = jest.fn();
const getUserMock = jest.fn();
const docGetMock = jest.fn();

jest.mock('@/lib/firebase-admin', () => ({
    adminAuth: {
        verifyIdToken: (...args: unknown[]) => verifyIdTokenMock(...args),
        getUser: (...args: unknown[]) => getUserMock(...args),
    },
    adminFirestore: {
        doc: (path: string) => ({
            get: () => docGetMock(path),
        }),
        collection: (path: string) => ({
            get: async () => ({ docs: [] }),
            where: (_field: string, _op: string, _value: string) => ({
                get: async () => ({ size: 0 }),
            }),
        }),
    },
}));

describe('Support context API tenant isolation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        verifyIdTokenMock.mockResolvedValue({ uid: 'user-a' });
        getUserMock.mockResolvedValue({ customClaims: { role: 'staff', restaurant_id: 'hotel-a' } });
        docGetMock.mockImplementation((path: string) => {
            if (path.includes('/staff/')) {
                return Promise.resolve({ exists: false, data: () => ({}) });
            }
            return Promise.resolve({ exists: true, data: () => ({ name: 'Hotel A', subscription_tier: 'starter' }) });
        });
    });

    it('blocks cross-tenant context access with 403', async () => {
        const req = new Request('http://localhost/api/support/context?restaurantId=hotel-b', {
            headers: { authorization: 'Bearer token-a' },
        });

        const res = await getSupportContext(req as unknown as Parameters<typeof getSupportContext>[0]);
        const body = await res.json();

        expect(res.status).toBe(403);
        expect(String(body?.error || '')).toContain('Access denied');
    });

    it('allows access with stale-claims staff fallback in target tenant', async () => {
        docGetMock.mockImplementation((path: string) => {
            if (path.includes('/staff/')) {
                return Promise.resolve({ exists: true, data: () => ({ role: 'staff' }) });
            }
            return Promise.resolve({ exists: true, data: () => ({ name: 'Hotel B', subscription_tier: 'starter' }) });
        });

        const req = new Request('http://localhost/api/support/context?restaurantId=hotel-b', {
            headers: { authorization: 'Bearer token-a' },
        });

        const res = await getSupportContext(req as unknown as Parameters<typeof getSupportContext>[0]);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body?.restaurant?.id).toBe('hotel-b');
    });
});
