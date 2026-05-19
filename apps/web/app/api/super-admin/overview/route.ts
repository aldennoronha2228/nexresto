import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getPlatformStats, getGlobalLogs } from '@/lib/firebase-super-admin-actions';

export const dynamic = 'force-dynamic';

async function requireSuperAdmin(request: NextRequest) {
    const authHeader = request.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(authHeader.replace('Bearer ', '').trim());
    const role = String(decoded.role || '').trim();
    if (role !== 'super_admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return decoded;
}

export async function GET(request: NextRequest) {
    try {
        const auth = await requireSuperAdmin(request);
        if (auth instanceof NextResponse) return auth;

        const stats = await getPlatformStats();
        const recentLogs = await getGlobalLogs(10);

        return NextResponse.json({
            success: true,
            data: {
                stats,
                recentLogs,
            },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to load super admin overview';
        console.error('[api/super-admin/overview] error:', message);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}