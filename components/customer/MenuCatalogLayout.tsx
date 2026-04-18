'use client';

import React from 'react';
import Image from 'next/image';
import { motion, type Variants } from 'motion/react';
import { Cinzel, Cormorant_Garamond, Manrope } from 'next/font/google';
import { BookOpen, ClipboardList, Search, ShoppingBag } from 'lucide-react';
import type { MenuItem as CartMenuItem } from '@/context/CartContext';

const cinzel = Cinzel({
    subsets: ['latin'],
    weight: ['600'],
});

const cormorant = Cormorant_Garamond({
    subsets: ['latin'],
    weight: ['600', '700'],
});

const manrope = Manrope({
    subsets: ['latin'],
    weight: ['400', '500', '600', '700'],
});

type Branding = {
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

type CatalogItem = CartMenuItem & { available: boolean; type?: 'veg' | 'non-veg' };

type GourmetCatalogLayoutProps = {
    branding: Branding;
    categories: string[];
    items: CatalogItem[];
    tableId: string;
    restaurantName: string;
    totalItems: number;
    totalPrice: number;
    loading: boolean;
    onSearch?: () => void;
    onSelectCategory: (category: string) => void;
    onAddToCart: (item: CatalogItem) => boolean | void;
    onIncrementItem: (item: CatalogItem) => void;
    onDecrementItem: (item: CatalogItem) => void;
    getItemQuantity: (itemId: string) => number;
    onOpenCart: () => void;
    onOpenOrders: () => void;
    itemsLocked?: boolean;
    lockMessage?: string;
};

function formatINR(value: number): string {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
    }).format(value);
}

function getCategoryLabel(category: string): string {
    if (category.toLowerCase().startsWith('imported from sheet')) {
        return 'Imported';
    }
    return category;
}

