import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import { adminFirestore, isFirebaseAdminAvailable } from '@/lib/firebase-admin';
import { buildAbsoluteUrl, normalizeCanonicalPath } from '@/lib/seo/url';

type UnknownRecord = Record<string, unknown>;

export type TenantSeoData = {
    storeId: string;
    name: string;
    description: string;
    keywords: string[];
    cuisines: string[];
    logoUrl: string;
    heroImageUrl: string;
    ogImageUrl: string;
    phone: string;
    email: string;
    isPublic: boolean;
    hasMenu: boolean;
    lastModified: Date;
};

export type TenantSeoMetadataOptions = {
    storeId: string;
    tenant: TenantSeoData | null;
    canonicalPath: string;
    pageLabel: string;
    description: string;
    indexableWhenReady?: boolean;
};

const SAFE_FALLBACK_DESCRIPTION = 'NexResto powers digital menus for restaurants and hotels.';
const FALLBACK_KEYWORDS = ['restaurant menu', 'digital menu', 'hotel dining', 'nexresto'];
const DEFAULT_OG_IMAGE = '/icon-192.png?v=20260412c';
const TENANT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/i;

function asString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function asBoolean(value: unknown, fallback = false): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((entry) => asString(entry))
        .filter(Boolean);
}

function sanitizeUrl(value: unknown): string {
    const raw = asString(value);
    if (!raw) return '';
    try {
        const parsed = new URL(raw);
        if (!/^https?:$/i.test(parsed.protocol)) return '';
        return parsed.toString();
    } catch {
        return '';
    }
}

function toDate(value: unknown): Date | null {
    if (!value) return null;

    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    if (typeof value === 'object' && value !== null) {
        const candidate = value as { toDate?: () => Date };
        if (typeof candidate.toDate === 'function') {
            const parsed = candidate.toDate();
            if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) return parsed;
        }
    }

    return null;
}

function normalizeStoreId(raw: string): string {
    const value = asString(raw);
    if (!value || !TENANT_ID_PATTERN.test(value)) return '';
    return value.toLowerCase();
}

function resolveCuisines(restaurant: UnknownRecord): string[] {
    const candidates: string[] = [
        ...asStringArray(restaurant.cuisines),
        ...asStringArray(restaurant.cuisine_types),
        ...asStringArray(restaurant.tags),
        asString(restaurant.cuisine),
    ];
    return Array.from(new Set(candidates.map((entry) => entry.trim()).filter(Boolean))).slice(0, 8);
}

function resolveDescription(storeId: string, restaurant: UnknownRecord, branding: UnknownRecord): string {
    const descriptionCandidates = [
        asString(restaurant.description),
        asString(branding.heroTagline),
        asString(branding.catalogHeadline),
        asString(restaurant.short_description),
    ].filter(Boolean);

    if (descriptionCandidates.length > 0) {
        return descriptionCandidates[0].slice(0, 160);
    }

    return `Explore ${storeId} menu and place orders online with NexResto.`;
}

function resolveKeywords(name: string, cuisines: string[]): string[] {
    const tokens = [
        name,
        ...cuisines,
        'restaurant menu',
        'online ordering',
        'hotel dining',
        'nexresto',
    ].map((entry) => entry.trim().toLowerCase()).filter(Boolean);
    return Array.from(new Set(tokens)).slice(0, 12);
}

function isPublicTenant(settingDoc: UnknownRecord, restaurant: UnknownRecord): boolean {
    if ('value' in settingDoc) {
        return asBoolean(settingDoc.value, true);
    }
    return !asBoolean(restaurant.account_temporarily_disabled, false);
}

