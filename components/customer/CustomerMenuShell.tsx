'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { collection, getDocs, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useCart } from '@/context/CartContext';
import { db, tenantAuth, adminAuth } from '@/lib/firebase';
import { applyAvailabilityOverrides, seedAvailabilityMap } from '@/lib/menuAvailability';
import { getOptimizedHeroImageSrc, getOptimizedMenuItemImageSrc } from '@/lib/image-optimization';
import { getTenantCustomerStorageKey, getTenantTableStorageKey } from '@/lib/client/storage/tenantKeys';
import { isValidPhone, normalizePhone } from '@/lib/customer-tracking';
import { buildSplitBill } from '@/lib/split-bill';
import { toast } from 'sonner';
import type { CartItem } from '@/context/CartContext';
import { UpgradeCard } from './UpgradeCard';
import MenuCatalogLayout from './MenuCatalogLayout';
import { CartDrawer } from './CartDrawer';
import { MenuConcierge } from './MenuConcierge';

type FirestoreItem = {
    id: string;
    name: string;
    price: number;
    image_url?: string | null;
    available?: boolean;
    category_id?: string;
    category_name?: string;
    category?: string;
    type?: string;
};

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
    brandingVersion: string;
};

type MenuCatalogItem = {
    id: string;
    name: string;
    description: string;
    price: number;
    image: string;
    category: string;
    available: boolean;
    type?: 'veg' | 'non-veg';
};

type MenuCachePayload = {
    categories: string[];
    items: MenuCatalogItem[];
    updatedAt: number;
};

const DEFAULT_BRANDING: CustomerBranding = {
    primaryColor: '#3e54d3',
    secondaryColor: '#10b981',
    backgroundColor: '#131313',
    fontFamily: "'Manrope', 'Segoe UI', sans-serif",
    logoUrl: '',
    heroImageUrl: getOptimizedHeroImageSrc(''),
    heroOverlayOpacity: 60,
    heroHeadline: 'NexResto Customer Menu',
    heroTagline: 'Curated dishes for your table.',
    showHeroSection: true,
    catalogHeadline: '',
    featuredImages: [],
    brandingVersion: '',
};

function appendCacheBuster(url: string, version: string): string {
    const raw = String(url || '').trim();
    if (!raw || !version) return raw;

    try {
        const parsed = new URL(raw);
        parsed.searchParams.set('v', version);
        return parsed.toString();
    } catch {
        const joiner = raw.includes('?') ? '&' : '?';
        return `${raw}${joiner}v=${encodeURIComponent(version)}`;
    }
}

const MENU_CACHE_PREFIX = 'nexresto:customer-menu:';

function getMenuCacheKey(restaurantId: string): string {
    return `${MENU_CACHE_PREFIX}${restaurantId}`;
}

function readMenuCache(restaurantId: string): MenuCachePayload | null {
    try {
        const raw = localStorage.getItem(getMenuCacheKey(restaurantId));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<MenuCachePayload>;
        if (!Array.isArray(parsed.categories) || !Array.isArray(parsed.items)) return null;
        return {
            categories: parsed.categories.filter((v): v is string => typeof v === 'string' && v.trim().length > 0),
            items: parsed.items.filter((row): row is MenuCatalogItem => {
                if (!row || typeof row !== 'object') return false;
                const candidate = row as Partial<MenuCatalogItem>;
                return typeof candidate.id === 'string' && typeof candidate.name === 'string' && typeof candidate.price === 'number';
            }),
            updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
        };
    } catch {
        return null;
    }
}

function writeMenuCache(restaurantId: string, payload: Omit<MenuCachePayload, 'updatedAt'>): void {
    try {
        localStorage.setItem(
            getMenuCacheKey(restaurantId),
            JSON.stringify({
                ...payload,
                updatedAt: Date.now(),
            })
        );
    } catch {
        // Ignore cache write failures (private mode/quota).
    }
}

type CustomerMenuShellProps = {
    restaurantIdOverride?: string;
    tableIdOverride?: string;
    forceSharedTableContext?: boolean;
    tenantHomePath?: string;
    restaurantName?: string;
};