export function GourmetCatalogLayout({
    branding,
    categories,
    items,
    tableId,
    restaurantName,
    totalItems,
    totalPrice,
    loading,
    onSearch,
    onSelectCategory,
    onAddToCart,
    onIncrementItem,
    onDecrementItem,
    getItemQuantity,
    onOpenCart,
    onOpenOrders,
    itemsLocked = false,
    lockMessage,
}: GourmetCatalogLayoutProps) {
    const [activeCategory, setActiveCategory] = React.useState('All');
    const [query, setQuery] = React.useState('');
    const [foodTypeFilter, setFoodTypeFilter] = React.useState<'all' | 'veg' | 'non-veg'>('all');
    const [justAddedItemId, setJustAddedItemId] = React.useState<string | null>(null);
    const justAddedTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchInputRef = React.useRef<HTMLInputElement | null>(null);

    const listVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.07,
                delayChildren: 0.06,
            },
        },
    };

    const cardVariants: Variants = {
        hidden: { opacity: 0, y: 14 },
        show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
    };

    React.useEffect(() => {
        onSelectCategory(activeCategory);
    }, [activeCategory, onSelectCategory]);

    React.useEffect(() => {
        return () => {
            if (justAddedTimerRef.current) {
                clearTimeout(justAddedTimerRef.current);
            }
        };
    }, []);

    const handleAddClick = React.useCallback((item: CatalogItem) => {
        const added = onAddToCart(item);
        if (added === false) return;

        setJustAddedItemId(item.id);
        if (justAddedTimerRef.current) {
            clearTimeout(justAddedTimerRef.current);
        }

        justAddedTimerRef.current = setTimeout(() => {
            setJustAddedItemId((prev) => (prev === item.id ? null : prev));
            justAddedTimerRef.current = null;
        }, 1200);
    }, [onAddToCart]);

    const handleSearchClick = React.useCallback(() => {
        const input = searchInputRef.current;
        if (input) {
            input.scrollIntoView({ behavior: 'smooth', block: 'center' });
            input.focus();
        }
        onSearch?.();
    }, [onSearch]);

    const safeCategories = categories.length > 0 ? categories : ['All'];

    const visibleItems = React.useMemo(() => {
        const q = query.trim().toLowerCase();
        return items.filter((item) => {
            const categoryPass = activeCategory === 'All' || item.category === activeCategory;
            if (!categoryPass) return false;
            const typePass = foodTypeFilter === 'all' || item.type === foodTypeFilter;
            if (!typePass) return false;
            if (!q) return true;
            return `${item.name} ${item.description} ${item.category}`.toLowerCase().includes(q);
        });
    }, [items, activeCategory, foodTypeFilter, query]);

    const groupedVisibleItems = React.useMemo(() => {
        const knownCategoryOrder = safeCategories.filter((c) => c !== 'All');
        const discoveredCategories = Array.from(new Set(visibleItems.map((item) => item.category)));

        const categoryOrder = activeCategory === 'All'
            ? [
                ...knownCategoryOrder,
                ...discoveredCategories.filter((c) => !knownCategoryOrder.includes(c)),
            ]
            : [activeCategory];

        return categoryOrder
            .map((category) => ({
                category,
                items: visibleItems.filter((item) => item.category === category),
            }))
            .filter((group) => group.items.length > 0);
    }, [safeCategories, visibleItems, activeCategory]);

    const bodyFont = branding.fontFamily || manrope.style.fontFamily;
    const heroTitle = (branding.heroHeadline || "Chef's Table").trim();
    const heroSubtitle = (branding.heroTagline || 'A curated menu crafted for your table.').trim();
    const headerLogoSrc = (branding.logoUrl || '').trim() || '/nexresto-logo.svg';
    const featuredItem = visibleItems[0] || null;

    return (
        <div className="min-h-screen overflow-x-hidden bg-[#f2f3f5] text-[#151718]" style={{ fontFamily: bodyFont }}>
            <header className="fixed top-0 z-40 flex h-20 w-full items-center justify-between border-b border-white/10 bg-[#101316]/92 px-4 text-[#e7eaec] backdrop-blur-xl sm:px-6">
                <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                    <Image
                        src={headerLogoSrc}
                        alt="NexResto logo"
                        width={44}
                        height={44}
                        priority
                        className="h-8 w-8 rounded-full ring-1 ring-white/20 sm:h-9 sm:w-9"
                    />
                    <h1 className={`${cinzel.className} max-w-[56vw] truncate text-[1.55rem] font-semibold tracking-[0.03em] text-[#f4f4f3] drop-shadow-[0_1px_0_rgba(0,0,0,0.55)] sm:max-w-none sm:text-[1.8rem]`}>
                        {restaurantName}
                    </h1>
                </div>
                <button
                    type="button"
                    onClick={handleSearchClick}
                    aria-label="Search"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-[#dce2e5] shadow-[0_6px_18px_rgba(0,0,0,0.28)] transition hover:bg-white/15"
                >
                    <Search className="h-4 w-4" />
                </button>
            </header>

            <main className="mx-auto w-full max-w-5xl pb-24 pt-20">
                <section className="px-4 py-4 sm:px-6">
                    {featuredItem ? (
                        <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_16px_35px_rgba(16,24,40,0.08)]">
                            <div className="relative h-40 w-full sm:h-52">
                                <img
                                    src={featuredItem.image}
                                    alt={`${featuredItem.name} featured image`}
                                    className="h-full w-full object-cover"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                                <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
                                    <div>
                                        <p className="text-[11px] uppercase tracking-[0.18em] text-white/80">Featured</p>
                                        <h2 className={`${cormorant.className} text-3xl leading-none text-white sm:text-4xl`}>{heroTitle}</h2>
                                        <p className="mt-1 text-xs text-white/85">{heroSubtitle}</p>
                                    </div>
                                    <span className="rounded-full bg-white/90 px-3 py-1 text-sm font-semibold text-[#111827]">{formatINR(featuredItem.price)}</span>
                                </div>
                            </div>
                        </div>
                    ) : null}

                    <div className="mt-4 w-full">
                        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                            <Search className="h-4 w-4 text-slate-400" />
                            <input
                                ref={searchInputRef}
                                suppressHydrationWarning
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search pizza, pasta, desserts..."
                                className="h-8 w-full bg-transparent text-sm text-slate-800 placeholder:text-slate-400 outline-none"
                            />
                        </div>
                    </div>

                    <div className="no-scrollbar mt-3 flex w-full items-center gap-2 overflow-x-auto whitespace-nowrap pb-1">
                        {safeCategories.map((category) => {
                            const active = activeCategory === category;
                            return (
                                <button
                                    key={category}
                                    type="button"
                                    onClick={() => setActiveCategory(category)}
                                    className={active
                                        ? 'shrink-0 rounded-full border border-[#121619] bg-[#121619] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-white'
                                        : 'shrink-0 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600 transition hover:border-slate-300 hover:text-slate-800'}
                                    title={category}
                                >
                                    {getCategoryLabel(category)}
                                </button>
                            );
                        })}
                    </div>
                    <div className="no-scrollbar mt-3 flex w-full items-center gap-2 overflow-x-auto pb-1">
                        <button
                            type="button"
                            onClick={() => setFoodTypeFilter('all')}
                            className={foodTypeFilter === 'all'
                                ? 'shrink-0 rounded-full border border-[#121619] bg-[#121619] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white'
                                : 'shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600 hover:border-slate-300'}
                        >
                            All
                        </button>
                        <button
                            type="button"
                            onClick={() => setFoodTypeFilter('veg')}
                            className={foodTypeFilter === 'veg'
                                ? 'shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700'
                                : 'shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600 hover:border-emerald-200'}
                        >
                            Veg
                        </button>
                        <button
                            type="button"
                            onClick={() => setFoodTypeFilter('non-veg')}
                            className={foodTypeFilter === 'non-veg'
                                ? 'shrink-0 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700'
                                : 'shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600 hover:border-amber-200'}
                        >
                            Non Veg
                        </button>
                    </div>
                </section>

                <section className="px-4 pb-2 sm:px-6">
                    {itemsLocked ? (
                        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                            {lockMessage || 'Bill generated. Please complete payment.'}
                        </div>
                    ) : null}
                    <div className="mb-3 flex items-center justify-between">
                        <h3 className={`${cormorant.className} text-3xl leading-none text-[#181b1f]`}>Popular</h3>
                        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 shadow-sm">Table {tableId || 'Guest'}</span>
                    </div>
                    {loading ? (
                        <div className="py-10 text-sm text-slate-500">Loading menu...</div>
                    ) : visibleItems.length === 0 ? (
                        <div className="py-10 text-sm text-slate-500">No dishes found.</div>
                    ) : (
                        <div className="space-y-6 pb-2">
                            {groupedVisibleItems.map((group) => (
                                <section key={group.category}>
                                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                        {getCategoryLabel(group.category)}
                                    </h4>
                                    <motion.div
                                        variants={listVariants}
                                        initial="hidden"
                                        animate="show"
                                        className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4"
                                    >
                                        {group.items.map((item) => {
                                            const quantity = getItemQuantity(item.id);

                                            return (
                                                <motion.article
                                                    key={item.id}
                                                    variants={cardVariants}
                                                    className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-3 shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
                                                >
                                                    <div className="relative h-28 w-full overflow-hidden rounded-2xl bg-[#f7f7f8]">
                                                        <img
                                                            src={item.image}
                                                            alt={`${item.name} image`}
                                                            className={`h-full w-full object-cover ${item.available ? '' : 'opacity-60 grayscale'}`}
                                                        />
                                                        {item.type ? (
                                                            <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${item.type === 'veg' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                                {item.type}
                                                            </span>
                                                        ) : null}
                                                    </div>

                                                    <div className="mt-3">
                                                        <div className="min-w-0">
                                                            <h4 className="text-sm font-semibold leading-tight text-[#161a1d] break-words">{item.name}</h4>
                                                            <p className="mt-0.5 text-[11px] text-slate-500">{item.category}</p>
                                                            <p className="mt-1 text-sm font-semibold text-[#13161a]">{formatINR(item.price)}</p>
                                                        </div>

                                                        {item.available === false ? (
                                                            <button
                                                                type="button"
                                                                disabled
                                                                className="mt-2 w-full rounded-full border border-slate-200 bg-slate-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400"
                                                            >
                                                                Sold Out
                                                            </button>
                                                        ) : quantity > 0 ? (
                                                            <div className="mt-2 flex items-center justify-between rounded-full border border-slate-300 bg-white px-2 py-1.5">
                                                                <button
                                                                    type="button"
                                                                    disabled={itemsLocked}
                                                                    onClick={() => onDecrementItem(item)}
                                                                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                                                                    aria-label={`Decrease ${item.name}`}
                                                                >
                                                                    -
                                                                </button>
                                                                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-700">{quantity}</span>
                                                                <button
                                                                    type="button"
                                                                    disabled={itemsLocked}
                                                                    onClick={() => onIncrementItem(item)}
                                                                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                                                                    aria-label={`Increase ${item.name}`}
                                                                >
                                                                    +
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <motion.button
                                                                type="button"
                                                                disabled={itemsLocked}
                                                                onClick={() => handleAddClick(item)}
                                                                whileHover={{ scale: 1.02 }}
                                                                whileTap={{ scale: 0.98 }}
                                                                className="mt-2 w-full rounded-full border border-slate-300 bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                                            >
                                                                {justAddedItemId === item.id ? 'Added' : '+ Add'}
                                                            </motion.button>
                                                        )}
                                                    </div>
                                                </motion.article>
                                            );
                                        })}
                                    </motion.div>
                                </section>
                            ))}
                        </div>
                    )}
                </section>
            </main>

            <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#0f1316] px-2 py-1.5 pb-[max(0.45rem,env(safe-area-inset-bottom))]">
                <div className="mx-auto grid w-full max-w-xl grid-cols-3 gap-1.5">
                    <div className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[#2f383d] bg-[#1a2125] text-[#eef1f2]">
                        <BookOpen className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] leading-none">Menu</span>
                    </div>
                    <button
                        type="button"
                        onClick={onOpenOrders}
                        className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[#2b3439] bg-[#141a1d] text-[#a8b2b6] transition-colors hover:border-[#3b464c] hover:text-[#e3e8ea]"
                    >
                        <ClipboardList className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] leading-none">Orders</span>
                    </button>
                    <button
                        type="button"
                        onClick={onOpenCart}
                        className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[#6b4a2a] bg-gradient-to-r from-[#b57d49] to-[#d5a06a] text-[#2a1a0d] transition-colors hover:from-[#bf8855] hover:to-[#deb282]"
                    >
                        <ShoppingBag className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] leading-none">Cart</span>
                        <span className="rounded-full bg-[#3a2918]/18 px-1 py-0.5 text-[9px] font-semibold leading-none">{totalItems}</span>
                        <span className="text-[9px] font-semibold leading-none">{formatINR(totalPrice)}</span>
                    </button>
                </div>
            </nav>

            <style jsx>{`
                .no-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .no-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
            `}</style>
        </div>
    );
}

export default GourmetCatalogLayout;
