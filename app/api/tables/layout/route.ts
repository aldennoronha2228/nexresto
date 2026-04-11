import { NextRequest, NextResponse } from 'next/server';
import { adminFirestore } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { authorizeTenantAccess } from '@/lib/server/authz/tenant';

type LayoutPayload = {
    tables?: unknown[];
    walls?: unknown[];
    desks?: unknown[];
    floorPlans?: unknown[];
};

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
}

async function verifyRequest(request: NextRequest, restaurantId: string, level: 'read' | 'manage') {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error('Unauthorized');
    }

    const idToken = authHeader.replace('Bearer ', '');
    const authz = await authorizeTenantAccess(idToken, restaurantId, level);
    if (!authz) {
        throw new Error('Access denied');
    }

    return authz.uid;
}

export async function GET(request: NextRequest) {
    const restaurantId = new URL(request.url).searchParams.get('restaurantId')?.trim() || '';
    if (!restaurantId) {
        return NextResponse.json({ error: 'restaurantId is required' }, { status: 400 });
    }

    try {
        await verifyRequest(request, restaurantId, 'read');

        const layoutRef = adminFirestore.doc(`restaurants/${restaurantId}/settings/floor_layout`);
        const snapshot = await layoutRef.get();

        if (!snapshot.exists) {
            return NextResponse.json({ found: false, layout: null });
        }

        const data = snapshot.data() || {};
        return NextResponse.json({
            found: true,
            layout: {
                tables: Array.isArray(data.tables) ? data.tables : [],
                walls: Array.isArray(data.walls) ? data.walls : [],
                desks: Array.isArray(data.desks) ? data.desks : [],
                floorPlans: Array.isArray(data.floorPlans) ? data.floorPlans : [],
            },
        });
    } catch (error: unknown) {
        const message = errorMessage(error, 'Request failed');
        const status = message === 'Unauthorized' ? 401 : message === 'Access denied' ? 403 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as LayoutPayload & { restaurantId?: string };
        const restaurantId = String(body.restaurantId || '').trim();

        if (!restaurantId) {
            return NextResponse.json({ error: 'restaurantId is required' }, { status: 400 });
        }

        const updatedBy = await verifyRequest(request, restaurantId, 'manage');

        const hasTables = Object.prototype.hasOwnProperty.call(body, 'tables');
        const hasWalls = Object.prototype.hasOwnProperty.call(body, 'walls');
        const hasDesks = Object.prototype.hasOwnProperty.call(body, 'desks');
        const hasFloorPlans = Object.prototype.hasOwnProperty.call(body, 'floorPlans');

        if (!hasTables && !hasWalls && !hasDesks && !hasFloorPlans) {
            return NextResponse.json({ error: 'At least one layout field is required' }, { status: 400 });
        }

        const updatePayload: Record<string, unknown> = {
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy,
        };

        if (hasTables) {
            if (!Array.isArray(body.tables)) {
                return NextResponse.json({ error: 'tables must be an array' }, { status: 400 });
            }
            updatePayload.tables = body.tables;
        }

        if (hasWalls) {
            if (!Array.isArray(body.walls)) {
                return NextResponse.json({ error: 'walls must be an array' }, { status: 400 });
            }
            updatePayload.walls = body.walls;
        }

        if (hasDesks) {
            if (!Array.isArray(body.desks)) {
                return NextResponse.json({ error: 'desks must be an array' }, { status: 400 });
            }
            updatePayload.desks = body.desks;
        }

        if (hasFloorPlans) {
            if (!Array.isArray(body.floorPlans)) {
                return NextResponse.json({ error: 'floorPlans must be an array' }, { status: 400 });
            }
            updatePayload.floorPlans = body.floorPlans;
        }

        const layoutRef = adminFirestore.doc(`restaurants/${restaurantId}/settings/floor_layout`);
        await layoutRef.set(updatePayload, { merge: true });

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        const message = errorMessage(error, 'Request failed');
        const status = message === 'Unauthorized' ? 401 : message === 'Access denied' ? 403 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}