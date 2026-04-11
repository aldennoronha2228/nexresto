import { GET as getReportSettings, POST as setReportSettings } from '@/app/api/reports/settings/route';

const verifyIdTokenMock = jest.fn();
const getUserMock = jest.fn();
const docGetMock = jest.fn();
const docUpdateMock = jest.fn();

jest.mock('@/lib/firebase-admin', () => ({
    adminAuth: {
        verifyIdToken: (...args: unknown[]) => verifyIdTokenMock(...args),
        getUser: (...args: unknown[]) => getUserMock(...args),
    },
    adminFirestore: {
        doc: (path: string) => ({
            get: () => docGetMock(path),
            update: (...args: unknown[]) => docUpdateMock(...args),
        }),
    },
}));

describe('Reports settings API tenant isolation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        verifyIdTokenMock.mockResolvedValue({ uid: 'user-a' });
        getUserMock.mockResolvedValue({ customClaims: { role: 'owner', restaurant_id: 'hotel-a' } });
        docGetMock.mockImplementation((path: string) => {
            if (path.includes('/staff/')) {
                return Promise.resolve({ exists: false, data: () => ({}) });
            }
            return Promise.resolve({
                exists: true,
                data: () => ({ subscription_tier: 'pro', email_reports_enabled: true }),
            });
        });
        docUpdateMock.mockResolvedValue(undefined);
    });

    it('blocks cross-tenant reads with 403', async () => {
        const req = new Request('http://localhost/api/reports/settings?restaurantId=hotel-b', {
            headers: { authorization: 'Bearer token-a' },
        });

        const res = await getReportSettings(req as unknown as Parameters<typeof getReportSettings>[0]);
        const body = await res.json();

        expect(res.status).toBe(403);
        expect(String(body?.error || '')).toContain('tenant mismatch');
    });

    it('blocks non-owner updates even when tenant matches', async () => {
        getUserMock.mockResolvedValueOnce({ customClaims: { role: 'staff', restaurant_id: 'hotel-a' } });

        const req = new Request('http://localhost/api/reports/settings', {
            method: 'POST',
            headers: {
                authorization: 'Bearer token-a',
                'content-type': 'application/json',
            },
            body: JSON.stringify({ restaurantId: 'hotel-a', emailReportsEnabled: true }),
        });

        const res = await setReportSettings(req as unknown as Parameters<typeof setReportSettings>[0]);
        const body = await res.json();

        expect(res.status).toBe(403);
        expect(String(body?.error || '')).toContain('Only owners');
    });

    it('allows owner updates for same tenant', async () => {
        const req = new Request('http://localhost/api/reports/settings', {
            method: 'POST',
            headers: {
                authorization: 'Bearer token-a',
                'content-type': 'application/json',
            },
            body: JSON.stringify({ restaurantId: 'hotel-a', emailReportsEnabled: false }),
        });

        const res = await setReportSettings(req as unknown as Parameters<typeof setReportSettings>[0]);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body?.success).toBe(true);
        expect(docUpdateMock).toHaveBeenCalledTimes(1);
    });
});
