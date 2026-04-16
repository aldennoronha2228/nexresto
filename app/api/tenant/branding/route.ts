import { NextRequest, NextResponse } from 'next/server';
import { adminFirestore } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

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

function normalizeUrl(value: unknown): string {
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

function normalizeText(value: unknown, max: number, fallback: string): string {
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

export async function GET(request: NextRequest) {
    try {
        const restaurantId = (request.nextUrl.searchParams.get('restaurantId') || '').trim();
        if (!restaurantId) {
            return NextResponse.json({ error: 'restaurantId is required' }, { status: 400 });
        }

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

        // Prefer dedicated branding collection values; fall back to restaurant.branding.
        const mergedBranding: Record<string, unknown> = {
            ...brandingNested,
            ...brandingDoc,
        };

        const brandingUpdatedAt =
            String(brandingDoc.updated_at || brandingNested.updated_at || restaurant.updated_at || Date.now());

        return NextResponse.json({
            primaryColor: normalizeHex(mergedBranding.primaryColor, '#1B4332'),
            secondaryColor: normalizeHex(mergedBranding.secondaryColor, '#D4AF37'),
            backgroundColor: normalizeHex(mergedBranding.backgroundColor, '#FDFCF8'),
            fontFamily: normalizeFont(mergedBranding.fontFamily),
            logoUrl: normalizeUrl(mergedBranding.logoUrl || restaurant.logo_url || restaurant.logo),
            heroImageUrl: normalizeUrl(mergedBranding.heroImageUrl),
            heroOverlayOpacity: normalizePercent(mergedBranding.heroOverlayOpacity, 60),
            heroHeadline: normalizeText(mergedBranding.heroHeadline, 120, 'Culinary Excellence'),
            heroTagline: normalizeText(mergedBranding.heroTagline, 220, 'Discover our exquisite menu crafted by world-class chefs'),
            showHeroSection: normalizeBool(mergedBranding.showHeroSection, true),
            catalogHeadline: normalizeText(mergedBranding.catalogHeadline, 80, ''),
            featuredImages: normalizeStringArray(mergedBranding.featuredImages, 8, 500),
            brandingVersion: brandingUpdatedAt,
        }, {
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            },
        });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Failed to load tenant branding' }, { status: 500 });
    }
}
