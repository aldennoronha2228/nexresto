'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'motion/react';
import {
    ArrowLeft,
    Bookmark,
    Search,
    ShoppingBag,
    X,
} from 'lucide-react';
import type { MenuItem as CartMenuItem } from '@/context/CartContext';

type CatalogBranding = {
    primaryColor: string;
    secondaryColor: string;
    backgroundColor: string;
    fontFamily: string;
    catalogHeadline: string;
    featuredImages: string[];
};

type CatalogItem = CartMenuItem & { available: boolean; type?: 'veg' | 'non-veg' };

type GourmetCatalogLayoutProps = {
    branding: CatalogBranding;
    categories: string[];
    items: CatalogItem[];
    tableId: string;
    restaurantName: string;
    totalItems: number;
    totalPrice: number;
    loading: boolean;
    homeHref?: string;
    onBack?: () => void;
    onSearch?: () => void;
    onSelectCategory: (category: string) => void;
    onAddToCart: (item: CatalogItem) => void;
    onOpenCart: () => void;
    onOpenOrders: () => void;
};

const B64_STRINGS = [
    'U0VMRUNUSU9O',
    'Q0hFQ0tPVVQgLT4=',
    'K0FERCBUTyBTRUxFQ1RJT04=',
] as const;

function decodeBase64(input: string): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let output = '';
    let i = 0;

    while (i < input.length) {
        const enc1 = chars.indexOf(input.charAt(i++));
        const enc2 = chars.indexOf(input.charAt(i++));
        const enc3 = chars.indexOf(input.charAt(i++));
        const enc4 = chars.indexOf(input.charAt(i++));

        const chr1 = (enc1 << 2) | (enc2 >> 4);
        const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
        const chr3 = ((enc3 & 3) << 6) | enc4;

        output += String.fromCharCode(chr1);
        if (enc3 !== 64) output += String.fromCharCode(chr2);
        if (enc4 !== 64) output += String.fromCharCode(chr3);
    }

    return output;
}

function formatINR(value: number): string {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(value);
}

function imageFor(index: number, item: CatalogItem | undefined, featuredImages: string[]): string {
    if (featuredImages[index]) return featuredImages[index];
    if (item?.image) return item.image;
    return 'https://images.unsplash.com/photo-1541544741938-0af808871cc0?w=1200&q=80';
}

function pseudoRating(seed: string): string {
    const value = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const rating = 3.5 + (value % 15) / 10;
    return rating.toFixed(1);
}

