import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminFirestore } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * GET /api/reports  (Firebase)
 * Fetch daily reports for a restaurant
 * Query params: restaurantId, startDate, endDate, limit
 */
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.replace('Bearer ', '');

    const { searchParams } = new URL(request.url);
    const restaurantId = searchParams.get('restaurantId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '30');

    if (!restaurantId) {
        return NextResponse.json({ error: 'restaurantId required' }, { status: 400 });
    }

    // Verify user token
    let decodedToken;
    try {
        decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch {
        return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const uid = decodedToken.uid;
    const userRecord = await adminAuth.getUser(uid);
    const claims = userRecord.customClaims || {};

    // Verify user belongs to this restaurant (or is super_admin)
    const claimRestaurantId = String(claims.restaurant_id || claims.tenant_id || '');
    if (claims.role !== 'super_admin' && claimRestaurantId !== restaurantId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Check subscription tier
    const restDoc = await adminFirestore.doc(`restaurants/${restaurantId}`).get();
    const restData = restDoc.data();

    const isPro = restData?.subscription_tier === 'pro' ||
        restData?.subscription_tier === '2k' ||
        restData?.subscription_tier === '2.5k';

    if (!isPro) {
        return NextResponse.json({
            error: 'Reports are a Pro feature',
            upgrade: true
        }, { status: 403 });
    }

    // Fetch reports from analytics sub-collection
    try {
        let query = adminFirestore
            .collection(`restaurants/${restaurantId}/analytics`)
            .orderBy('report_date', 'desc')
            .limit(limit);

        if (startDate) {
            query = query.where('report_date', '>=', startDate);
        }
        if (endDate) {
            query = query.where('report_date', '<=', endDate);
        }

        const reportsSnap = await query.get();
        const reports = reportsSnap.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));

        return NextResponse.json({ reports });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * POST /api/reports  (Firebase)
 * Generate a daily report for a specific date
 */
export async function POST(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.replace('Bearer ', '');

    const body = await request.json();
    const { restaurantId, date } = body;

    if (!restaurantId) {
        return NextResponse.json({ error: 'restaurantId required' }, { status: 400 });
    }

    // Verify user token
    let decodedToken;
    try {
        decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch {
        return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const uid = decodedToken.uid;
    const userRecord = await adminAuth.getUser(uid);
    const claims = userRecord.customClaims || {};

    // Verify user belongs to this restaurant
    const claimRestaurantId = String(claims.restaurant_id || claims.tenant_id || '');
    if (claims.role !== 'super_admin' && claimRestaurantId !== restaurantId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Check subscription tier
    const restDoc = await adminFirestore.doc(`restaurants/${restaurantId}`).get();
    const restData = restDoc.data();

    const isPro = restData?.subscription_tier === 'pro' ||
        restData?.subscription_tier === '2k' ||
        restData?.subscription_tier === '2.5k';

    if (!isPro) {
        return NextResponse.json({
            error: 'Reports are a Pro feature',
            upgrade: true
        }, { status: 403 });
    }

    // Generate report using Firestore data
    const reportDate = date || new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Calculate metrics from orders
    const ordersSnap = await adminFirestore
        .collection(`restaurants/${restaurantId}/orders`)
        .where('created_at', '>=', new Date(`${reportDate}T00:00:00`))
        .where('created_at', '<', new Date(`${reportDate}T23:59:59`))
        .get();

    const allOrders = ordersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
    const validOrders = allOrders.filter(o => o.status !== 'cancelled');
    const cancelledOrders = allOrders.filter(o => o.status === 'cancelled').length;
    const totalRevenue = validOrders.reduce((sum: number, o: any) => sum + parseFloat(o.total || '0'), 0);
    const totalOrders = validOrders.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Get hourly breakdown
    const hourlyBreakdown: Record<string, number> = {};
    validOrders.forEach((order: any) => {
        const createdAt = order.created_at?.toDate?.() || new Date(order.created_at);
        const hour = createdAt.getHours();
        hourlyBreakdown[hour] = (hourlyBreakdown[hour] || 0) + 1;
    });

    // Find busiest hour
    let busiestHour: number | null = null;
    let maxOrders = 0;
    Object.entries(hourlyBreakdown).forEach(([hour, count]) => {
        if (count > maxOrders) {
            maxOrders = count;
            busiestHour = parseInt(hour);
        }
    });

    // Get top items (embedded in order documents)
    let topItems: { name: string; quantity: number; revenue: number }[] = [];
    const itemMap: Record<string, { quantity: number; revenue: number }> = {};

    validOrders.forEach((order: any) => {
        (order.items || []).forEach((item: any) => {
            const name = item.item_name || 'Unknown';
            if (!itemMap[name]) {
                itemMap[name] = { quantity: 0, revenue: 0 };
            }
            itemMap[name].quantity += item.quantity || 1;
            itemMap[name].revenue += parseFloat(item.item_price || '0') * (item.quantity || 1);
        });
    });

    topItems = Object.entries(itemMap)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);

    // Upsert report in Firestore analytics sub-collection
    const reportDocId = `report_${reportDate}`;
    const reportData = {
        restaurant_id: restaurantId,
        report_date: reportDate,
        total_revenue: totalRevenue,
        total_orders: totalOrders,
        avg_order_value: avgOrderValue,
        top_items: topItems,
        hourly_breakdown: hourlyBreakdown,
        busiest_hour: busiestHour,
        cancelled_orders: cancelledOrders,
        generated_at: FieldValue.serverTimestamp(),
    };

    await adminFirestore.doc(`restaurants/${restaurantId}/analytics/${reportDocId}`).set(reportData, { merge: true });

    // Update restaurant's last_report_date
    await adminFirestore.doc(`restaurants/${restaurantId}`).update({
        last_report_date: reportDate,
    });

    return NextResponse.json({
        report: { id: reportDocId, ...reportData },
        restaurantName: restData?.name
    });
}