function normalizeBranding(raw: unknown): CustomerBranding {
    if (!raw || typeof raw !== 'object') return DEFAULT_BRANDING;
    const source = raw as Record<string, unknown>;

    return {
        ...DEFAULT_BRANDING,
        primaryColor: typeof source.primaryColor === 'string' ? source.primaryColor : DEFAULT_BRANDING.primaryColor,
        secondaryColor: typeof source.secondaryColor === 'string' ? source.secondaryColor : DEFAULT_BRANDING.secondaryColor,
        backgroundColor: typeof source.backgroundColor === 'string' ? source.backgroundColor : DEFAULT_BRANDING.backgroundColor,
        fontFamily: typeof source.fontFamily === 'string' ? source.fontFamily : DEFAULT_BRANDING.fontFamily,
        logoUrl: appendCacheBuster(
            typeof source.logoUrl === 'string' ? source.logoUrl : DEFAULT_BRANDING.logoUrl,
            typeof source.brandingVersion === 'string' ? source.brandingVersion : ''
        ),
        heroImageUrl: appendCacheBuster(
            getOptimizedHeroImageSrc(typeof source.heroImageUrl === 'string' ? source.heroImageUrl : ''),
            typeof source.brandingVersion === 'string' ? source.brandingVersion : ''
        ),
        heroOverlayOpacity: typeof source.heroOverlayOpacity === 'number' ? source.heroOverlayOpacity : DEFAULT_BRANDING.heroOverlayOpacity,
        heroHeadline: typeof source.heroHeadline === 'string' && source.heroHeadline ? source.heroHeadline : DEFAULT_BRANDING.heroHeadline,
        heroTagline: typeof source.heroTagline === 'string' && source.heroTagline ? source.heroTagline : DEFAULT_BRANDING.heroTagline,
        showHeroSection: typeof source.showHeroSection === 'boolean' ? source.showHeroSection : DEFAULT_BRANDING.showHeroSection,
        catalogHeadline: typeof source.catalogHeadline === 'string' ? source.catalogHeadline : DEFAULT_BRANDING.catalogHeadline,
        featuredImages: Array.isArray(source.featuredImages)
            ? source.featuredImages.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
            : [],
        brandingVersion: typeof source.brandingVersion === 'string' ? source.brandingVersion : '',
    };
}

async function refreshTokens() {
    const jobs: Promise<unknown>[] = [];
    if (tenantAuth.currentUser) jobs.push(tenantAuth.currentUser.getIdToken(true));
    if (adminAuth.currentUser) jobs.push(adminAuth.currentUser.getIdToken(true));
    if (jobs.length > 0) {
        await Promise.allSettled(jobs);
    }
}

function normalizeType(type: string | undefined): 'veg' | 'non-veg' | undefined {
    const t = String(type || '').toLowerCase();
    if (t === 'veg') return 'veg';
    if (t === 'non-veg' || t === 'nonveg') return 'non-veg';
    return undefined;
}

function getErrorCode(error: unknown): string {
    if (!error || typeof error !== 'object') return '';
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : '';
}

function formatRestaurantDisplayName(value: string): string {
    const raw = value.trim();
    if (!raw) return 'Restaurant';

    const withoutRandomSuffix = raw.replace(/-[a-z0-9]{6,}$/i, '');
    const readable = withoutRandomSuffix
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!readable) return 'Restaurant';

    return readable
        .split(' ')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}

