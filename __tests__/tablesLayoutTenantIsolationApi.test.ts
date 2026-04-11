import { GET as getLayout, POST as setLayout } from '@/app/api/tables/layout/route';

const verifyIdTokenMock = jest.fn();
const getUserMock = jest.fn();
const docGetMock = jest.fn();
const docSetMock = jest.fn();

jest.mock('@/lib/firebase-admin', () => ({
    adminAuth: {
        verifyIdToken: (...args: unknown[]) => verifyIdTokenMock(...args),
        getUser: (...args: unknown[]) => getUserMock(...args),
    },
    adminFirestore: {
        doc: (path: string) => ({
            get: () => docGetMock(path),
            set: (...args: unknown[]) => docSetMock(...args),
        }),
    },
}));

describe('Tables layout API tenant isolation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        verifyIdTokenMock.mockResolvedValue({ uid: 'user-a' });
        getUserMock.mockResolvedValue({ customClaims: { role: 'staff', restaurant_id: 'hotel-a' } });
        docGetMock.mockImplementation((path: string) => {
            if (path.includes('/staff/')) {
                return Promise.resolve({ exists: false, data: () => ({}) });
            }
            return Promise.resolve({ exists: true, data: () => ({ tables: [], walls: [], desks: [], floorPlans: [] }) });
        });
        docSetMock.mockResolvedValue(undefined);
    });

    it('blocks cross-tenant read with 403', async () => {
        const req = new Request('http://localhost/api/tables/layout?restaurantId=hotel-b', {
            headers: { authorization: 'Bearer token-a' },
        });

        const res = await getLayout(req as unknown as Parameters<typeof getLayout>[0]);
        const body = await res.json();

        expect(res.status).toBe(403);
        expect(String(body?.error || '')).toContain('Access denied');
    });

    it('blocks staff write even for same tenant', async () => {
        const req = new Request('http://localhost/api/tables/layout', {
            method: 'POST',
            headers: {
                authorization: 'Bearer token-a',
                'content-type': 'application/json',
            },
            body: JSON.stringify({ restaurantId: 'hotel-a', tables: [] }),
        });

        const res = await setLayout(req as unknown as Parameters<typeof setLayout>[0]);
        const body = await res.json();

        expect(res.status).toBe(403);
        expect(String(body?.error || '')).toContain('Access denied');
    });

    it('allows owner write for same tenant', async () => {
        getUserMock.mockResolvedValueOnce({ customClaims: { role: 'owner', restaurant_id: 'hotel-a' } });

        const req = new Request('http://localhost/api/tables/layout', {
            method: 'POST',
            headers: {
                authorization: 'Bearer token-a',
                'content-type': 'application/json',
            },
            body: JSON.stringify({ restaurantId: 'hotel-a', tables: [], walls: [], desks: [], floorPlans: [] }),
        });

        const res = await setLayout(req as unknown as Parameters<typeof setLayout>[0]);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body?.success).toBe(true);
        expect(docSetMock).toHaveBeenCalledTimes(1);
    });
});
