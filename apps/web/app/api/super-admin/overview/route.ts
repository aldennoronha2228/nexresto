import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminFirestore } from '@/lib/firebase-admin';
import { PRICING_PLANS } from '@/lib/pricing';

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

function getTierPricingMap(): Record<string, number> {
  const starter = Number(String(PRICING_PLANS.find((p) => p.name === 'Starter')?.priceInr || '999').replace(/[^\d]/g, '')) || 999;
  const growth = Number(String(PRICING_PLANS.find((p) => p.name === 'Growth')?.priceInr || '2499').replace(/[^\d]/g, '')) || 2499;
  const proChain = Number(String(PRICING_PLANS.find((p) => p.name === 'Pro Chain')?.priceInr || '7999').replace(/[^\d]/g, '')) || 7999;

  return {
    starter,
    pro: growth,
    '1k': starter,
    '2k': growth,
    '2.5k': proChain,
  };
}

async function getPlatformStats() {
  const restaurantsSnap = await adminFirestore.collection('restaurants').get();
  const restaurantDocs = restaurantsSnap.docs;
  const tierPricing = getTierPricingMap();

  let totalRevenue = 0;
  for (const restDoc of restaurantDocs) {
    const data = restDoc.data();
    if (data.subscription_status === 'active') {
      totalRevenue += tierPricing[data.subscription_tier] || 0;
    }
  }

  const activeOrderCounts = await Promise.allSettled(
    restaurantDocs.map(async (restDoc) => {
      const newOrders = await restDoc.ref.collection('orders').where('status', '==', 'new').get();
      const preparingOrders = await restDoc.ref.collection('orders').where('status', '==', 'preparing').get();
      return newOrders.size + preparingOrders.size;
    })
  );

  const activeOrders = activeOrderCounts.reduce((sum, result) => {
    if (result.status === 'fulfilled') return sum + result.value;
    console.warn('SUPER_ADMIN_STATS_ACTIVE_ORDERS_FAILED', {
      message: result.reason instanceof Error ? result.reason.message : String(result.reason),
    });
    return sum;
  }, 0);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const newSignups = restaurantDocs.reduce((count, docSnap) => {
    const data = docSnap.data();
    const createdAt = data.created_at?.toDate?.() || new Date(data.created_at);
    return createdAt >= thirtyDaysAgo ? count + 1 : count;
  }, 0);

  return {
    total_restaurants: restaurantDocs.length,
    total_revenue: totalRevenue,
    active_orders: activeOrders,
    new_signups_30d: newSignups,
  };
}

async function getGlobalLogs(limit: number = 50, offset: number = 0) {
  try {
    const snapshot = await adminFirestore
      .collection('global_logs')
      .orderBy('created_at', 'desc')
      .offset(offset)
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        event_type: data.event_type,
        severity: data.severity,
        message: data.message,
        metadata: data.metadata || {},
        tenant_id: data.tenant_id || null,
        user_id: data.user_id || null,
        created_at: data.created_at?.toDate?.()?.toISOString?.() || '',
        restaurants: data.restaurant_name ? { name: data.restaurant_name } : null,
      };
    });
  } catch (error) {
    console.error('Error fetching logs:', error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
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

    const auth = await requireSuperAdmin(request);
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