function isVegItem(item: CatalogItem): boolean {
    if (item.type === 'veg') return true;
    if (item.type === 'non-veg') return false;

    const haystack = `${item.name} ${item.description || ''} ${item.category || ''}`.toLowerCase();
    const nonVegKeywords = [
        'chicken', 'mutton', 'lamb', 'beef', 'pork', 'fish', 'seafood', 'prawn', 'shrimp', 'egg', 'biryani', 'kebab',
    ];
    return !nonVegKeywords.some((word) => haystack.includes(word));
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
    homeHref,
    onBack,
    onSearch,
    onSelectCategory,
    onAddToCart,
    onOpenCart,
}: GourmetCatalogLayoutProps) {
    const [menuOpen, setMenuOpen] = React.useState(false);
    const [dietFilter, setDietFilter] = React.useState<'veg' | 'nonveg'>('veg');
    const [searchQuery, setSearchQuery] = React.useState('');
    const sectionRefs = React.useRef<Record<string, HTMLElement | null>>({});

    const filteredByDiet = React.useMemo(() => {
        return items.filter((item) => dietFilter === 'veg' ? isVegItem(item) : !isVegItem(item));
    }, [items, dietFilter]);

    const filteredByDietAndSearch = React.useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return filteredByDiet;

        return filteredByDiet.filter((item) => {
            const haystack = `${item.name} ${item.description || ''} ${item.category || ''}`.toLowerCase();
            return haystack.includes(query);
        });
    }, [filteredByDiet, searchQuery]);

    const groupedSections = React.useMemo(() => {
        const ordered = categories.filter((category) => category !== 'All');
        const sections = ordered
            .map((category) => ({
                category,
                items: filteredByDietAndSearch.filter((item) => item.category === category),
            }))
            .filter((section) => section.items.length > 0);

        const known = new Set(sections.map((section) => section.category));
        const extras = filteredByDietAndSearch
            .filter((item) => !known.has(item.category))
            .reduce<Record<string, CatalogItem[]>>((acc, item) => {
                const key = item.category || 'Others';
                if (!acc[key]) acc[key] = [];
                acc[key].push(item);
                return acc;
            }, {});

        return [...sections, ...Object.entries(extras).map(([category, list]) => ({ category, items: list }))];
    }, [categories, filteredByDietAndSearch]);

    const heading = `${dietFilter === 'veg' ? 'Veg Menu' : 'Non-Veg Menu'}`;

    const categoryCounts = React.useMemo(() => {
        const preset = categories.filter((category) => category !== 'All');
        const countsFromAllItems = preset.map((category) => ({
            category,
            count: items.filter((item) => item.category === category).length,
        }));

        // Include any legacy item categories not present in preset list at the end.
        const presetSet = new Set(preset.map((c) => c.toLowerCase()));
        const extraCategories = Array.from(new Set(
            items
                .map((item) => String(item.category || '').trim())
                .filter((category) => category && !presetSet.has(category.toLowerCase()))
        )).map((category) => ({
            category,
            count: items.filter((item) => item.category === category).length,
        }));

        return [...countsFromAllItems, ...extraCategories];
    }, [categories, items]);

    const selectionLabel = decodeBase64(B64_STRINGS[0]);
    const checkoutLabel = decodeBase64(B64_STRINGS[1]);
    const addSelectionLabel = 'ADD';

    return (
        <div
            className="min-h-screen bg-[#F8F7F4] text-slate-900 antialiased"
            style={{
                backgroundColor: branding.backgroundColor,
                fontFamily: branding.fontFamily,
            }}
        >
            <div className="mx-auto min-h-screen w-full max-w-md pb-28 md:max-w-3xl md:pb-20">
                <header className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/95 px-4 pb-3 pt-3 backdrop-blur-sm md:px-6">
                    <div className="mb-3 flex items-center">
                        <div className="flex h-12 flex-1 items-center rounded-2xl border border-slate-200 bg-white px-2 shadow-sm">
                            <button
                                onClick={onBack}
                                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                                aria-label="Back"
                            >
                                <ArrowLeft className="h-5 w-5" />
                            </button>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search dishes..."
                                className="ml-1 h-9 flex-1 bg-transparent text-sm font-medium text-slate-700 placeholder:text-slate-400 focus:outline-none"
                                aria-label="Search dishes"
                            />
                            <button
                                onClick={() => {
                                    if (searchQuery.trim()) {
                                        setSearchQuery('');
                                    } else {
                                        onSearch?.();
                                    }
                                }}
                                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
                                aria-label={searchQuery.trim() ? 'Clear search' : 'Search'}
                            >
                                {searchQuery.trim() ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        <button
                            onClick={() => setDietFilter('veg')}
                            className={`flex min-w-[132px] items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold shadow-sm ${dietFilter === 'veg' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-700'}`}
                        >
                            <span className="inline-block h-4 w-4 rounded-full border border-emerald-500" />
                            <span>Veg</span>
                        </button>
                        <button
                            onClick={() => setDietFilter('nonveg')}
                            className={`flex min-w-[132px] items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold shadow-sm ${dietFilter === 'nonveg' ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-700'}`}
                        >
                            <span className="inline-block h-4 w-4 rounded border border-rose-400" />
                            <span>Non-Veg</span>
                        </button>
                    </div>
                    {homeHref ? (
                        <div className="mt-2 text-xs font-medium text-slate-600">
                            <Link href={homeHref} className="underline underline-offset-2">About {restaurantName}</Link>
                        </div>
                    ) : null}
                </header>

                <main className="space-y-4 px-4 py-4 md:px-6">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-800 md:text-3xl">
                        {restaurantName} {heading}
                    </h1>

                    {loading ? (
                        <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-500">Loading menu...</div>
                    ) : groupedSections.length === 0 ? (
                        <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-500">No menu items available.</div>
                    ) : (
                        <div className="space-y-8">
                            {groupedSections.map((section, sectionIdx) => (
                                <section
                                    key={section.category}
                                    ref={(el) => { sectionRefs.current[section.category] = el; }}
                                    className="space-y-4"
                                >
                                    <h2 className="text-xl font-bold tracking-tight text-slate-800 md:text-2xl">
                                        {section.category} ({section.items.length})
                                    </h2>
                                    <div className="grid grid-cols-2 gap-4">
                                        {section.items.slice(0, 24).map((item, idx) => (
                                            <motion.article
                                                key={item.id}
                                                initial={{ opacity: 0, y: 12 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: idx * 0.03 }}
                                                className="space-y-2"
                                            >
                                                <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-white shadow-sm">
                                                    <Image
                                                        src={imageFor(idx, item, branding.featuredImages)}
                                                        alt={`${item.name} from ${restaurantName} ${section.category} menu`}
                                                        fill
                                                        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 280px"
                                                        priority={sectionIdx === 0 && idx === 0}
                                                        unoptimized
                                                        className="h-full w-full object-cover"
                                                    />
                                                </div>

                                                <div className="flex items-center justify-between gap-1 text-[13px] font-semibold text-slate-500">
                                                    <span className="truncate rounded-full bg-rose-50 px-2 py-0.5 text-rose-600">
                                                        {item.category || section.category}
                                                    </span>
                                                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-600">★ {pseudoRating(item.name)}</span>
                                                </div>

                                                <h3 className="line-clamp-2 text-lg font-bold leading-tight text-slate-900 md:text-xl">{item.name}</h3>

                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-lg font-bold leading-none text-slate-900 md:text-xl">₹{Math.round(item.price)}</span>
                                                    <button
                                                        onClick={() => onAddToCart(item)}
                                                        disabled={!item.available}
                                                        className="rounded-xl border border-slate-300 bg-white px-5 py-1.5 text-lg font-bold leading-none text-emerald-600 shadow-sm transition hover:bg-emerald-50 disabled:opacity-50 md:text-base"
                                                        aria-label={`Add ${item.name}`}
                                                    >
                                                        {addSelectionLabel}
                                                    </button>
                                                </div>
                                            </motion.article>
                                        ))}
                                    </div>
                                </section>
                            ))}
                        </div>
                    )}
                </main>

                {totalItems > 0 ? (
                    <div className="fixed inset-x-0 bottom-4 z-50 px-4 md:px-6">
                        <div className="mx-auto flex w-full max-w-md items-center justify-between rounded-full bg-[#232528]/90 px-3 py-2 text-white shadow-xl backdrop-blur-sm md:max-w-3xl">
                            <div className="flex items-center gap-2.5 pl-2">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
                                    <ShoppingBag className="h-4.5 w-4.5" />
                                </div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">
                                    {selectionLabel} {formatINR(totalPrice)}
                                </p>
                            </div>

                            <button
                                onClick={onOpenCart}
                                className="inline-flex items-center gap-1 rounded-full bg-white px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-900"
                            >
                                {checkoutLabel}
                            </button>
                        </div>
                    </div>
                ) : null}

                <button
                    onClick={() => setMenuOpen(true)}
                    className="fixed bottom-5 right-4 z-50 flex h-16 w-16 flex-col items-center justify-center rounded-full bg-[#020919] text-white shadow-2xl md:right-8"
                    aria-label="Open menu categories"
                >
                    <Bookmark className="h-5 w-5" />
                    <span className="mt-0.5 text-[9px] font-bold tracking-[0.08em]">MENU</span>
                </button>

                {menuOpen ? (
                    <div className="fixed inset-0 z-[60] bg-black/45" onClick={() => setMenuOpen(false)}>
                        <div
                            className="absolute inset-x-4 bottom-5 max-h-[50vh] overflow-y-auto rounded-[24px] bg-[#01081A] p-4 text-white shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="mb-2 flex items-center justify-between">
                                <p className="text-base font-semibold">Menu Categories</p>
                                <button
                                    onClick={() => setMenuOpen(false)}
                                    className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10"
                                    aria-label="Close categories"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="space-y-1">
                                {categoryCounts.map((entry) => (
                                    <button
                                        key={entry.category}
                                        onClick={() => {
                                            onSelectCategory(entry.category);
                                            sectionRefs.current[entry.category]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                            setMenuOpen(false);
                                        }}
                                        className="flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left hover:bg-white/5"
                                    >
                                        <span className="text-lg font-medium leading-tight md:text-base">{entry.category}</span>
                                        <span className="text-lg font-medium leading-tight text-slate-300 md:text-base">{entry.count}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : null}

                {!tableId ? (
                    <div className="fixed left-1/2 top-2 z-50 -translate-x-1/2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                        Table not linked
                    </div>
                ) : null}
            </div>
        </div>
    );
}
