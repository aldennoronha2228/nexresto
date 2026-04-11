import { NextRequest, NextResponse } from 'next/server';
import { adminFirestore } from '@/lib/firebase-admin';
import { authorizeTenantAccess } from '@/lib/server/authz/tenant';

type AiTier = 'free' | 'pro';
type GenericRow = { id: string; [key: string]: unknown };

function resolveAiTier(subscriptionTierRaw: unknown): AiTier {
    const tier = String(subscriptionTierRaw || '').trim().toLowerCase();
    if (tier === 'pro' || tier === '2k' || tier === '2.5k') return 'pro';
    return 'free';
}

function getDailyLimit(tier: AiTier): number {
    return tier === 'pro' ? 30 : 5;
}

function getNextUtcMidnightIso(): string {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
    return next.toISOString();
}

function toNonNegativeInt(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.floor(n);
}

function toNumber(value: unknown, fallback = 0): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function safeString(value: unknown, fallback = ''): string {
    const next = String(value ?? '').trim();
    return next || fallback;
}

function safeDateString(value: unknown): string | null {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value !== null && 'toDate' in value) {
        const candidate = value as { toDate?: () => Date };
        if (typeof candidate.toDate === 'function') {
            return candidate.toDate().toISOString();
        }
    }
    return null;
}

async function requireAuthorizedRestaurant(request: NextRequest): Promise<{ restaurantId: string } | NextResponse> {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const restaurantId = (new URL(request.url).searchParams.get('restaurantId') || '').trim();

    if (!restaurantId) {
        return NextResponse.json({ error: 'restaurantId is required' }, { status: 400 });
    }

    const authz = await authorizeTenantAccess(token, restaurantId, 'read');
    if (!authz) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return { restaurantId };
}

