import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminFirestore } from '@/lib/firebase-admin';

type Claims = {
    role?: string;
    restaurant_id?: string;
    tenant_id?: string;
};

type BrandingPayload = {
    primaryColor?: unknown;
    secondaryColor?: unknown;
    fontFamily?: unknown;
    logoUrl?: unknown;
};

function normalizeHex(value: unknown, fallback: string): string {
    if (typeof value !== 'string') return fallback;
    const v = value.trim();
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : fallback;
}

function normalizeFont(value: unknown): string {
    const allowed = new Set(['Inter', 'Playfair Display', 'Poppins', 'Roboto', 'Lora']);
    if (typeof value !== 'string') return 'Inter';
    const v = value.trim();
    return allowed.has(v) ? v : 'Inter';
}

function normalizeLogoUrl(value: unknown): string {
    if (typeof value !== 'string') return '';
    const v = value.trim();
    if (!v) return '';
    try {
        const u = new URL(v);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
        return v;
    } catch {
        return '';
    }
}

async function requireAuthorizedRestaurant(request: NextRequest, restaurantId: string): Promise<Claims | NextResponse> {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const decoded = await adminAuth.verifyIdToken(token);
    const user = await adminAuth.getUser(decoded.uid);
    const claims = (user.customClaims || {}) as Claims;

    const claimRestaurantId = String(claims.restaurant_id || claims.tenant_id || '');
    if (claims.role !== 'super_admin' && claimRestaurantId !== restaurantId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return claims;
}

export async function GET(request: NextRequest) {
    try {
        const restaurantId = (request.nextUrl.searchParams.get('restaurantId') || '').trim();
        if (!restaurantId) {
            return NextResponse.json({ error: 'restaurantId is required' }, { status: 400 });
        }

        const auth = await requireAuthorizedRestaurant(request, restaurantId);
        if (auth instanceof NextResponse) return auth;

        const snap = await adminFirestore.doc(`restaurants/${restaurantId}`).get();
        if (!snap.exists) {
            return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
        }

        const data = snap.data() || {};
        const branding = (data.branding || {}) as Record<string, unknown>;

        return NextResponse.json({
            primaryColor: normalizeHex(branding.primaryColor, '#3B82F6'),
            secondaryColor: normalizeHex(branding.secondaryColor, '#6366F1'),
            fontFamily: normalizeFont(branding.fontFamily),
            logoUrl: normalizeLogoUrl(branding.logoUrl || data.logo_url || data.logo),
        });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Failed to load branding' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as BrandingPayload & { restaurantId?: unknown };
        const restaurantId = typeof body.restaurantId === 'string' ? body.restaurantId.trim() : '';

        if (!restaurantId) {
            return NextResponse.json({ error: 'restaurantId is required' }, { status: 400 });
        }

        const auth = await requireAuthorizedRestaurant(request, restaurantId);
        if (auth instanceof NextResponse) return auth;

        const primaryColor = normalizeHex(body.primaryColor, '#3B82F6');
        const secondaryColor = normalizeHex(body.secondaryColor, '#6366F1');
        const fontFamily = normalizeFont(body.fontFamily);
        const logoUrl = normalizeLogoUrl(body.logoUrl);

        await adminFirestore.doc(`restaurants/${restaurantId}`).set({
            branding: {
                primaryColor,
                secondaryColor,
                fontFamily,
                logoUrl,
            },
            logo_url: logoUrl || null,
            updated_at: new Date().toISOString(),
        }, { merge: true });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Failed to save branding' }, { status: 500 });
    }
}
