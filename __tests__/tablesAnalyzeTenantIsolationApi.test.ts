import { POST as analyzeTables } from '@/app/api/tables/analyze-image/route';

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
    },
}));

describe('Tables analyze-image API tenant isolation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.OPENAI_API_KEY = 'test-key';
        verifyIdTokenMock.mockResolvedValue({ uid: 'user-a' });
        getUserMock.mockResolvedValue({ customClaims: { role: 'staff', restaurant_id: 'hotel-a' } });
        docGetMock.mockResolvedValue({ exists: false, data: () => ({}) });
    });

    it('blocks cross-tenant image analysis with 403', async () => {
        const form = new FormData();
        form.append('restaurantId', 'hotel-b');
        form.append('hintTableCount', '8');
        form.append('image', new File([new Uint8Array([1, 2, 3])], 'floor.png', { type: 'image/png' }));

        const req = new Request('http://localhost/api/tables/analyze-image', {
            method: 'POST',
            headers: { authorization: 'Bearer token-a' },
            body: form,
        });

        const res = await analyzeTables(req as unknown as Parameters<typeof analyzeTables>[0]);
        const body = await res.json();

        expect(res.status).toBe(403);
        expect(String(body?.error || '')).toContain('Access denied');
    });
});