async function loadTenantSeoData(storeId: string): Promise<TenantSeoData | null> {
    if (!isFirebaseAdminAvailable()) return null;

    const safeStoreId = normalizeStoreId(storeId);
    if (!safeStoreId) return null;

    const [restaurantSnap, brandingSnap, publicSettingSnap, menuItemsSnap] = await Promise.all([
        adminFirestore.doc(`restaurants/${safeStoreId}`).get(),
        adminFirestore.doc(`branding/${safeStoreId}`).get(),
        adminFirestore.doc(`restaurants/${safeStoreId}/settings/is_site_public`).get(),
        adminFirestore.collection(`restaurants/${safeStoreId}/menu_items`).limit(1).get(),
    ]);

    if (!restaurantSnap.exists) return null;

    const restaurant = (restaurantSnap.data() || {}) as UnknownRecord;
    const brandingDoc = (brandingSnap.data() || {}) as UnknownRecord;
    const nestedBranding = ((restaurant.branding || {}) as UnknownRecord);
    const branding: UnknownRecord = {
        ...nestedBranding,
        ...brandingDoc,
    };
    const publicSetting = (publicSettingSnap.data() || {}) as UnknownRecord;

    const name = asString(restaurant.name) || safeStoreId;
    const cuisines = resolveCuisines(restaurant);
    const description = resolveDescription(safeStoreId, restaurant, branding);
    const logoUrl = sanitizeUrl(branding.logoUrl || restaurant.logo_url || restaurant.logo);
    const heroImageUrl = sanitizeUrl(branding.heroImageUrl || restaurant.hero_image_url || restaurant.heroImageUrl);
    const ogImageUrl = heroImageUrl || logoUrl || buildAbsoluteUrl(DEFAULT_OG_IMAGE);
    const phone = asString(restaurant.phone || restaurant.phone_number || restaurant.contact_phone);
    const email = asString(restaurant.contact_email || restaurant.owner_email);
    const keywords = resolveKeywords(name, cuisines);
    const lastModified = toDate(restaurant.updated_at) || toDate(branding.updated_at) || toDate(restaurant.created_at) || new Date();

    return {
        storeId: safeStoreId,
        name,
        description,
        keywords,
        cuisines,
        logoUrl,
        heroImageUrl,
        ogImageUrl,
        phone,
        email,
        isPublic: isPublicTenant(publicSetting, restaurant),
        hasMenu: !menuItemsSnap.empty,
        lastModified,
    };
}

const getTenantSeoDataCached = unstable_cache(
    async (storeId: string) => loadTenantSeoData(storeId),
    ['tenant-seo-data-v1'],
    { revalidate: 300, tags: ['seo', 'tenant-seo'] }
);

export async function getTenantSeoData(storeId: string): Promise<TenantSeoData | null> {
    return getTenantSeoDataCached(storeId);
}

export function buildFallbackMetadata(pathname: string, title = 'NexResto'): Metadata {
    const canonicalPath = normalizeCanonicalPath(pathname);
    const canonicalUrl = buildAbsoluteUrl(canonicalPath);
    const imageUrl = buildAbsoluteUrl(DEFAULT_OG_IMAGE);
    return {
        title,
        description: SAFE_FALLBACK_DESCRIPTION,
        keywords: FALLBACK_KEYWORDS,
        alternates: {
            canonical: canonicalUrl,
        },
        openGraph: {
            type: 'website',
            title,
            description: SAFE_FALLBACK_DESCRIPTION,
            url: canonicalUrl,
            siteName: 'NexResto',
            images: [{ url: imageUrl, width: 1200, height: 630, alt: 'NexResto' }],
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description: SAFE_FALLBACK_DESCRIPTION,
            images: [imageUrl],
        },
        robots: {
            index: false,
            follow: false,
        },
    };
}

export function buildTenantMetadata(options: TenantSeoMetadataOptions): Metadata {
    const {
        tenant,
        canonicalPath,
        pageLabel,
        description,
        indexableWhenReady = true,
    } = options;

    if (!tenant) {
        return buildFallbackMetadata(canonicalPath, `NexResto | ${pageLabel}`);
    }

    const canonical = normalizeCanonicalPath(canonicalPath);
    const canonicalUrl = buildAbsoluteUrl(canonical);
    const title = `${tenant.name} ${pageLabel} | NexResto`;
    const summary = description || tenant.description || SAFE_FALLBACK_DESCRIPTION;
    const ogImage = tenant.ogImageUrl || buildAbsoluteUrl(DEFAULT_OG_IMAGE);
    const canIndex = Boolean(indexableWhenReady && tenant.isPublic && tenant.hasMenu);

    return {
        title,
        description: summary,
        keywords: tenant.keywords,
        alternates: {
            canonical: canonicalUrl,
        },
        openGraph: {
            type: 'website',
            title,
            description: summary,
            url: canonicalUrl,
            siteName: 'NexResto',
            images: [{ url: ogImage, width: 1200, height: 630, alt: `${tenant.name} menu` }],
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description: summary,
            images: [ogImage],
        },
        robots: canIndex
            ? { index: true, follow: true }
            : { index: false, follow: false },
    };
}

