import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getPlatformStats, getGlobalLogs } from '@/lib/firebase-super-admin-actions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function envCheck() {
    return {
        FIREBASE_CLIENT_EMAIL: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
        FIREBASE_PRIVATE_KEY: Boolean(process.env.FIREBASE_PRIVATE_KEY),
        FIREBASE_PROJECT_ID: Boolean(process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    };
}

async function readRequestBody(request: NextRequest): Promise<string | null> {
    try {
        const text = await request.text();
        return text || null;
    } catch {
        return null;
    }
}

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
    console.log('REQUEST RECEIVED', {
        endpoint: '/api/super-admin/overview',
        method: request.method,
        url: request.url,
        params: Object.fromEntries(new URL(request.url).searchParams.entries()),
        envCheck: envCheck(),
        headers: {
            authorization: request.headers.get('authorization') ? '[present]' : '[missing]',
            'content-type': request.headers.get('content-type') || null,
        },
    });

    try {
        const auth = await requireSuperAdmin(request);
        if (auth instanceof NextResponse) {
            console.log('USER:', { endpoint: '/api/super-admin/overview', authorized: false });
            return auth;
        }

        console.log('USER:', {
            endpoint: '/api/super-admin/overview',
            uid: auth.uid,
            role: String(auth.role || ''),
            restaurantId: String(auth.restaurant_id || auth.tenant_id || ''),
        });

        const requestBody = await readRequestBody(request);
        console.log('BODY:', requestBody);

        console.log('BEFORE getPlatformStats');
        const stats = await getPlatformStats();
        console.log('AFTER getPlatformStats');

        console.log('BEFORE getGlobalLogs');
        const recentLogs = await getGlobalLogs(10);
        console.log('AFTER getGlobalLogs');

        return NextResponse.json({
            success: true,
            data: {
                stats,
                recentLogs,
            },
        }, {
            headers: {
                'Content-Type': 'application/json',
            },
        });
    } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error('FULL SERVER ERROR:', err);
        console.error(err.stack);
        return NextResponse.json(
            {
                error: true,
                message: err.message,
                stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
            },
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}