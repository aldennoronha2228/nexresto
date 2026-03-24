import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminFirestore } from '@/lib/firebase-admin';

type InventoryStatus = 'good' | 'low' | 'critical';

type InventoryRecord = {
    name: string;
    quantity: number;
    unit: string;
    reorderLevel: number;
    costPerUnit: number;
    supplier: string;
    status: InventoryStatus;
    createdAt: string;
    updatedAt: string;
};

function toStatus(quantity: number, reorderLevel: number): InventoryStatus {
    if (quantity <= Math.max(0, reorderLevel * 0.5)) return 'critical';
    if (quantity <= reorderLevel) return 'low';
    return 'good';
}

function toNumber(value: unknown, fallback = 0): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
    return fallback;
}

function sanitizeText(value: unknown, fallback = ''): string {
    return String(value ?? fallback).trim();
}

async function authorize(request: NextRequest, restaurantId: string) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }

    const idToken = authHeader.replace('Bearer ', '');
    const decoded = await adminAuth.verifyIdToken(idToken);
    const user = await adminAuth.getUser(decoded.uid);
    const claims = user.customClaims || {};

    const role = String(claims.role || '');
    const claimRestaurantId = String(claims.restaurant_id || claims.tenant_id || '');
    const isSuperAdmin = role === 'super_admin';
    const hasTenantAccess = isSuperAdmin || claimRestaurantId === restaurantId;

    if (!hasTenantAccess) {
        return { error: NextResponse.json({ error: 'Access denied' }, { status: 403 }) };
    }

    return {
        decoded,
        role,
        canManage: isSuperAdmin || role === 'owner' || role === 'admin',
    };
}

function parseRestaurantId(request: NextRequest): string {
    return sanitizeText(new URL(request.url).searchParams.get('restaurantId'));
}

export async function GET(request: NextRequest) {
    const restaurantId = parseRestaurantId(request);
    if (!restaurantId) {
        return NextResponse.json({ error: 'restaurantId required' }, { status: 400 });
    }

    try {
        const authz = await authorize(request, restaurantId);
        if ('error' in authz) return authz.error;

        const snap = await adminFirestore
            .collection(`restaurants/${restaurantId}/inventory_items`)
            .orderBy('name')
            .get();

        const items = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        return NextResponse.json({ items });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Failed to fetch inventory' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const restaurantId = sanitizeText(body?.restaurantId);
        if (!restaurantId) {
            return NextResponse.json({ error: 'restaurantId required' }, { status: 400 });
        }

        const authz = await authorize(request, restaurantId);
        if ('error' in authz) return authz.error;
        if (!authz.canManage) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const name = sanitizeText(body?.item?.name);
        const supplier = sanitizeText(body?.item?.supplier);
        const unit = sanitizeText(body?.item?.unit || 'pcs');
        const quantity = Math.max(0, toNumber(body?.item?.quantity, 0));
        const reorderLevel = Math.max(0, toNumber(body?.item?.reorderLevel, 0));
        const costPerUnit = Math.max(0, toNumber(body?.item?.costPerUnit, 0));

        if (!name) {
            return NextResponse.json({ error: 'Item name is required' }, { status: 400 });
        }

        const now = new Date().toISOString();
        const payload: InventoryRecord = {
            name,
            supplier,
            unit,
            quantity,
            reorderLevel,
            costPerUnit,
            status: toStatus(quantity, reorderLevel),
            createdAt: now,
            updatedAt: now,
        };

        const ref = await adminFirestore
            .collection(`restaurants/${restaurantId}/inventory_items`)
            .add(payload);

        return NextResponse.json({ item: { id: ref.id, ...payload } });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Failed to create item' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const restaurantId = sanitizeText(body?.restaurantId);
        const itemId = sanitizeText(body?.itemId);
        if (!restaurantId || !itemId) {
            return NextResponse.json({ error: 'restaurantId and itemId required' }, { status: 400 });
        }

        const authz = await authorize(request, restaurantId);
        if ('error' in authz) return authz.error;
        if (!authz.canManage) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const name = sanitizeText(body?.item?.name);
        const supplier = sanitizeText(body?.item?.supplier);
        const unit = sanitizeText(body?.item?.unit || 'pcs');
        const quantity = Math.max(0, toNumber(body?.item?.quantity, 0));
        const reorderLevel = Math.max(0, toNumber(body?.item?.reorderLevel, 0));
        const costPerUnit = Math.max(0, toNumber(body?.item?.costPerUnit, 0));

        if (!name) {
            return NextResponse.json({ error: 'Item name is required' }, { status: 400 });
        }

        const payload = {
            name,
            supplier,
            unit,
            quantity,
            reorderLevel,
            costPerUnit,
            status: toStatus(quantity, reorderLevel),
            updatedAt: new Date().toISOString(),
        };

        const ref = adminFirestore.doc(`restaurants/${restaurantId}/inventory_items/${itemId}`);
        await ref.set(payload, { merge: true });

        const snap = await ref.get();
        return NextResponse.json({ item: { id: snap.id, ...snap.data() } });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Failed to update item' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    const restaurantId = parseRestaurantId(request);
    const itemId = sanitizeText(new URL(request.url).searchParams.get('itemId'));

    if (!restaurantId || !itemId) {
        return NextResponse.json({ error: 'restaurantId and itemId required' }, { status: 400 });
    }

    try {
        const authz = await authorize(request, restaurantId);
        if ('error' in authz) return authz.error;
        if (!authz.canManage) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        await adminFirestore.doc(`restaurants/${restaurantId}/inventory_items/${itemId}`).delete();
        return NextResponse.json({ ok: true });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Failed to delete item' }, { status: 500 });
    }
}