export function CustomerMenuShell({ restaurantIdOverride, tableIdOverride, forceSharedTableContext = false, tenantHomePath, restaurantName }: CustomerMenuShellProps) {
    const [categories, setCategories] = React.useState<string[]>(['All']);
    const [menuItems, setMenuItems] = React.useState<MenuCatalogItem[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [branding, setBranding] = React.useState<CustomerBranding>(DEFAULT_BRANDING);
    const [capturedCustomer, setCapturedCustomer] = React.useState<{ name: string; phone: string } | null>(null);
    const [showCaptureModal, setShowCaptureModal] = React.useState(false);
    const [captureName, setCaptureName] = React.useState('');
    const [capturePhone, setCapturePhone] = React.useState('');
    const [savingCapture, setSavingCapture] = React.useState(false);
    const [captureError, setCaptureError] = React.useState<string | null>(null);

    const { cart, addToCart, updateQuantity, setIsCartOpen, totalItems, totalPrice } = useCart();
    const router = useRouter();
    const searchParams = useSearchParams();

    const queryTableId =
        tableIdOverride ||
        searchParams.get('table') ||
        searchParams.get('tableId') ||
        searchParams.get('table_id') ||
        searchParams.get('t') ||
        '';
    const sharedParam = String(searchParams.get('shared') || '').trim().toLowerCase();
    const restaurantFromQuery = searchParams.get('restaurant') ?? '';
    const restaurantId = (restaurantIdOverride || restaurantFromQuery || '').trim();
    const [resolvedTableId, setResolvedTableId] = React.useState('');
    const [sharedTableContext, setSharedTableContext] = React.useState(false);
    const [sharedOrderingAllowed, setSharedOrderingAllowed] = React.useState(true);
    const [featuresReady, setFeaturesReady] = React.useState(false);
    const [sharedCartItems, setSharedCartItems] = React.useState<CartItem[]>([]);
    const [paymentParticipants, setPaymentParticipants] = React.useState<Array<{ guestId: string; name: string }>>([]);
    const [paidGuestIds, setPaidGuestIds] = React.useState<string[]>([]);
    const [paymentSessionCompleted, setPaymentSessionCompleted] = React.useState(false);

    const sharedOrderingLocked = sharedTableContext && featuresReady && !sharedOrderingAllowed;
    const paymentLocked = sharedTableContext && paymentSessionCompleted;
    const effectiveOrderingLocked = sharedOrderingLocked || paymentLocked;
    const sharedModeActive = sharedTableContext && !effectiveOrderingLocked && restaurantId.length > 0 && resolvedTableId.length > 0;
    const tableKey = React.useMemo(() => resolvedTableId.trim().toLowerCase(), [resolvedTableId]);
    const sessionId = React.useMemo(() => {
        if (!restaurantId || !tableKey) return '';
        return `${restaurantId}::${tableKey}`;
    }, [restaurantId, tableKey]);

    const buildSharedCartUrl = React.useCallback(() => {
        const params = new URLSearchParams();
        params.set('restaurantId', restaurantId);
        params.set('tableId', resolvedTableId);
        return `/api/cart/shared?${params.toString()}`;
    }, [restaurantId, resolvedTableId]);

    const refreshSharedCart = React.useCallback(async () => {
        if (!sharedModeActive) {
            setSharedCartItems([]);
            return;
        }

        try {
            const res = await fetch(buildSharedCartUrl(), { cache: 'no-store' });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) return;

            const items: unknown[] = Array.isArray(payload?.items) ? payload.items : [];
            const normalized: CartItem[] = items
                .map((row: unknown) => {
                    const item = row as Partial<CartItem>;
                    return {
                        id: String(item.id || '').trim(),
                        name: String(item.name || '').trim(),
                        description: String(item.description || ''),
                        price: Number(item.price || 0),
                        image: String(item.image || ''),
                        category: String(item.category || 'Others') || 'Others',
                        quantity: Math.max(0, Math.floor(Number(item.quantity || 0))),
                        contributors: Array.isArray(item.contributors)
                            ? item.contributors
                                .map((c) => ({
                                    name: String(c?.name || '').trim(),
                                    phone: String(c?.phone || '').trim(),
                                    quantity: Math.max(0, Math.floor(Number(c?.quantity || 0))),
                                }))
                                .filter((c) => c.name && c.quantity > 0)
                            : [],
                    };
                })
                .filter((item) => item.id && item.name && Number.isFinite(item.price) && item.quantity > 0);

            setSharedCartItems(normalized);
        } catch {
            // Ignore transient cart sync failures.
        }
    }, [buildSharedCartUrl, sharedModeActive]);

    const mutateSharedCartItem = React.useCallback(async (item: {
        id: string;
        name: string;
        description?: string;
        category?: string;
        image?: string;
        price: number;
    }, quantity: number) => {
        if (!sharedModeActive) return;

        try {
            const res = await fetch('/api/cart/shared', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    restaurantId,
                    tableId: resolvedTableId,
                    item: {
                        id: item.id,
                        name: item.name,
                        description: item.description || '',
                        category: item.category || 'Others',
                        image: item.image || '',
                        price: item.price,
                    },
                    quantity,
                    actor: capturedCustomer
                        ? {
                            name: capturedCustomer.name,
                            phone: capturedCustomer.phone,
                        }
                        : undefined,
                }),
            });

            const payload = await res.json().catch(() => ({}));
            if (!res.ok) return;

            const items: unknown[] = Array.isArray(payload?.items) ? payload.items : [];
            const normalized: CartItem[] = items
                .map((row: unknown) => {
                    const entry = row as Partial<CartItem>;
                    return {
                        id: String(entry.id || '').trim(),
                        name: String(entry.name || '').trim(),
                        description: String(entry.description || ''),
                        price: Number(entry.price || 0),
                        image: String(entry.image || ''),
                        category: String(entry.category || 'Others') || 'Others',
                        quantity: Math.max(0, Math.floor(Number(entry.quantity || 0))),
                        contributors: Array.isArray(entry.contributors)
                            ? entry.contributors
                                .map((c) => ({
                                    name: String(c?.name || '').trim(),
                                    phone: String(c?.phone || '').trim(),
                                    quantity: Math.max(0, Math.floor(Number(c?.quantity || 0))),
                                }))
                                .filter((c) => c.name && c.quantity > 0)
                            : [],
                    };
                })
                .filter((entry) => entry.id && entry.name && Number.isFinite(entry.price) && entry.quantity > 0);

            setSharedCartItems(normalized);
        } catch {
            // Ignore transient cart sync failures.
        }
    }, [restaurantId, resolvedTableId, sharedModeActive, capturedCustomer]);

    React.useEffect(() => {
        if (!sharedModeActive) {
            setSharedCartItems([]);
            return;
        }

        let active = true;

        const tick = async () => {
            if (!active) return;
            await refreshSharedCart();
        };

        tick();
        const timer = window.setInterval(tick, 2000);

        return () => {
            active = false;
            window.clearInterval(timer);
        };
    }, [sharedModeActive, refreshSharedCart]);

    React.useEffect(() => {
        const normalized = queryTableId.trim();
        const sharedFromParam = sharedParam === '1' || sharedParam === 'true';
        const explicitNonShared = sharedParam === '0' || sharedParam === 'false';
        const inferredFromEligibleTableSession = normalized.length > 0 && !explicitNonShared && sharedOrderingAllowed;

        // Keep compatibility with older QR links by inferring shared mode for eligible paid plans.
        setSharedTableContext(forceSharedTableContext || sharedFromParam || inferredFromEligibleTableSession);

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

        setResolvedTableId((localStorage.getItem(getTenantTableStorageKey(restaurantId)) || '').trim());
    }, [forceSharedTableContext, queryTableId, restaurantId, sharedParam, sharedOrderingAllowed]);

    React.useEffect(() => {
        let active = true;

        const loadFeatures = async () => {
            if (!restaurantId) {
                if (active) {
                    setSharedOrderingAllowed(true);
                    setFeaturesReady(true);
                }
                return;
            }

            try {
                const response = await fetch(`/api/tenant/features?restaurantId=${encodeURIComponent(restaurantId)}`, {
                    cache: 'no-store',
                });
                const payload = await response.json().catch(() => ({}));

                if (!response.ok) {
                    throw new Error(String(payload?.error || 'Failed to load tenant features'));
                }

                if (!active) return;

                setSharedOrderingAllowed(Boolean(payload?.features?.shared_table_ordering));
                setFeaturesReady(true);
            } catch {
                if (!active) return;
                setSharedOrderingAllowed(true);
                setFeaturesReady(true);
            }
        };

        setFeaturesReady(false);
        loadFeatures();

        return () => {
            active = false;
        };
    }, [restaurantId]);

    React.useEffect(() => {
        if (!restaurantId) {
            setCapturedCustomer(null);
            setShowCaptureModal(false);
            return;
        }

        const raw = localStorage.getItem(getTenantCustomerStorageKey(restaurantId));
        if (!raw) {
            setCapturedCustomer(null);
            setShowCaptureModal(true);
            return;
        }

        try {
            const parsed = JSON.parse(raw) as { name?: string; phone?: string };
            const name = String(parsed.name || '').trim();
            const phone = normalizePhone(parsed.phone || '');

            if (name.length >= 2 && isValidPhone(phone)) {
                setCapturedCustomer({ name, phone });
                setCaptureName(name);
                setCapturePhone(phone);
                setShowCaptureModal(false);

                    fetch('/api/customers/capture', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            restaurantId,
                            name,
                            phone,
                            tableNumber: resolvedTableId || null,
                            incrementVisit: false,
                        }),
                    }).catch(() => { });
                return;
            }
        } catch {
            // Ignore broken local profile data.
        }

        setCapturedCustomer(null);
        setShowCaptureModal(true);
    }, [restaurantId, resolvedTableId]);

    React.useEffect(() => {
        let active = true;

        const loadBranding = async () => {
            if (!restaurantId) {
                if (active) setBranding(DEFAULT_BRANDING);
                return;
            }

            try {
                const res = await fetch(`/api/tenant/branding?restaurantId=${encodeURIComponent(restaurantId)}`, {
                    cache: 'no-store',
                });
                const payload = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(String(payload?.error || 'Failed branding load'));
                if (active) setBranding(normalizeBranding(payload));
            } catch {
                if (active) setBranding(DEFAULT_BRANDING);
            }
        };

        loadBranding();
        return () => {
            active = false;
        };
    }, [restaurantId]);

    React.useEffect(() => {
        let cancelled = false;

        const loadMenu = async () => {
            let hasHydratedFromCache = false;
            setError(null);

            if (!restaurantId) {
                setCategories(['All']);
                setMenuItems([]);
                setError('Missing restaurant context in URL.');
                setLoading(false);
                return;
            }

            const cached = readMenuCache(restaurantId);
            if (cached && cached.items.length > 0) {
                hasHydratedFromCache = true;
                const hydratedItems = applyAvailabilityOverrides(cached.items, restaurantId);
                setCategories(cached.categories.length > 0 ? cached.categories : ['All']);
                setMenuItems(hydratedItems);
                setLoading(false);
            } else {
                setLoading(true);
            }

            try {
                const catsQuery = query(collection(db, 'restaurants', restaurantId, 'categories'), orderBy('display_order'));
                const itemsQuery = query(collection(db, 'restaurants', restaurantId, 'menu_items'), orderBy('name'));

                let catsSnap;
                try {
                    catsSnap = await getDocs(catsQuery);
                } catch (err: unknown) {
                    if (getErrorCode(err).includes('permission-denied')) {
                        await refreshTokens();
                        catsSnap = await getDocs(catsQuery);
                    } else {
                        throw err;
                    }
                }

                let itemsSnap;
                try {
                    itemsSnap = await getDocs(itemsQuery);
                } catch (err: unknown) {
                    if (getErrorCode(err).includes('permission-denied')) {
                        await refreshTokens();
                        itemsSnap = await getDocs(itemsQuery);
                    } else {
                        throw err;
                    }
                }

                if (cancelled) return;

                const categoryMap = new Map<string, string>();
                const categoryNames: string[] = [];
                catsSnap.forEach((doc) => {
                    const row = doc.data() as Record<string, unknown>;
                    const name = String(row.name || '').trim();
                    if (name) {
                        categoryMap.set(doc.id, name);
                        categoryNames.push(name);
                    }
                });

                const normalizedCategorySet = new Set(categoryNames.map((c) => c.toLowerCase()));

                const rawItems: FirestoreItem[] = [];
                itemsSnap.forEach((doc) => rawItems.push({ id: doc.id, ...(doc.data() as Omit<FirestoreItem, 'id'>) }));

                const mapped = rawItems
                    .map((row) => {
                        const fromId = row.category_id ? categoryMap.get(row.category_id) : '';
                        const fromName = String(row.category_name || '').trim();
                        const fromLegacy = String(row.category || '').trim();

                        const resolvedCategory =
                            fromId ||
                            (normalizedCategorySet.has(fromName.toLowerCase()) ? fromName : '') ||
                            (normalizedCategorySet.has(fromLegacy.toLowerCase()) ? fromLegacy : '') ||
                            'Others';

                        return {
                            id: row.id,
                            name: String(row.name || 'Unnamed Item'),
                            description: String((row as Record<string, unknown>).description || ''),
                            price: Number(row.price || 0),
                            image: getOptimizedMenuItemImageSrc(row.image_url),
                            category: resolvedCategory,
                            available: row.available !== false,
                            type: normalizeType(row.type),
                        };
                    });

                seedAvailabilityMap(mapped.map((m) => ({ id: m.id, available: m.available })), restaurantId);
                const overridden = applyAvailabilityOverrides(mapped, restaurantId);

                writeMenuCache(restaurantId, {
                    categories: ['All', ...categoryNames],
                    items: overridden,
                });

                setCategories(['All', ...categoryNames]);
                setMenuItems(overridden);
            } catch {
                if (cancelled) return;
                if (!hasHydratedFromCache) {
                    setError('Could not load menu for this restaurant.');
                    setCategories(['All']);
                    setMenuItems([]);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        loadMenu();

        return () => {
            cancelled = true;
        };
    }, [restaurantId]);

    React.useEffect(() => {
        if (!restaurantId) return;

        const unsubscribe = onSnapshot(
            collection(db, 'restaurants', restaurantId, 'menu_items'),
            (snap) => {
                const updates = new Map<string, boolean>();
                snap.docChanges().forEach((change) => {
                    if (change.type === 'modified') {
                        const row = change.doc.data() as Record<string, unknown>;
                        updates.set(change.doc.id, row.available !== false);
                    }
                });

                if (updates.size === 0) return;

                setMenuItems((prev) =>
                    prev.map((item) => (updates.has(item.id) ? { ...item, available: Boolean(updates.get(item.id)) } : item))
                );
            },
            async (err) => {
                if (getErrorCode(err).includes('permission-denied')) {
                    await refreshTokens();
                }
            }
        );

        return () => unsubscribe();
    }, [restaurantId]);

    const buildCustomerUrl = (path: string): string => {
        const params = new URLSearchParams();
        if (resolvedTableId) params.set('table', resolvedTableId);
        if (restaurantId) params.set('restaurant', restaurantId);
        return `${path}${params.toString() ? `?${params.toString()}` : ''}`;
    };

    const displayRestaurantName = React.useMemo(() => {
        const source = (restaurantName || '').trim() || restaurantId;
        return formatRestaurantDisplayName(source);
    }, [restaurantName, restaurantId]);

    const handleCaptureSubmit = async () => {
        if (!restaurantId) {
            setCaptureError('Restaurant session not found. Please refresh this page.');
            return;
        }

        const name = captureName.trim();
        const phone = normalizePhone(capturePhone);

        if (name.length < 2) {
            setCaptureError('Please enter your name.');
            return;
        }

        if (!isValidPhone(phone)) {
            setCaptureError('Please enter a valid 10-digit phone number.');
            return;
        }

        setCaptureError(null);
        setSavingCapture(true);

        try {
            const response = await fetch('/api/customers/capture', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    restaurantId,
                    name,
                    phone,
                    tableNumber: resolvedTableId || null,
                    incrementVisit: true,
                }),
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload?.error || 'Unable to save your details right now.');
            }

            const stored = {
                name: String(payload?.name || name),
                phone: normalizePhone(String(payload?.phone || phone)),
            };

            setCapturedCustomer(stored);
            localStorage.setItem(getTenantCustomerStorageKey(restaurantId), JSON.stringify(stored));
            setShowCaptureModal(false);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unable to save your details. Please try again.';
            if (/insufficient|permission|missing/i.test(message)) {
                setCaptureError('Save is blocked by Firestore permissions. Please deploy latest rules or keep using server capture API.');
            } else {
                setCaptureError(message);
            }
        } finally {
            setSavingCapture(false);
        }
    };

    const requireCapture = () => {
        if (capturedCustomer) return true;
        setShowCaptureModal(true);
        return false;
    };

    const addMenuItemWithFeedback = (item: {
        id: string;
        name: string;
        description?: string;
        category?: string;
        image?: string;
        price: number;
        available?: boolean;
    }): boolean => {
        if (sharedOrderingLocked) {
            toast.error('Shared table ordering is locked for this restaurant plan.');
            return false;
        }

        if (!requireCapture()) return false;
        if (item.available === false) return false;

        if (sharedModeActive) {
            const next = (cartQuantityById.get(item.id) || 0) + 1;
            void mutateSharedCartItem(item, next);
            toast.success(`${item.name} added to cart`);
            return true;
        }

        addToCart({
            id: item.id,
            name: item.name,
            description: item.description || '',
            category: item.category || 'Others',
            image: item.image || '',
            price: item.price,
        });

        toast.success(`${item.name} added to cart`);
        return true;
    };

    const effectiveCart = sharedModeActive ? sharedCartItems : cart;
    const effectiveTotalItems = React.useMemo(
        () => effectiveCart.reduce((sum, item) => sum + item.quantity, 0),
        [effectiveCart]
    );
    const effectiveTotalPrice = React.useMemo(
        () => effectiveCart.reduce((sum, item) => sum + item.price * item.quantity, 0),
        [effectiveCart]
    );

    const cartQuantityById = React.useMemo(() => {
        const map = new Map<string, number>();
        effectiveCart.forEach((entry) => map.set(entry.id, entry.quantity));
        return map;
    }, [effectiveCart]);

    const incrementMenuItem = (item: {
        id: string;
        name: string;
        description?: string;
        category?: string;
        image?: string;
        price: number;
        available?: boolean;
    }) => {
        if (effectiveOrderingLocked) {
            toast.error('Shared table ordering is locked for this restaurant plan.');
            return;
        }

        if (!requireCapture()) return;
        if (item.available === false) return;

        if (sharedModeActive) {
            const next = (cartQuantityById.get(item.id) || 0) + 1;
            void mutateSharedCartItem(item, next);
            return;
        }

        addToCart({
            id: item.id,
            name: item.name,
            description: item.description || '',
            category: item.category || 'Others',
            image: item.image || '',
            price: item.price,
        });
    };

    const decrementMenuItem = (item: { id: string }) => {
        if (effectiveOrderingLocked) {
            toast.error('Shared table ordering is locked for this restaurant plan.');
            return;
        }

        if (!requireCapture()) return;
        const current = cartQuantityById.get(item.id) || 0;
        if (current <= 0) return;
        if (sharedModeActive) {
            const existing = effectiveCart.find((entry) => entry.id === item.id);
            if (!existing) return;
            void mutateSharedCartItem(
                {
                    id: existing.id,
                    name: existing.name,
                    description: existing.description,
                    category: existing.category,
                    image: existing.image,
                    price: existing.price,
                },
                current - 1
            );
            return;
        }
        updateQuantity(item.id, current - 1);
    };

    const handleSharedDrawerIncrease = (itemId: string, nextQuantity: number) => {
        const item = effectiveCart.find((entry) => entry.id === itemId);
        if (!item) return;
        void mutateSharedCartItem(item, nextQuantity);
    };

    const handleSharedDrawerDecrease = (itemId: string, nextQuantity: number) => {
        const item = effectiveCart.find((entry) => entry.id === itemId);
        if (!item) return;
        void mutateSharedCartItem(item, Math.max(0, nextQuantity));
    };

    const handleSharedDrawerRemove = (itemId: string) => {
        const item = effectiveCart.find((entry) => entry.id === itemId);
        if (!item) return;
        void mutateSharedCartItem(item, 0);
    };

    const currentGuestId = React.useMemo(() => {
        const name = String(capturedCustomer?.name || '').trim().toLowerCase();
        const phone = String(capturedCustomer?.phone || '').trim();
        if (!name) return '';
        return `${name}|${phone}`;
    }, [capturedCustomer]);

    const derivedParticipants = React.useMemo(() => {
        const split = buildSplitBill(effectiveCart);
        const map = new Map<string, { guestId: string; name: string }>();

        split.people.forEach((person) => {
            if (person.key === '__unassigned__') return;
            const guestId = String(person.key || '').toLowerCase();
            if (!guestId) return;
            map.set(guestId, {
                guestId,
                name: person.name || 'Guest',
            });
        });

        if (currentGuestId && !map.has(currentGuestId)) {
            map.set(currentGuestId, {
                guestId: currentGuestId,
                name: capturedCustomer?.name || 'You',
            });
        }

        return Array.from(map.values());
    }, [capturedCustomer?.name, currentGuestId, effectiveCart]);

    const refreshPaymentStatus = React.useCallback(async () => {
        if (!sessionId) {
            setPaymentParticipants([]);
            setPaidGuestIds([]);
            setPaymentSessionCompleted(false);
            return;
        }

        try {
            const response = await fetch(`/api/customer/payment/status?sessionId=${encodeURIComponent(sessionId)}`, {
                cache: 'no-store',
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) return;

            const participants = Array.isArray(payload?.participants)
                ? payload.participants
                    .map((entry: any) => ({
                        guestId: String(entry?.guestId || '').toLowerCase(),
                        name: String(entry?.name || 'Guest'),
                    }))
                    .filter((entry: { guestId: string; name: string }) => entry.guestId)
                : [];

            const paidIds = Array.isArray(payload?.payments)
                ? payload.payments.map((entry: unknown) => String(entry || '').toLowerCase()).filter(Boolean)
                : [];

            setPaymentParticipants(participants);
            setPaidGuestIds(paidIds);
            setPaymentSessionCompleted(Boolean(payload?.allPaid || payload?.isCompleted));
        } catch {
            // Ignore transient status fetch issues.
        }
    }, [sessionId]);

    React.useEffect(() => {
        if (!sessionId) {
            setPaymentParticipants([]);
            setPaidGuestIds([]);
            setPaymentSessionCompleted(false);
            return;
        }

        let active = true;
        const tick = async () => {
            if (!active) return;
            await refreshPaymentStatus();
        };

        void tick();
        const timer = window.setInterval(tick, 5000);

        return () => {
            active = false;
            window.clearInterval(timer);
        };
    }, [refreshPaymentStatus, sessionId]);

    React.useEffect(() => {
        if (paymentSessionCompleted) {
            toast.success('All payments completed');
        }
    }, [paymentSessionCompleted]);

    const participantsForUI = paymentParticipants.length > 0 ? paymentParticipants : derivedParticipants;

    return (
        <div className="min-h-screen">
            {sharedOrderingLocked ? (
                <div className="mx-auto max-w-6xl px-4 pt-4">
                    <UpgradeCard
                        title="Shared Table Session Not Available"
                        description="This QR session uses shared table ordering, which is available only on Pro and Growth plans."
                        ctaLabel="See Plans"
                        onUpgrade={() => router.push(tenantHomePath || '/pricing')}
                    />
                </div>
            ) : null}

            {error && (
                <div className="mx-auto max-w-6xl px-4 pt-4">
                    <div className="rounded border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
                </div>
            )}
            <MenuCatalogLayout
                branding={branding}
                categories={categories}
                items={menuItems}
                tableId={resolvedTableId}
                restaurantName={displayRestaurantName}
                totalItems={effectiveTotalItems}
                totalPrice={effectiveTotalPrice}
                loading={loading}
                onSelectCategory={() => {
                    // Filtering is handled in the layout component.
                }}
                onAddToCart={(item) => {
                    return addMenuItemWithFeedback(item);
                }}
                onIncrementItem={(item) => {
                    incrementMenuItem(item);
                }}
                onDecrementItem={(item) => {
                    decrementMenuItem(item);
                }}
                getItemQuantity={(itemId) => cartQuantityById.get(itemId) || 0}
                onOpenCart={() => {
                    if (effectiveOrderingLocked) {
                        toast.error('Shared table ordering is locked for this restaurant plan.');
                        return;
                    }
                    if (!requireCapture()) return;
                    setIsCartOpen(true);
                }}
                onOpenOrders={() => router.push(buildCustomerUrl('/customer/order-history'))}
            />
            {restaurantId ? (
                <MenuConcierge
                    restaurantId={restaurantId}
                    menuItems={menuItems}
                    onAddToCart={(item) => {
                        addMenuItemWithFeedback(item);
                    }}
                />
            ) : null}
            <CartDrawer
                tableId={resolvedTableId}
                restaurantId={restaurantId || undefined}
                sharedTableContext={sharedTableContext}
                sharedOrderingLocked={effectiveOrderingLocked}
                restaurantName={displayRestaurantName}
                sessionId={sessionId || undefined}
                currentGuestId={currentGuestId || undefined}
                currentGuestName={capturedCustomer?.name || undefined}
                participants={participantsForUI}
                payments={paidGuestIds}
                enableSplitBilling={sharedTableContext}
                paymentSessionCompleted={paymentSessionCompleted}
                onRefreshPaymentStatus={refreshPaymentStatus}
                onUpgrade={() => router.push(tenantHomePath || '/pricing')}
                externalCartItems={sharedModeActive ? effectiveCart : undefined}
                externalTotalPrice={sharedModeActive ? effectiveTotalPrice : undefined}
                onExternalIncrease={sharedModeActive ? handleSharedDrawerIncrease : undefined}
                onExternalDecrease={sharedModeActive ? handleSharedDrawerDecrease : undefined}
                onExternalRemove={sharedModeActive ? handleSharedDrawerRemove : undefined}
            />

            <AnimatePresence>
                {showCaptureModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-md"
                    >
                        <div className="flex min-h-full items-center justify-center px-4 py-6">
                            <motion.div
                                initial={{ opacity: 0, y: 24, scale: 0.96 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                                transition={{ duration: 0.28, ease: 'easeOut' }}
                                className="w-full max-w-md rounded-3xl border border-white/15 bg-white/10 p-6 shadow-[0_22px_70px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
                            >
                                <div className="mb-5">
                                    <p className="text-[11px] uppercase tracking-[0.22em] text-[#9ab8aa]">Welcome</p>
                                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Before You Continue</h2>
                                    <p className="mt-2 text-sm text-[#d4d7d5]">Share your name and phone so we can place and track your order.</p>
                                </div>

                                <div className="space-y-3">
                                    <div>
                                        <label className="mb-1 block text-xs uppercase tracking-[0.16em] text-[#a9adab]">Name</label>
                                        <input
                                            value={captureName}
                                            onChange={(e) => setCaptureName(e.target.value)}
                                            placeholder="Your name"
                                            className="w-full rounded-2xl border border-white/15 bg-black/25 px-4 py-3 text-sm text-white outline-none transition focus:border-[#9cb7aa]"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs uppercase tracking-[0.16em] text-[#a9adab]">Phone Number</label>
                                        <input
                                            value={capturePhone}
                                            onChange={(e) => setCapturePhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                            inputMode="numeric"
                                            placeholder="10-digit mobile number"
                                            className="w-full rounded-2xl border border-white/15 bg-black/25 px-4 py-3 text-sm text-white outline-none transition focus:border-[#9cb7aa]"
                                        />
                                    </div>
                                </div>

                                {captureError ? (
                                    <p className="mt-3 text-sm text-rose-300">{captureError}</p>
                                ) : null}

                                <motion.button
                                    whileHover={{ scale: 1.01 }}
                                    whileTap={{ scale: 0.98 }}
                                    disabled={savingCapture}
                                    onClick={handleCaptureSubmit}
                                    className="mt-5 w-full rounded-2xl bg-gradient-to-r from-[#9cb7aa] to-[#88a99a] px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-[#12211b] transition disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {savingCapture ? 'Saving...' : 'Enter Menu'}
                                </motion.button>
                            </motion.div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