export function buildWebSiteJsonLd(tenant: TenantSeoData): UnknownRecord {
    return {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: `${tenant.name} Online Menu`,
        url: buildAbsoluteUrl(`/${tenant.storeId}`),
        description: tenant.description,
        publisher: {
            '@type': 'Organization',
            name: tenant.name,
            logo: tenant.logoUrl || tenant.ogImageUrl,
        },
        inLanguage: 'en',
    };
}

export function buildRestaurantJsonLd(tenant: TenantSeoData): UnknownRecord {
    const payload: UnknownRecord = {
        '@context': 'https://schema.org',
        '@type': 'Restaurant',
        name: tenant.name,
        url: buildAbsoluteUrl(`/${tenant.storeId}`),
        menu: buildAbsoluteUrl(`/${tenant.storeId}/menu`),
        image: [tenant.ogImageUrl],
        servesCuisine: tenant.cuisines,
    };

    if (tenant.logoUrl) payload.logo = tenant.logoUrl;
    if (tenant.phone) payload.telephone = tenant.phone;
    if (tenant.email) payload.email = tenant.email;

    return payload;
}

export function buildMenuJsonLd(tenant: TenantSeoData): UnknownRecord {
    return {
        '@context': 'https://schema.org',
        '@type': 'Menu',
        name: `${tenant.name} Menu`,
        url: buildAbsoluteUrl(`/${tenant.storeId}/menu`),
        inLanguage: 'en',
        description: tenant.description,
        provider: {
            '@type': 'Restaurant',
            name: tenant.name,
            url: buildAbsoluteUrl(`/${tenant.storeId}`),
        },
    };
}

export function buildBreadcrumbJsonLd(items: Array<{ name: string; path: string }>): UnknownRecord {
    return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: items.map((item, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: item.name,
            item: buildAbsoluteUrl(item.path),
        })),
    };
}

type TenantSitemapEntry = {
    storeId: string;
    lastModified: Date;
};

const listPublicTenantEntriesCached = unstable_cache(
    async (): Promise<TenantSitemapEntry[]> => {
        if (!isFirebaseAdminAvailable()) return [];
        try {
            const restaurantsSnap = await adminFirestore.collection('restaurants').get();
            if (restaurantsSnap.empty) return [];

            const entries = await Promise.all(restaurantsSnap.docs.map(async (restaurantDoc) => {
                const storeId = normalizeStoreId(restaurantDoc.id);
                if (!storeId) return null;

                const restaurant = (restaurantDoc.data() || {}) as UnknownRecord;
                const [publicSettingSnap, menuSnap] = await Promise.all([
                    adminFirestore.doc(`restaurants/${storeId}/settings/is_site_public`).get(),
                    adminFirestore.collection(`restaurants/${storeId}/menu_items`).limit(1).get(),
                ]);

                if (menuSnap.empty) return null;
                const settingData = (publicSettingSnap.data() || {}) as UnknownRecord;
                if (!isPublicTenant(settingData, restaurant)) return null;

                const lastModified =
                    toDate(restaurant.updated_at) ||
                    toDate(restaurant.created_at) ||
                    new Date();

                return { storeId, lastModified };
            }));

            return entries
                .filter((entry): entry is TenantSitemapEntry => Boolean(entry))
                .sort((a, b) => a.storeId.localeCompare(b.storeId));
        } catch (error) {
            // Build should still succeed even if Firestore quota is temporarily exhausted.
            console.warn('[seo] listPublicTenantEntries fallback:', error);
            return [];
        }
    },
    ['tenant-public-sitemap-v1'],
    { revalidate: 900, tags: ['seo', 'sitemap'] }
);

export async function listPublicTenantEntries(): Promise<TenantSitemapEntry[]> {
    return listPublicTenantEntriesCached();
}
