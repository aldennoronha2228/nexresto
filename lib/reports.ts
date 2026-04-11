import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase-admin';

export type DailyReport = {
    id: string;
    restaurant_id: string;
    report_date: string;
    total_revenue: number;
    total_orders: number;
    avg_order_value: number;
    top_items: { name: string; quantity: number; revenue: number }[];
    hourly_breakdown: Record<string, number>;
    busiest_hour: number | null;
    cancelled_orders: number;
    generated_at: FirebaseFirestore.FieldValue;
};

export function isProTier(tier: unknown): boolean {
    const value = String(tier || '').toLowerCase();
    return value === 'pro' || value === '2k' || value === '2.5k';
}

export function getYesterdayYmdUtc(): string {
    return new Date(Date.now() - 86400000).toISOString().slice(0, 10);
}

export async function getOwnerEmailForRestaurant(restaurantId: string, fallbackFromRestaurantDoc?: unknown): Promise<string | null> {
    const direct = String(fallbackFromRestaurantDoc || '').trim().toLowerCase();
    if (direct) {
        return direct;
    }

    const ownerSnap = await adminFirestore
        .collection(`restaurants/${restaurantId}/staff`)
        .where('role', '==', 'owner')
        .where('is_active', '==', true)
        .limit(1)
        .get();

    if (ownerSnap.empty) {
        const anyOwnerSnap = await adminFirestore
            .collection(`restaurants/${restaurantId}/staff`)
            .where('role', '==', 'owner')
            .limit(1)
            .get();
        if (anyOwnerSnap.empty) return null;
        return String(anyOwnerSnap.docs[0].data()?.email || '').trim().toLowerCase() || null;
    }

    return String(ownerSnap.docs[0].data()?.email || '').trim().toLowerCase() || null;
}

export async function generateDailyReport(restaurantId: string, date?: string): Promise<{ report: DailyReport; restaurantName: string | null }> {
    const reportDate = date || getYesterdayYmdUtc();

    const restDoc = await adminFirestore.doc(`restaurants/${restaurantId}`).get();
    const restData = restDoc.data() || {};

    const ordersSnap = await adminFirestore
        .collection(`restaurants/${restaurantId}/orders`)
        .where('created_at', '>=', new Date(`${reportDate}T00:00:00`))
        .where('created_at', '<', new Date(`${reportDate}T23:59:59`))
        .get();

    const allOrders = ordersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as any));
    const validOrders = allOrders.filter((o) => o.status !== 'cancelled');
    const cancelledOrders = allOrders.filter((o) => o.status === 'cancelled').length;
    const totalRevenue = validOrders.reduce((sum: number, o: any) => sum + parseFloat(o.total || '0'), 0);
    const totalOrders = validOrders.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const hourlyBreakdown: Record<string, number> = {};
    validOrders.forEach((order: any) => {
        const createdAt = order.created_at?.toDate?.() || new Date(order.created_at);
        const hour = createdAt.getHours();
        hourlyBreakdown[String(hour)] = (hourlyBreakdown[String(hour)] || 0) + 1;
    });

    let busiestHour: number | null = null;
    let maxOrders = 0;
    Object.entries(hourlyBreakdown).forEach(([hour, count]) => {
        if (count > maxOrders) {
            maxOrders = count;
            busiestHour = parseInt(hour, 10);
        }
    });

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

    const topItems = Object.entries(itemMap)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);

    const reportDocId = `report_${reportDate}`;
    const reportData: DailyReport = {
        id: reportDocId,
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
    await adminFirestore.doc(`restaurants/${restaurantId}`).update({
        last_report_date: reportDate,
    });

    return {
        report: reportData,
        restaurantName: (restData.name as string) || null,
    };
}
