import { NextRequest, NextResponse } from 'next/server';
import { adminFirestore } from '@/lib/firebase-admin';
import { authorizeTenantAccess } from '@/lib/server/authz/tenant';

type BrandingPayload = {
    primaryColor?: unknown;
    secondaryColor?: unknown;
    backgroundColor?: unknown;
    fontFamily?: unknown;
    logoUrl?: unknown;
    heroImageUrl?: unknown;
    heroOverlayOpacity?: unknown;
    heroHeadline?: unknown;
    heroTagline?: unknown;
    showHeroSection?: unknown;
    catalogHeadline?: unknown;
    featuredImages?: unknown;
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

function normalizePercent(value: unknown, fallback: number): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeText(value: unknown, max: number, fallback = ''): string {
    if (typeof value !== 'string') return fallback;
    const v = value.trim();
    if (!v) return fallback;
    return v.slice(0, max);
}

function normalizeBool(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') return value;
    return fallback;
}

function normalizeStringArray(value: unknown, maxItems: number, maxLen: number): string[] {
    if (!Array.isArray(value)) return [];
    const out: string[] = [];
    for (const v of value) {
        if (typeof v !== 'string') continue;
        const t = v.trim();
        if (!t) continue;
        out.push(t.slice(0, maxLen));
        if (out.length >= maxItems) break;
    }
    return out;
}

async function requireAuthorizedRestaurant(request: NextRequest, restaurantId: string): Promise<true | NextResponse> {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const authz = await authorizeTenantAccess(token, restaurantId, 'manage');
    if (!authz) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return true;
}

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
}

export async function GET(request: NextRequest) {
    try {
        const restaurantId = (request.nextUrl.searchParams.get('restaurantId') || '').trim();
        if (!restaurantId) {
            return NextResponse.json({ error: 'restaurantId is required' }, { status: 400 });
        }

        const auth = await requireAuthorizedRestaurant(request, restaurantId);
        if (auth instanceof NextResponse) return auth;

        const [brandingSnap, restaurantSnap] = await Promise.all([
            adminFirestore.doc(`branding/${restaurantId}`).get(),
            adminFirestore.doc(`restaurants/${restaurantId}`).get(),
        ]);

        if (!restaurantSnap.exists && !brandingSnap.exists) {
            return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
        }

        const brandingDoc = (brandingSnap.data() || {}) as Record<string, unknown>;
        const restaurant = (restaurantSnap.data() || {}) as Record<string, unknown>;
        const brandingNested = (restaurant.branding || {}) as Record<string, unknown>;
        const mergedBranding: Record<string, unknown> = {
            ...brandingNested,
            ...brandingDoc,
        };

        return NextResponse.json({
            primaryColor: normalizeHex(mergedBranding.primaryColor, '#3B82F6'),
            secondaryColor: normalizeHex(mergedBranding.secondaryColor, '#6366F1'),
            backgroundColor: normalizeHex(mergedBranding.backgroundColor, '#FDFCF8'),
            fontFamily: normalizeFont(mergedBranding.fontFamily),
            logoUrl: normalizeLogoUrl(mergedBranding.logoUrl || restaurant.logo_url || restaurant.logo),
            heroImageUrl: normalizeLogoUrl(mergedBranding.heroImageUrl),
            heroOverlayOpacity: normalizePercent(mergedBranding.heroOverlayOpacity, 60),
            heroHeadline: normalizeText(mergedBranding.heroHeadline, 120, 'Culinary Excellence'),
            heroTagline: normalizeText(mergedBranding.heroTagline, 220, 'Discover our exquisite menu crafted by world-class chefs'),
            showHeroSection: normalizeBool(mergedBranding.showHeroSection, true),
            catalogHeadline: normalizeText(mergedBranding.catalogHeadline, 80, ''),
            featuredImages: normalizeStringArray(mergedBranding.featuredImages, 8, 500),
        });
    } catch (error: unknown) {
        return NextResponse.json({ error: errorMessage(error, 'Failed to load branding') }, { status: 500 });
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
        const backgroundColor = normalizeHex(body.backgroundColor, '#FDFCF8');
        const fontFamily = normalizeFont(body.fontFamily);
        const logoUrl = normalizeLogoUrl(body.logoUrl);
        const heroImageUrl = normalizeLogoUrl(body.heroImageUrl);
        const heroOverlayOpacity = normalizePercent(body.heroOverlayOpacity, 60);
        const heroHeadline = normalizeText(body.heroHeadline, 120, 'Culinary Excellence');
        const heroTagline = normalizeText(body.heroTagline, 220, 'Discover our exquisite menu crafted by world-class chefs');
        const showHeroSection = normalizeBool(body.showHeroSection, true);
        const catalogHeadline = normalizeText(body.catalogHeadline, 80, '');
        const featuredImages = normalizeStringArray(body.featuredImages, 8, 500);
        const updatedAt = new Date().toISOString();

        const brandingPayload = {
            primaryColor,
            secondaryColor,
            backgroundColor,
            fontFamily,
            logoUrl,
            heroImageUrl,
            heroOverlayOpacity,
            heroHeadline,
            heroTagline,
            showHeroSection,
            catalogHeadline,
            featuredImages,
            updated_at: updatedAt,
        };

        await adminFirestore.doc(`restaurants/${restaurantId}`).set({
            branding: brandingPayload,
            logo_url: logoUrl || null,
            updated_at: updatedAt,
        }, { merge: true });

        await adminFirestore.doc(`branding/${restaurantId}`).set({
            ...brandingPayload,
            restaurantId,
        }, { merge: true });

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        return NextResponse.json({ error: errorMessage(error, 'Failed to save branding') }, { status: 500 });
    }
}
