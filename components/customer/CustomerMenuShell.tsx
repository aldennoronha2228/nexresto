'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useCart } from '@/context/CartContext';
import type { MenuItem as CartMenuItem } from '@/context/CartContext';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { db, tenantAuth, adminAuth } from '@/lib/firebase';
import { collection, query, orderBy, getDocs, onSnapshot } from 'firebase/firestore';
import { applyAvailabilityOverrides, seedAvailabilityMap } from '@/lib/menuAvailability';
import { getTenantTableStorageKey } from '@/lib/client/storage/tenantKeys';
import { getOptimizedHeroImageSrc, getOptimizedMenuItemImageSrc } from '@/lib/image-optimization';

const CartDrawer = dynamic(
    () => import('@/components/customer/CartDrawer').then((mod) => mod.CartDrawer),
    { ssr: false }
);

const GourmetCatalogLayout = dynamic(
    () => import('@/components/customer/GourmetCatalogLayout').then((mod) => mod.GourmetCatalogLayout),
    {
        ssr: false,
        loading: () => (
            <div className="mx-auto max-w-3xl px-4 py-10 text-center text-slate-500">Loading menu...</div>
        ),
    }
);

// Firestore item shape → CartMenuItem shape
interface FirestoreItem {
    id: string;
    name: string;
    price: number;
    image_url: string | null;
    available: boolean;
    category_id?: string;
    category_name?: string;
    category?: string;
    type?: 'veg' | 'non-veg' | string;
}

type CustomerBranding = {
    primaryColor: string;
    secondaryColor: string;
    backgroundColor: string;
    fontFamily: string;
    logoUrl: string;
    heroImageUrl: string;
    heroOverlayOpacity: number;
    heroHeadline: string;
    heroTagline: string;
    showHeroSection: boolean;
    catalogHeadline: string;
    featuredImages: string[];
};

const DEFAULT_BRANDING: CustomerBranding = {
    primaryColor: '#1B4332',
    secondaryColor: '#D4AF37',
    backgroundColor: '#FDFCF8',
    fontFamily: 'Inter',
    logoUrl: '',
    heroImageUrl: getOptimizedHeroImageSrc(''),
    heroOverlayOpacity: 60,
    heroHeadline: 'Culinary Excellence',
    heroTagline: 'Discover our exquisite menu crafted by world-class chefs',
    showHeroSection: true,
    catalogHeadline: '',
    featuredImages: [],
};

type CustomerMenuShellProps = {
    restaurantIdOverride?: string;
    tenantHomePath?: string;
    restaurantName?: string;
};

function normalizeBranding(raw: unknown): CustomerBranding {
    const source = (typeof raw === 'object' && raw !== null) ? (raw as Record<string, unknown>) : {};
    const overlay = Number(source.heroOverlayOpacity);
    const featuredImages = Array.isArray(source.featuredImages)
        ? source.featuredImages
            .filter((v: unknown) => typeof v === 'string')
            .map((v: string) => v.trim())
            .filter(Boolean)
        : [];

    return {
        primaryColor: typeof source.primaryColor === 'string' ? source.primaryColor : DEFAULT_BRANDING.primaryColor,
        secondaryColor: typeof source.secondaryColor === 'string' ? source.secondaryColor : DEFAULT_BRANDING.secondaryColor,
        backgroundColor: typeof source.backgroundColor === 'string' ? source.backgroundColor : DEFAULT_BRANDING.backgroundColor,
        fontFamily: typeof source.fontFamily === 'string' ? source.fontFamily : DEFAULT_BRANDING.fontFamily,
        logoUrl: typeof source.logoUrl === 'string' ? source.logoUrl : DEFAULT_BRANDING.logoUrl,
        heroImageUrl: getOptimizedHeroImageSrc(typeof source.heroImageUrl === 'string' ? source.heroImageUrl : ''),
        heroOverlayOpacity: Number.isFinite(overlay) ? Math.max(0, Math.min(100, overlay)) : DEFAULT_BRANDING.heroOverlayOpacity,
        heroHeadline: typeof source.heroHeadline === 'string' && source.heroHeadline ? source.heroHeadline : DEFAULT_BRANDING.heroHeadline,
        heroTagline: typeof source.heroTagline === 'string' && source.heroTagline ? source.heroTagline : DEFAULT_BRANDING.heroTagline,
        showHeroSection: typeof source.showHeroSection === 'boolean' ? source.showHeroSection : DEFAULT_BRANDING.showHeroSection,
        catalogHeadline: typeof source.catalogHeadline === 'string' ? source.catalogHeadline : DEFAULT_BRANDING.catalogHeadline,
        featuredImages,
    };
}

