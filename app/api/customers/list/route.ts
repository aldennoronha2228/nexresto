import { NextRequest, NextResponse } from 'next/server';
import { adminFirestore } from '@/lib/firebase-admin';
import { authorizeTenantAccess } from '@/lib/server/authz/tenant';

function toIso(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null;
    const maybe = value as { toDate?: () => Date };
    if (typeof maybe.toDate !== 'function') return null;
    return maybe.toDate().toISOString();
}

function normalizePhone(value: unknown): string {
    return String(value || '').replace(/\D/g, '').slice(-10);
}

function parseDate(value: string | null): number {
    if (!value) return 0;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
}

export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization') || '';
        if (!authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const idToken = authHeader.replace('Bearer ', '').trim();
        const restaurantId = (request.nextUrl.searchParams.get('restaurantId') || '').trim();

        if (!restaurantId) {
            return NextResponse.json({ error: 'restaurantId is required' }, { status: 400 });
        }

        const authz = await authorizeTenantAccess(idToken, restaurantId, 'read');
        if (!authz) {
            return NextResponse.json({ error: 'Forbidden: tenant mismatch' }, { status: 403 });
        }

        const snap = await adminFirestore
            .collection(`restaurants/${restaurantId}/customers`)
            .orderBy('lastVisited', 'desc')
            .limit(1000)
            .get();

        const paidOrdersSnap = await adminFirestore
            .collection(`restaurants/${restaurantId}/orders`)
            .where('status', '==', 'paid')
            .get();

        const orderAgg = new Map<string, {
            totalSpend: number;
            visitCount: number;
            lastVisited: string | null;
            name: string;
            tableNumber: string;
        }>();

        paidOrdersSnap.docs.forEach((doc) => {
            const row = doc.data() as Record<string, unknown>;
            const phone = normalizePhone(row.customer_phone);
            if (!/^\d{10}$/.test(phone)) return;

            const existing = orderAgg.get(phone) || {
                totalSpend: 0,
                visitCount: 0,
                lastVisited: null,
                name: '',
                tableNumber: '',
            };

            const orderTotal = Number(row.total || 0);
            const createdAt = toIso(row.created_at);

            existing.totalSpend += Number.isFinite(orderTotal) ? orderTotal : 0;
            existing.visitCount += 1;
            if (parseDate(createdAt) >= parseDate(existing.lastVisited)) {
                existing.lastVisited = createdAt;
                existing.name = String(row.customer_name || existing.name || '');
                existing.tableNumber = String(row.table_number || existing.tableNumber || '');
            }

            orderAgg.set(phone, existing);
        });

        const customersByPhone = new Map<string, {
            id: string;
            name: string;
            phone: string;
            tableNumber: string;
            visitCount: number;
            totalSpend: number;
            lastVisited: string | null;
        }>();

        snap.docs.forEach((doc) => {
            const data = doc.data() as Record<string, unknown>;
            const normalizedPhone = normalizePhone(data.phone || doc.id);
            const fromOrders = orderAgg.get(normalizedPhone);

            customersByPhone.set(normalizedPhone || doc.id, {
                id: doc.id,
                name: String(fromOrders?.name || data.name || 'Guest'),
                phone: String(data.phone || normalizedPhone || doc.id),
                tableNumber: String(fromOrders?.tableNumber || data.lastTableNumber || ''),
                visitCount: Math.max(Number(data.visitCount || 0), Number(fromOrders?.visitCount || 0)),
                totalSpend: Math.max(Number(data.totalSpend || 0), Number(fromOrders?.totalSpend || 0)),
                lastVisited: parseDate(toIso(data.lastVisited)) >= parseDate(fromOrders?.lastVisited || null)
                    ? toIso(data.lastVisited)
                    : (fromOrders?.lastVisited || null),
            });
        });

        orderAgg.forEach((value, phone) => {
            if (customersByPhone.has(phone)) return;

            customersByPhone.set(phone, {
                id: phone,
                name: value.name || 'Guest',
                phone,
                tableNumber: value.tableNumber || '',
                visitCount: value.visitCount,
                totalSpend: value.totalSpend,
                lastVisited: value.lastVisited,
            });
        });

        const customers = Array.from(customersByPhone.values())
            .sort((a, b) => parseDate(b.lastVisited) - parseDate(a.lastVisited));

        return NextResponse.json({ customers });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load customers';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
