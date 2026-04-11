import { GET as getLiveOrders } from '@/app/api/orders/live/route';
import { POST as manageOrder } from '@/app/api/orders/manage/route';

const verifyIdTokenMock = jest.fn();
const getUserMock = jest.fn();
const docGetMock = jest.fn();
const ordersGetMock = jest.fn();
const orderUpdateMock = jest.fn();
const orderDeleteMock = jest.fn();

jest.mock('@/lib/firebase-admin', () => ({
    adminAuth: {
        verifyIdToken: (...args: unknown[]) => verifyIdTokenMock(...args),
        getUser: (...args: unknown[]) => getUserMock(...args),
    },
    adminFirestore: {
        doc: (path: string) => ({
            get: () => {
                if (path.includes('/staff/')) {
                    return docGetMock();
                }
                return Promise.resolve({ exists: false, data: () => ({}) });
            },
            update: (...args: unknown[]) => orderUpdateMock(...args),
            delete: (...args: unknown[]) => orderDeleteMock(...args),
        }),
        collection: () => ({
            orderBy: () => ({
                get: () => ordersGetMock(),
            }),
        }),
    },
}));

describe('Orders API tenant isolation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        verifyIdTokenMock.mockResolvedValue({ uid: 'user-a' });
        getUserMock.mockResolvedValue({ customClaims: { role: 'staff', restaurant_id: 'hotel-a' } });
        docGetMock.mockResolvedValue({ exists: false, data: () => ({}) });
        ordersGetMock.mockResolvedValue({ docs: [] });
        orderUpdateMock.mockResolvedValue(undefined);
        orderDeleteMock.mockResolvedValue(undefined);
    });

    it('blocks cross-tenant access for live orders with 403', async () => {
        const req = new Request('http://localhost/api/orders/live?restaurantId=hotel-b', {
            headers: { authorization: 'Bearer token-a' },
        });

        const res = await getLiveOrders(req as any);
        const body = await res.json();

        expect(res.status).toBe(403);
        expect(String(body?.error || '')).toContain('tenant mismatch');
    });

    it('blocks cross-tenant order manage access with 403', async () => {
        const req = new Request('http://localhost/api/orders/manage', {
            method: 'POST',
            headers: {
                authorization: 'Bearer token-a',
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                action: 'delete_order',
                restaurantId: 'hotel-b',
                orderId: 'ord-1',
            }),
        });

        const res = await manageOrder(req as any);
        const body = await res.json();

        expect(res.status).toBe(403);
        expect(String(body?.error || '')).toContain('tenant mismatch');
    });

    it('allows in-tenant manage action when claims match', async () => {
        getUserMock.mockResolvedValueOnce({ customClaims: { role: 'owner', restaurant_id: 'hotel-a' } });

        const req = new Request('http://localhost/api/orders/manage', {
            method: 'POST',
            headers: {
                authorization: 'Bearer token-a',
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                action: 'delete_order',
                restaurantId: 'hotel-a',
                orderId: 'ord-2',
            }),
        });

        const res = await manageOrder(req as any);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body?.success).toBe(true);
        expect(orderDeleteMock).toHaveBeenCalledTimes(1);
    });
});