function getErrorCode(error: unknown): string {
    if (typeof error !== 'object' || error === null) return '';
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : '';
}

function toCartItem(
    f: FirestoreItem,
    categoryName: string
): CartMenuItem & { available: boolean; type?: 'veg' | 'non-veg' } {
    const normalizedType = String(f.type || '').toLowerCase();
    const type = normalizedType === 'non-veg' || normalizedType === 'nonveg'
        ? 'non-veg'
        : normalizedType === 'veg'
            ? 'veg'
            : undefined;

    return {
        id: f.id,
        name: f.name,
        description: '',
        price: f.price,
        image: getOptimizedMenuItemImageSrc(f.image_url),
        category: categoryName,
        available: f.available ?? true,
        type,
    };
}

function CustomerMenuContent({
    restaurantIdOverride,
    tenantHomePath,
    restaurantName,
}: CustomerMenuShellProps) {
    const [, setActiveCategory] = useState('All');
    const [menuItems, setMenuItems] = useState<(CartMenuItem & { available: boolean })[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [retryNonce, setRetryNonce] = useState(0);
    const { addToCart, setIsCartOpen, totalItems, totalPrice } = useCart();
    const router = useRouter();
    const searchParams = useSearchParams();
    const tableIdFromQuery =
        searchParams.get('table') ??
        searchParams.get('tableId') ??
        searchParams.get('table_id') ??
        searchParams.get('t') ??
        '';
    const [resolvedTableId, setResolvedTableId] = useState('');
    const restaurantIdFromQuery = searchParams.get('restaurant') ?? '';
    const restaurantId = (restaurantIdOverride || restaurantIdFromQuery || '').trim();
    const isPreviewMode = searchParams.get('preview') === '1';
    const [branding, setBranding] = useState<CustomerBranding>(DEFAULT_BRANDING);
    const [previewBranding, setPreviewBranding] = useState<CustomerBranding | null>(null);

    const buildCustomerUrl = (path: string) => {
        const params = new URLSearchParams();
        if (resolvedTableId) params.set('table', resolvedTableId);
        if (restaurantId) params.set('restaurant', restaurantId);
        const qs = params.toString();
        return `${path}${qs ? `?${qs}` : ''}`;
    };

    useEffect(() => {
        const normalized = (tableIdFromQuery || '').trim();
        if (normalized) {
            setResolvedTableId(normalized);
            if (restaurantId) {
                localStorage.setItem(getTenantTableStorageKey(restaurantId), normalized);
            }
            return;
        }

        if (!restaurantId) {
            setResolvedTableId('');
            return;
        }

        const remembered = (localStorage.getItem(getTenantTableStorageKey(restaurantId)) || '').trim();
        setResolvedTableId(remembered);
    }, [tableIdFromQuery, restaurantId]);

    const refreshTokens = async () => {
        const jobs: Promise<unknown>[] = [];
        if (tenantAuth.currentUser) jobs.push(tenantAuth.currentUser.getIdToken(true));
        if (adminAuth.currentUser) jobs.push(adminAuth.currentUser.getIdToken(true));
        if (jobs.length > 0) {
            await Promise.allSettled(jobs);
        }
    };

    useEffect(() => {
        let active = true;

        const loadBranding = async () => {
            if (!restaurantId) {
                if (active) setBranding(DEFAULT_BRANDING);
                return;
            }

            try {
                const res = await fetch(`/api/tenant/branding?restaurantId=${encodeURIComponent(restaurantId)}`);
                const payload = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(payload?.error || 'Failed to load branding');
                if (!active) return;
                setBranding(normalizeBranding(payload));
            } catch {
                if (active) setBranding(DEFAULT_BRANDING);
            }
        };

        loadBranding();
        return () => { active = false; };
    }, [restaurantId]);

    useEffect(() => {
        let active = true;

        const enforceAccess = async () => {
            if (!restaurantId) return;
            try {
                const res = await fetch(`/api/tenant/access?restaurantId=${encodeURIComponent(restaurantId)}`, {
                    cache: 'no-store',
                });
                if (!res.ok) return;
                const data = await res.json();
                if (active && data?.accountTemporarilyDisabled) {
                    router.replace('/maintenance');
                }
            } catch {
                // Keep customer page available if access check fails unexpectedly.
            }
        };

        enforceAccess();
        return () => { active = false; };
    }, [restaurantId, router]);

    useEffect(() => {
        if (!isPreviewMode) return;

        const handler = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            const message = event.data;
            if (!message || message.type !== 'NEXRESTO_BRANDING_PREVIEW') return;
            setPreviewBranding(normalizeBranding(message.payload || {}));
        };

        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, [isPreviewMode]);

    // Fetch tenant-scoped menu from Firestore. Fail closed on errors.
    useEffect(() => {
        let cancelled = false;
        const resolvedTenantId = restaurantId;

        async function loadMenu() {
            if (!cancelled) {
                setLoading(true);
                setFetchError(null);
            }

            try {
                if (!resolvedTenantId) {
                    if (!cancelled) {
                        setMenuItems([]);
                        setCategories(['All']);
                        setFetchError('Missing restaurant context. Please use a valid restaurant link.');
                        setLoading(false);
                    }
                    return;
                }

                const tenantId = resolvedTenantId;

                // 1. Fetch Categories
                const catsQuery = query(
                    collection(db, 'restaurants', tenantId, 'categories'),
                    orderBy('display_order')
                );
                let catsSnap;
                try {
                    catsSnap = await getDocs(catsQuery);
                } catch (err: unknown) {
                    const code = getErrorCode(err);
                    if (code.includes('permission-denied')) {
                        await refreshTokens();
                        catsSnap = await getDocs(catsQuery);
                    } else {
                        throw err;
                    }
                }
                const catMap = new Map<string, string>(); // category_id -> name
                const catNames: string[] = [];

                catsSnap.forEach(doc => {
                    const data = doc.data();
                    catMap.set(doc.id, data.name);
                    catNames.push(data.name);
                });

                // 2. Fetch Menu Items
                const itemsQuery = query(
                    collection(db, 'restaurants', tenantId, 'menu_items'),
                    orderBy('name')
                );
                let itemsSnap;
                try {
                    itemsSnap = await getDocs(itemsQuery);
                } catch (err: unknown) {
                    const code = getErrorCode(err);
                    if (code.includes('permission-denied')) {
                        await refreshTokens();
                        itemsSnap = await getDocs(itemsQuery);
                    } else {
                        throw err;
                    }
                }

                const items: FirestoreItem[] = [];
                itemsSnap.forEach(doc => {
                    items.push({ id: doc.id, ...(doc.data() as Omit<FirestoreItem, 'id'>) });
                });

                if (cancelled) return;

                const normalizedCatNames = new Set(catNames.map((c) => c.trim().toLowerCase()));

                const enriched = items.map((f: FirestoreItem) => {
                    const categoryFromId = f.category_id ? catMap.get(f.category_id) : '';
                    const categoryFromName = String(f.category_name || '').trim();
                    const categoryFromLegacy = String(f.category || '').trim();

                    // Only map items to categories that exist for this tenant.
                    const categoryName = (
                        categoryFromId ||
                        (normalizedCatNames.has(categoryFromName.toLowerCase()) ? categoryFromName : '') ||
                        (normalizedCatNames.has(categoryFromLegacy.toLowerCase()) ? categoryFromLegacy : '')
                    );
                    if (!categoryName) {
                        return null;
                    }
                    return toCartItem(f, categoryName);
                }).filter(Boolean) as (CartMenuItem & { available: boolean })[];

                // Seed localStorage so overrides are initialised from DB state
                seedAvailabilityMap(enriched.map(i => ({ id: i.id, available: i.available })), tenantId);
                // Apply any manual overrides saved by the dashboard
                setMenuItems(applyAvailabilityOverrides(enriched, tenantId));
                setCategories(['All', ...catNames]);
                setFetchError(null);
            } catch (err) {
                console.error('Failed to load menu from Firestore:', err);
                // Fail closed: do not show global/shared fallback menu data.
                if (cancelled) return;
                setMenuItems([]);
                setCategories(['All']);
                setFetchError('Could not load this restaurant menu. Please retry.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        loadMenu();
        return () => { cancelled = true; };
    }, [restaurantId, retryNonce]);

    // Subscribe to real-time availability changes
    useEffect(() => {
        const tenantId = restaurantId;
        if (!tenantId) return;

        const unsubscribe = onSnapshot(
            collection(db, 'restaurants', tenantId, 'menu_items'),
            (snapshot) => {
                let hasChanges = false;
                const updates = new Map();

                snapshot.docChanges().forEach(change => {
                    if (change.type === 'modified') {
                        hasChanges = true;
                        updates.set(change.doc.id, change.doc.data().available);
                    }
                });

                if (hasChanges) {
                    setMenuItems(prev =>
                        prev.map(item =>
                            updates.has(item.id)
                                ? { ...item, available: updates.get(item.id) }
                                : item
                        )
                    );

                    // Keep localStorage in sync with Firestore real-time changes
                    updates.forEach((available, id) => {
                        import('@/lib/menuAvailability').then(m =>
                            m.setItemAvailability(id, available, tenantId)
                        );
                    });
                }
            },
            async (error: unknown) => {
                const code = getErrorCode(error);
                if (code.includes('permission-denied')) {
                    await refreshTokens();
                    setRetryNonce((n) => n + 1);
                    return;
                }
                console.error('[CustomerMenu] snapshot error:', error);
                setFetchError('Live updates disconnected. Please retry.');
            }
        );

        return () => { unsubscribe(); };
    }, [restaurantId]);

    const effectiveBranding = previewBranding || branding;

    return (
        <div className="min-h-screen">
            {fetchError && (
                <div className="mx-auto max-w-6xl px-4 pt-4">
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        <div className="flex items-center gap-2">
                            <AlertCircle className="h-4 w-4" />
                            <span>{fetchError}</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setRetryNonce((n) => n + 1)}
                            className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
                        >
                            <RefreshCw className="h-3.5 w-3.5" /> Retry
                        </button>
                    </div>
                </div>
            )}
            <GourmetCatalogLayout
                branding={effectiveBranding}
                categories={categories}
                items={menuItems}
                tableId={resolvedTableId}
                restaurantName={restaurantName || restaurantId || 'Restaurant'}
                totalItems={totalItems}
                totalPrice={totalPrice}
                loading={loading}
                homeHref={tenantHomePath}
                onBack={() => {
                    if (tenantHomePath) {
                        router.push(tenantHomePath);
                        return;
                    }
                    router.back();
                }}
                onSearch={() => setIsCartOpen(true)}
                onSelectCategory={setActiveCategory}
                onAddToCart={(item) => {
                    if (item.available) addToCart(item);
                }}
                onOpenCart={() => setIsCartOpen(true)}
                onOpenOrders={() => router.push(buildCustomerUrl('/customer/order-history'))}
            />
            <CartDrawer tableId={resolvedTableId} restaurantId={restaurantId || undefined} />
        </div>
    );
}

export function CustomerMenuShell(props: CustomerMenuShellProps) {
    return <Suspense><CustomerMenuContent {...props} /></Suspense>;
}