export async function GET(request: NextRequest) {
    try {
        const auth = await requireAuthorizedRestaurant(request);
        if (auth instanceof NextResponse) return auth;

        const { restaurantId } = auth;

        const restaurantRef = adminFirestore.doc(`restaurants/${restaurantId}`);
        const ordersCol = adminFirestore.collection(`restaurants/${restaurantId}/orders`);
        const menuCol = adminFirestore.collection(`restaurants/${restaurantId}/menu_items`);
        const categoriesCol = adminFirestore.collection(`restaurants/${restaurantId}/categories`);
        const inventoryCol = adminFirestore.collection(`restaurants/${restaurantId}/inventory_items`);
        const staffCol = adminFirestore.collection(`restaurants/${restaurantId}/staff`);
        const reportsCol = adminFirestore.collection(`restaurants/${restaurantId}/analytics`);
        const layoutRef = adminFirestore.doc(`restaurants/${restaurantId}/settings/floor_layout`);
        const brandingRef = adminFirestore.doc(`restaurants/${restaurantId}/settings/branding`);

        const [
            restaurantSnap,
            menuSnap,
            categoriesSnap,
            inventorySnap,
            staffSnap,
            layoutSnap,
            brandingSnap,
            allOrdersSnap,
            allReportsSnap,
            newSnap,
            preparingSnap,
            doneSnap,
            paidSnap,
            cancelledSnap,
        ] = await Promise.all([
            restaurantRef.get(),
            menuCol.get(),
            categoriesCol.get(),
            inventoryCol.get(),
            staffCol.get(),
            layoutRef.get(),
            brandingRef.get(),
            ordersCol.get(),
            reportsCol.get(),
            ordersCol.where('status', '==', 'new').get(),
            ordersCol.where('status', '==', 'preparing').get(),
            ordersCol.where('status', '==', 'done').get(),
            ordersCol.where('status', '==', 'paid').get(),
            ordersCol.where('status', '==', 'cancelled').get(),
        ]);

        const restaurant = restaurantSnap.exists ? restaurantSnap.data() || {} : {};
        const aiTier = resolveAiTier((restaurant as any).subscription_tier);
        const aiLimit = getDailyLimit(aiTier);
        const aiUsed = toNonNegativeInt((restaurant as any).usage?.dailyAiCount);
        const menuItems: GenericRow[] = menuSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
        const inventoryItems: GenericRow[] = inventorySnap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
        const staffMembers: GenericRow[] = staffSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
        const layout = layoutSnap.exists ? (layoutSnap.data() || {}) : {};
        const layoutTables = Array.isArray((layout as any).tables) ? (layout as any).tables : [];
        const branding = brandingSnap.exists ? (brandingSnap.data() || {}) : {};
        const latestReport = allReportsSnap.docs[0]?.data() || null;

        const unavailableCount = menuItems.filter((m) => m['available'] === false).length;
        const activeOrderCount = newSnap.size + preparingSnap.size + doneSnap.size;

        const lowInventoryCount = inventoryItems.filter((item) => {
            const quantity = toNumber(item['quantity'], 0);
            const reorderLevel = Math.max(0, toNumber(item['reorderLevel'], 0));
            return quantity <= reorderLevel && quantity > reorderLevel * 0.5;
        }).length;

        const criticalInventoryCount = inventoryItems.filter((item) => {
            const quantity = toNumber(item['quantity'], 0);
            const reorderLevel = Math.max(0, toNumber(item['reorderLevel'], 0));
            return quantity <= reorderLevel * 0.5;
        }).length;

        const staffByRole = staffMembers.reduce<Record<string, number>>((acc, member) => {
            const role = safeString(member['role'], 'staff').toLowerCase();
            acc[role] = (acc[role] || 0) + 1;
            return acc;
        }, {});

        const topCategories = categoriesSnap.docs
            .map((docSnap) => {
                const data = docSnap.data() as Record<string, unknown>;
                const categoryName = safeString(data.name, docSnap.id);
                const count = menuItems.filter((item) => safeString(item['category_id']) === docSnap.id).length;
                return { id: docSnap.id, name: categoryName, itemCount: count };
            })
            .sort((a, b) => b.itemCount - a.itemCount)
            .slice(0, 5);

        const recentOrders = allOrdersSnap.docs.map((docSnap) => {
            const data = docSnap.data() as Record<string, unknown>;
            return {
                id: docSnap.id,
                status: safeString(data.status, 'new'),
                table: safeString(data.table_name || data.tableId || data.table_id, ''),
                amount: toNumber(data.total || data.total_amount || data.grand_total, 0),
                createdAt: safeDateString(data.created_at),
            };
        }).slice(0, 5);

        const sampleMenuItems = menuItems.slice(0, 8).map((item) => ({
            id: safeString(item.id),
            name: safeString(item['name']),
            category: safeString(item['category_name'] || item['category'] || ''),
            categoryId: safeString(item['category_id'] || ''),
            price: toNumber(item['price'], 0),
            available: item['available'] !== false,
            type: safeString(item['type'] || ''),
        }));

        const sampleTables = layoutTables.slice(0, 20).map((table: any) => ({
            id: safeString(table?.id),
            name: safeString(table?.name),
            seats: toNonNegativeInt(table?.seats),
            status: safeString(table?.status, 'available'),
        }));

        const sampleInventory = inventoryItems.slice(0, 12).map((item) => ({
            id: safeString(item.id),
            name: safeString(item['name']),
            quantity: toNumber(item['quantity'], 0),
            reorderLevel: toNumber(item['reorderLevel'], 0),
            unit: safeString(item['unit'], ''),
            supplier: safeString(item['supplier'], ''),
        }));

        const response = {
            restaurant: {
                id: restaurantId,
                name: String((restaurant as any).name || restaurantId),
                subscriptionTier: String((restaurant as any).subscription_tier || 'starter'),
                subscriptionStatus: String((restaurant as any).subscription_status || 'active'),
                subscriptionEndDate: (restaurant as any).subscription_end_date || null,
            },
            metrics: {
                orderCounts: {
                    active: activeOrderCount,
                    new: newSnap.size,
                    preparing: preparingSnap.size,
                    done: doneSnap.size,
                    paid: paidSnap.size,
                    cancelled: cancelledSnap.size,
                },
                menu: {
                    totalItems: menuSnap.size,
                    unavailableItems: unavailableCount,
                    categories: categoriesSnap.size,
                },
                tables: {
                    total: layoutTables.length,
                    busy: layoutTables.filter((t: any) => t?.status === 'busy').length,
                    available: layoutTables.filter((t: any) => t?.status === 'available').length,
                    reserved: layoutTables.filter((t: any) => t?.status === 'reserved').length,
                },
                inventory: {
                    totalItems: inventoryItems.length,
                    lowStockItems: lowInventoryCount,
                    criticalItems: criticalInventoryCount,
                },
                staff: {
                    total: staffMembers.length,
                    byRole: staffByRole,
                },
            },
            modules: {
                menu: {
                    totalItems: menuSnap.size,
                    unavailableItems: unavailableCount,
                    categories: categoriesSnap.size,
                    topCategories,
                    sampleItems: sampleMenuItems,
                },
                tables: {
                    total: layoutTables.length,
                    busy: layoutTables.filter((t: any) => t?.status === 'busy').length,
                    available: layoutTables.filter((t: any) => t?.status === 'available').length,
                    reserved: layoutTables.filter((t: any) => t?.status === 'reserved').length,
                    sample: sampleTables,
                },
                orders: {
                    counts: {
                        active: activeOrderCount,
                        new: newSnap.size,
                        preparing: preparingSnap.size,
                        done: doneSnap.size,
                        paid: paidSnap.size,
                        cancelled: cancelledSnap.size,
                    },
                    recent: recentOrders,
                },
                inventory: {
                    totalItems: inventoryItems.length,
                    lowStockItems: lowInventoryCount,
                    criticalItems: criticalInventoryCount,
                    sample: sampleInventory,
                },
                reports: {
                    latest: latestReport
                        ? {
                            reportDate: safeString((latestReport as any).report_date || ''),
                            revenue: toNumber((latestReport as any).total_revenue || (latestReport as any).revenue || 0, 0),
                            orders: toNonNegativeInt((latestReport as any).total_orders || 0),
                            averageOrderValue: toNumber((latestReport as any).average_order_value || 0, 0),
                        }
                        : null,
                },
                branding: {
                    primaryColor: safeString((branding as any).primaryColor || '#7c3aed'),
                    secondaryColor: safeString((branding as any).secondaryColor || '#ec4899'),
                    fontFamily: safeString((branding as any).fontFamily || ''),
                    hasLogo: Boolean((branding as any).logoUrl),
                    hasHeroImage: Boolean((branding as any).heroImage),
                    hasFeaturedImages: Array.isArray((branding as any).featuredImages) && (branding as any).featuredImages.length > 0,
                },
                staff: {
                    total: staffMembers.length,
                    byRole: staffByRole,
                    sample: staffMembers.slice(0, 8).map((member) => ({
                        uid: safeString(member.id),
                        name: safeString(member['name'] || member['displayName'] || ''),
                        role: safeString(member['role'] || 'staff'),
                        active: member['active'] !== false,
                    })),
                },
            },
            uiTips: {
                keyAreas: ['Live Orders', 'Order History', 'Menu Management', 'Tables & QR', 'Analytics', 'Inventory', 'Branding', 'Account Settings', 'Staff'],
            },
            usage: {
                tier: aiTier,
                used: aiUsed,
                limit: aiLimit,
                remaining: Math.max(0, aiLimit - aiUsed),
                isLimitReached: aiUsed >= aiLimit,
                resetsAt: getNextUtcMidnightIso(),
            },
            generatedAt: new Date().toISOString(),
        };

        return NextResponse.json(response);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to load support context';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
