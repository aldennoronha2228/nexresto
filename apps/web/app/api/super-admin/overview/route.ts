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
    return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
  }

  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.replace('Bearer ', '').trim());
    const role = String(decoded.role || '').trim();
    if (role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return decoded;
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('SUPER_ADMIN_AUTH_FAILED', {
      endpoint: '/api/super-admin/overview',
      message: err.message,
      stack: err.stack,
    });

    return NextResponse.json(
      {
        error: true,
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      },
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
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

    const stats = await getPlatformStats();
    const recentLogs = await getGlobalLogs(10);

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
