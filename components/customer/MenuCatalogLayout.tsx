'use client';

import React from 'react';
import Image from 'next/image';
import type { MenuItem as CartMenuItem } from '@/context/CartContext';

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
    onAddToCart: (item: CatalogItem) => void;
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

    React.useEffect(() => {
        onSelectCategory(activeCategory);
    }, [activeCategory, onSelectCategory]);

    const visibleItems = React.useMemo(() => {
        const q = query.trim().toLowerCase();
        return items.filter((item) => {
            const categoryPass = activeCategory === 'All' || item.category === activeCategory;
            if (!categoryPass) return false;
            if (!q) return true;
            return `${item.name} ${item.description} ${item.category}`.toLowerCase().includes(q);
        });
    }, [items, activeCategory, query]);

    const safeCategories = categories.length > 0 ? categories : ['All'];
    const headerFont = "'Noto Serif', 'Times New Roman', serif";
    const bodyFont = branding.fontFamily || "'Inter', sans-serif";
    const accentPrimary = branding.primaryColor || '#b5ccc1';
    const accentSecondary = branding.secondaryColor || '#ca917a';
    const heroTitle = (branding.heroHeadline || "Chef's Table").trim();
    const heroSubtitle = (branding.heroTagline || 'A curated menu crafted for your table.').trim();

    return (
        <div className="min-h-screen bg-[#0e0e0e] text-[#e7e5e4]" style={{ fontFamily: bodyFont }}>
            <header className="fixed top-0 z-40 flex h-20 w-full items-center justify-between border-b border-[#484848]/20 bg-[#0E0E0E] px-6 text-[#B5CCC1]">
                <div className="flex items-center gap-4">
                    <Image
                        src="/nexresto-mark.svg"
                        alt="NexResto logo"
                        width={56}
                        height={56}
                        priority
                        className="h-14 w-14"
                    />
                    <h1 className="text-2xl tracking-widest" style={{ fontFamily: headerFont }}>
                        {restaurantName}
                    </h1>
                </div>
                <button
                    type="button"
                    onClick={onSearch}
                    aria-label="Search"
                    className="text-xs font-bold uppercase tracking-[0.2em] text-[#B5CCC1]/90 hover:text-[#B5CCC1]"
                >
                    Search
                </button>
            </header>

            <main className="mx-auto max-w-5xl pb-24 pt-20">
                <div className="sticky top-20 z-30 border-b border-[#484848]/20 bg-[#0E0E0E]/95 px-6 py-4 backdrop-blur-md">
                    <div className="no-scrollbar flex min-w-max items-baseline gap-8 overflow-x-auto">
                        {safeCategories.map((category) => {
                            const active = activeCategory === category;
                            return (
                                <button
                                    key={category}
                                    type="button"
                                    onClick={() => setActiveCategory(category)}
                                    className={active
                                        ? 'text-lg italic tracking-wide text-[#B5CCC1]'
                                        : 'text-xs font-bold uppercase tracking-[0.2em] text-[#acabaa] transition-colors hover:text-[#e7e5e4]'}
                                    style={{ fontFamily: active ? headerFont : bodyFont }}
                                >
                                    {category}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <section className="px-6 py-10">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-[10px] uppercase tracking-[0.3em]" style={{ color: accentSecondary }}>
                            {activeCategory === 'All' ? 'Signature Selection' : activeCategory}
                        </span>
                        <span className="text-[10px] uppercase tracking-[0.2em] text-[#767575]">
                            Table: {tableId || 'Guest'}
                        </span>
                    </div>
                    <h2 className="mt-2 text-5xl italic leading-none tracking-tight md:text-7xl" style={{ fontFamily: headerFont, color: accentPrimary }}>
                        {heroTitle}
                    </h2>
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#acabaa]">{heroSubtitle}</p>
                    <div className="mt-4 max-w-md">
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search dishes"
                            className="w-full border border-[#484848] bg-transparent px-3 py-2 text-sm text-[#e7e5e4] placeholder:text-[#767575] outline-none focus:border-[#b5ccc1]"
                        />
                    </div>
                </section>

                <section className="divide-y divide-[#222]">
                    {loading ? (
                        <div className="px-6 py-10 text-sm text-[#acabaa]">Loading menu...</div>
                    ) : visibleItems.length === 0 ? (
                        <div className="px-6 py-10 text-sm text-[#acabaa]">No dishes found.</div>
                    ) : (
                        visibleItems.map((item) => (
                            <article key={item.id} className="flex items-start px-6 py-10">
                                <div className="flex min-h-[140px] flex-1 flex-col justify-between pr-6">
                                    <div>
                                        <div className="mb-1 flex items-center gap-2">
                                            {item.type ? (
                                                <span className={`text-[10px] uppercase tracking-[0.2em] ${item.type === 'veg' ? 'text-emerald-300' : 'text-rose-300'}`}>
                                                    {item.type}
                                                </span>
                                            ) : null}
                                            <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: accentSecondary }}>
                                                {item.category}
                                            </span>
                                        </div>
                                        <h3 className="mb-3 text-3xl leading-tight tracking-tight text-[#e7e5e4]" style={{ fontFamily: headerFont }}>
                                            {item.name}
                                        </h3>
                                        <p className="mb-4 max-w-[240px] text-sm leading-relaxed text-[#acabaa]">
                                            {item.description || 'Premium ingredients and a refined tasting profile.'}
                                        </p>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-lg font-bold tracking-tight text-[#e7e5e4]">{formatINR(item.price)}</span>
                                        <button
                                            type="button"
                                            disabled={!item.available}
                                            onClick={() => onAddToCart(item)}
                                            className="px-6 py-3 text-[10px] font-bold uppercase tracking-[0.2em] transition-transform active:scale-95 disabled:cursor-not-allowed disabled:bg-[#2f2f2f] disabled:text-[#676666]"
                                            style={{
                                                background: item.available ? accentPrimary : '#2f2f2f',
                                                color: item.available ? '#30443c' : '#676666',
                                            }}
                                        >
                                            {item.available ? 'Add' : 'Sold Out'}
                                        </button>
                                    </div>
                                </div>
                                <div className="relative h-32 w-32 flex-shrink-0">
                                    <Image
                                        src={item.image}
                                        alt={`${item.name} image`}
                                        fill
                                        sizes="128px"
                                        className={`rounded-[8px] object-cover ${item.available ? '' : 'opacity-60 grayscale'}`}
                                    />
                                </div>
                            </article>
                        ))
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

            <nav className="fixed bottom-0 left-0 z-40 flex h-20 w-full items-center justify-around border-t border-[#484848]/20 bg-[#131313] px-4 pb-4">
                <div className="flex flex-col items-center justify-center text-[#B5CCC1]">
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em]">Menu</span>
                </div>
                <button
                    type="button"
                    onClick={onOpenOrders}
                    className="flex flex-col items-center justify-center text-[#767575] transition-colors hover:text-white"
                >
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em]">Orders</span>
                </button>
                <button
                    type="button"
                    onClick={onOpenCart}
                    className="flex flex-col items-center justify-center text-[#B5CCC1]"
                >
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em]">Cart ({totalItems})</span>
                    <span className="text-[10px] text-[#acabaa]">{formatINR(totalPrice)}</span>
                </button>
                <p className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.12em] text-[#767575]">
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
