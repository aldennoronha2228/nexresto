'use client';

import React from 'react';
import Image from 'next/image';
import { motion, type Variants } from 'motion/react';
import { Playfair_Display } from 'next/font/google';
import { BookOpen, ClipboardList, ShoppingBag } from 'lucide-react';
import type { MenuItem as CartMenuItem } from '@/context/CartContext';

const playfair = Playfair_Display({
    subsets: ['latin'],
    weight: ['600', '700'],
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
    onOpenCart: () => void;
    onOpenOrders: () => void;
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
    onOpenCart,
    onOpenOrders,
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

    const safeCategories = categories.length > 0 ? categories : ['All'];
    const headerFont = "'Noto Serif', 'Times New Roman', serif";
    const bodyFont = branding.fontFamily || "'Inter', sans-serif";
    const accentPrimary = '#dce6e1';
    const accentSecondary = '#8f9491';
    const heroTitle = (branding.heroHeadline || "Chef's Table").trim();
    const heroSubtitle = (branding.heroTagline || 'A curated menu crafted for your table.').trim();
    const headerLogoSrc = (branding.logoUrl || '').trim() || '/nexresto-logo.svg';
    const currentCategoryLabel = activeCategory === 'All' ? 'Signature Selection' : getCategoryLabel(activeCategory);
    const isImportedCategory = activeCategory.toLowerCase().startsWith('imported from sheet');

    return (
        <div className="min-h-screen overflow-x-hidden bg-[#090a0b] text-[#e7e5e4]" style={{ fontFamily: bodyFont }}>
            <header className="fixed top-0 z-40 flex h-20 w-full items-center justify-between border-b border-white/10 bg-[#0c0d0e]/72 px-4 text-[#d8d9d8] backdrop-blur-2xl sm:px-6">
                <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                    <Image
                        src={headerLogoSrc}
                        alt="NexResto logo"
                        width={56}
                        height={56}
                        priority
                        className="h-9 w-9 rounded-full ring-1 ring-white/10 sm:h-11 sm:w-11"
                    />
                    <h1 className={`${playfair.className} max-w-[56vw] truncate text-xl font-semibold tracking-[0.08em] text-[#e4e5e4] sm:max-w-none sm:text-3xl`}>
                        {restaurantName}
                    </h1>
                </div>
                <button
                    type="button"
                    onClick={handleSearchClick}
                    aria-label="Search"
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#d0d2d0] transition hover:bg-white/10 sm:text-xs"
                >
                    Search
                </button>
            </header>

            <main className="mx-auto w-full max-w-5xl pb-16 pt-20">
                <div className="sticky top-20 z-30 border-b border-white/10 bg-[#0c0d0e]/78 px-4 py-4 backdrop-blur-xl sm:px-6">
                    <div className="no-scrollbar flex w-full items-center gap-3 overflow-x-auto whitespace-nowrap">
                        {safeCategories.map((category) => {
                            const active = activeCategory === category;
                            return (
                                <button
                                    key={category}
                                    type="button"
                                    onClick={() => setActiveCategory(category)}
                                    className={active
                                        ? `${playfair.className} shrink-0 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-semibold text-[#ececec]`
                                        : 'shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9a9d9b] transition hover:border-white/20 hover:text-[#d6d7d5] sm:text-xs'}
                                    title={category}
                                >
                                    {getCategoryLabel(category)}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <section className="px-4 py-8 sm:px-6 sm:py-10">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-[10px] uppercase tracking-[0.3em]" style={{ color: accentSecondary }}>
                            {currentCategoryLabel}
                        </span>
                        <div className="flex items-center gap-2">
                            {isImportedCategory ? (
                                <span
                                    className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-[#8f9491]"
                                    title={activeCategory}
                                >
                                    Imported
                                </span>
                            ) : null}
                            <span className="text-[10px] uppercase tracking-[0.2em] text-[#767575]">Table: {tableId || 'Guest'}</span>
                        </div>
                    </div>
                    <h2 className={`${playfair.className} mt-2 text-4xl leading-none tracking-tight text-[#dde1de] sm:text-5xl md:text-7xl`}>
                        {heroTitle}
                    </h2>
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#aaadab]">{heroSubtitle}</p>
                    <div className="mt-4 w-full max-w-md">
                        <input
                            ref={searchInputRef}
                            suppressHydrationWarning
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search dishes"
                            className="w-full rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-[#e7e5e4] placeholder:text-[#7c7f7d] outline-none transition focus:border-white/25 focus:bg-white/10"
                        />
                    </div>
                    <div className="no-scrollbar mt-4 flex w-full max-w-md items-center gap-2 overflow-x-auto pb-1">
                        <button
                            type="button"
                            onClick={() => setFoodTypeFilter('all')}
                            className={foodTypeFilter === 'all'
                                ? 'shrink-0 rounded-full border border-white/20 bg-white/12 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#ececec]'
                                : 'shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#bcbab8] hover:border-white/20'}
                        >
                            All
                        </button>
                        <button
                            type="button"
                            onClick={() => setFoodTypeFilter('veg')}
                            className={foodTypeFilter === 'veg'
                                ? 'shrink-0 rounded-full border border-emerald-200/30 bg-emerald-300/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-100'
                                : 'shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#bcbab8] hover:border-[#89b39c]/40'}
                        >
                            Veg
                        </button>
                        <button
                            type="button"
                            onClick={() => setFoodTypeFilter('non-veg')}
                            className={foodTypeFilter === 'non-veg'
                                ? 'shrink-0 rounded-full border border-amber-200/30 bg-amber-300/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-100'
                                : 'shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#bcbab8] hover:border-amber-300/40'}
                        >
                            Non Veg
                        </button>
                    </div>
                </section>

                <section>
                    {loading ? (
                        <div className="px-4 py-10 text-sm text-[#acabaa] sm:px-6">Loading menu...</div>
                    ) : visibleItems.length === 0 ? (
                        <div className="px-4 py-10 text-sm text-[#acabaa] sm:px-6">No dishes found.</div>
                    ) : (
                        <motion.div
                            variants={listVariants}
                            initial="hidden"
                            animate="show"
                            className="space-y-4 px-4 pb-2 sm:space-y-5 sm:px-6"
                        >
                            {visibleItems.map((item) => (
                                <motion.article
                                    key={item.id}
                                    variants={cardVariants}
                                    className="flex flex-col items-start gap-5 rounded-2xl border border-white/8 bg-white/[0.02] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.26)] sm:flex-row sm:items-stretch sm:gap-6 sm:p-7"
                                >
                                <div className="flex min-h-[140px] w-full flex-1 flex-col justify-between">
                                    <div>
                                        <div className="mb-1 flex items-center gap-2">
                                            {item.type ? (
                                                <span className={`text-[10px] uppercase tracking-[0.2em] ${item.type === 'veg' ? 'text-emerald-300' : 'text-amber-300'}`}>
                                                    {item.type}
                                                </span>
                                            ) : null}
                                            <span className="text-[10px] uppercase tracking-[0.2em] text-[#8f9491]">
                                                {item.category}
                                            </span>
                                        </div>
                                        <h3 className={`${playfair.className} mb-3 text-3xl leading-tight tracking-tight text-[#e7e5e4]`}>
                                            {item.name}
                                        </h3>
                                        <p className="mb-4 max-w-full text-sm leading-relaxed text-[#acabaa] sm:max-w-[240px]">
                                            {item.description || 'Premium ingredients and a refined tasting profile.'}
                                        </p>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-2xl font-semibold tracking-tight text-[#ececec]">{formatINR(item.price)}</span>
                                        <motion.button
                                            type="button"
                                            disabled={!item.available}
                                            onClick={() => handleAddClick(item)}
                                            whileHover={item.available ? { scale: 1.04 } : undefined}
                                            whileTap={item.available ? { scale: 0.98 } : undefined}
                                            className="rounded-full px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.2em] transition disabled:cursor-not-allowed disabled:bg-[#2f2f2f] disabled:text-[#676666]"
                                            style={{
                                                background: item.available ? accentPrimary : '#2f2f2f',
                                                color: item.available ? '#171b19' : '#676666',
                                            }}
                                        >
                                            {!item.available
                                                ? 'Sold Out'
                                                : justAddedItemId === item.id
                                                    ? 'Added'
                                                    : 'Add to Cart'}
                                        </motion.button>
                                    </div>
                                </div>
                                <div className="relative h-44 w-full flex-shrink-0 overflow-hidden rounded-xl sm:h-auto sm:w-40">
                                    <Image
                                        src={item.image}
                                        alt={`${item.name} image`}
                                        fill
                                        sizes="(max-width: 640px) 100vw, 160px"
                                        className={`rounded-[8px] object-cover ${item.available ? '' : 'opacity-60 grayscale'}`}
                                    />
                                </div>
                                </motion.article>
                            ))}
                        </motion.div>
                    )}
                </section>

                <section className="p-10 text-center">
                    <p className="text-xl italic text-[#acabaa]" style={{ fontFamily: headerFont }}>
                        &quot;Cuisine is the bridge between earth and the soul.&quot;
                    </p>
                    <div className="mt-4 flex justify-center gap-2">
                        <span className="h-1 w-1 rounded-full" style={{ backgroundColor: accentSecondary }} />
                        <span className="h-1 w-1 rounded-full" style={{ backgroundColor: accentSecondary }} />
                        <span className="h-1 w-1 rounded-full" style={{ backgroundColor: accentSecondary }} />
                    </div>
                </section>
            </main>

            <nav className="fixed bottom-0 left-0 z-40 flex h-14 w-full items-center justify-around border-t border-white/10 bg-[#0c0d0e]/72 px-3 pb-1 backdrop-blur-3xl">
                <div className="flex flex-col items-center justify-center text-[#d7d9d7]">
                    <BookOpen className="h-4 w-4" />
                    <span className="mt-0 text-[10px] font-semibold uppercase tracking-[0.08em] leading-none">Menu</span>
                </div>
                <button
                    type="button"
                    onClick={onOpenOrders}
                    className="flex flex-col items-center justify-center text-[#8f9391] transition-colors hover:text-white"
                >
                    <ClipboardList className="h-4 w-4" />
                    <span className="mt-0 text-[10px] font-semibold uppercase tracking-[0.08em] leading-none">Orders</span>
                </button>
                <button
                    type="button"
                    onClick={onOpenCart}
                    className="flex flex-col items-center justify-center text-[#e5e6e5]"
                >
                    <ShoppingBag className="h-4 w-4" />
                    <span className="mt-0 text-[10px] font-semibold uppercase tracking-[0.08em] leading-none">Cart ({totalItems})</span>
                    <span className="text-[10px] leading-none text-[#9b9f9c]">{formatINR(totalPrice)}</span>
                </button>
                <p className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] uppercase tracking-[0.12em] text-[#6f7572]">
                    Powered by NexResto
                </p>
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
