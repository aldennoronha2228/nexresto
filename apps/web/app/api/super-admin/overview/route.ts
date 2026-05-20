import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function envCheck() {
    return {
        FIREBASE_CLIENT_EMAIL: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
        FIREBASE_PRIVATE_KEY: Boolean(process.env.FIREBASE_PRIVATE_KEY),
        FIREBASE_PROJECT_ID: Boolean(process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    };
}

function jsonError(status: number, message: string, err?: Error) {
    return NextResponse.json(
        {
            success: false,
            error: message,
            name: err?.name,
            stack: err?.stack,
        },
        {
            status,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store',
            },
        }
    );
}

async function readRequestBody(request: NextRequest): Promise<string | null> {
    try {
        const text = await request.text();
        return text || null;
    } catch {
        return null;
    }
}

async function requireSuperAdmin(request: NextRequest, adminAuth: typeof import('@/lib/firebase-admin').adminAuth) {
    const authHeader = request.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
        console.warn('SUPER_ADMIN_AUTH_MISSING', {
            endpoint: '/api/super-admin/overview',
            hasAuthorizationHeader: Boolean(authHeader),
        });
        return jsonError(401, 'Missing authorization token');
    }

    try {
        const decoded = await adminAuth.verifyIdToken(authHeader.replace('Bearer ', '').trim());
        const role = String(decoded.role || '').trim();
        if (role !== 'super_admin') {
            return jsonError(403, 'Forbidden');
        }

        return decoded;
    } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error('SUPER_ADMIN_AUTH_FAILED', {
            endpoint: '/api/super-admin/overview',
            message: err.message,
            stack: err.stack,
        });

        return jsonError(401, err.message, err);
    }
}

export async function GET(request: NextRequest) {
    try {
        const [{ adminAuth }, { getPlatformStats, getGlobalLogs }] = await Promise.all([
            import('@/lib/firebase-admin'),
            import('@/lib/firebase-super-admin-actions'),
        ]);

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

        const auth = await requireSuperAdmin(request, adminAuth);
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

        return NextResponse.json(
            {
                success: true,
                data: {
                    stats,
                    recentLogs,
                },
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store',
                },
            }
        );
    } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error('FULL SERVER ERROR:', err);
        console.error(err.stack);
        return jsonError(500, err.message, err);
    }
}
