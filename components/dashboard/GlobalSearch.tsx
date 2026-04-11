'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Search, ShoppingBag, UtensilsCrossed, QrCode, History, ArrowRight, X, Users, ChefHat, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { tenantAuth, adminAuth } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { hasPermission, type PermissionType } from '@/components/dashboard/RoleGuard';

// ─── Types ────────────────────────────────────────────────────────────────────
interface SearchResult {
    id: string;
    type: 'order' | 'menu' | 'nav';
    title: string;
    subtitle: string;
    href: string;
    icon: React.ReactNode;
    badge?: string;
    badgeColor?: string;
}

interface NavLinkItem {
    id: string;
    type: 'nav';
    title: string;
    subtitle: string;
    basePath: string;
    icon: React.ReactNode;
    permission: PermissionType;
}

// ─── Static quick-navigation links ───────────────────────────────────────────
const NAV_LINKS_BASE: NavLinkItem[] = [
    {
        id: 'nav-orders',
        type: 'nav',
        title: 'Live Orders',
        subtitle: 'Monitor active orders',
        basePath: '/dashboard/orders',
        icon: <ShoppingBag className="w-4 h-4" />,
        permission: 'can_view_orders',
    },
    {
        id: 'nav-kds',
        type: 'nav',
        title: 'Kitchen Display',
        subtitle: 'Kitchen Kanban board',
        basePath: '/dashboard/kds',
        icon: <ChefHat className="w-4 h-4" />,
        permission: 'can_view_kds',
    },
    {
        id: 'nav-waiter',
        type: 'nav',
        title: 'Waiter Display',
        subtitle: 'Ready-to-serve notifications',
        basePath: '/dashboard/waiter',
        icon: <Bell className="w-4 h-4" />,
        permission: 'can_view_waiter',
    },
    {
        id: 'nav-history',
        type: 'nav',
        title: 'Order History',
        subtitle: 'View past orders & revenue',
        basePath: '/dashboard/history',
        icon: <History className="w-4 h-4" />,
        permission: 'can_view_history',
    },
    {
        id: 'nav-customers',
        type: 'nav',
        title: 'Customers',
        subtitle: 'Track customer visits & spend',
        basePath: '/dashboard/customers',
        icon: <Users className="w-4 h-4" />,
        permission: 'can_view_history',
    },
    {
        id: 'nav-menu',
        type: 'nav',
        title: 'Menu Management',
        subtitle: 'Manage menu items',
        basePath: '/dashboard/menu',
        icon: <UtensilsCrossed className="w-4 h-4" />,
        permission: 'can_view_menu',
    },
    {
        id: 'nav-tables',
        type: 'nav',
        title: 'Tables & QR',
        subtitle: 'Floor plan & QR codes',
        basePath: '/dashboard/tables',
        icon: <QrCode className="w-4 h-4" />,
        permission: 'can_view_tables',
    },
];

const STATUS_COLORS: Record<string, string> = {
    new: 'bg-blue-100 text-blue-700',
    preparing: 'bg-amber-100 text-amber-700',
    done: 'bg-emerald-100 text-emerald-700',
    paid: 'bg-slate-100 text-slate-600',
    cancelled: 'bg-rose-100 text-rose-700',
};

// ─── Component ────────────────────────────────────────────────────────────────
export function GlobalSearch() {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [results, setResults] = useState<SearchResult[]>([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [searching, setSearching] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const router = useRouter();
    const params = useParams<{ storeId: string }>();
    const urlStoreId = params?.storeId || '';
    const { userRole } = useAuth();
    const canSearchOrders = hasPermission(userRole, 'can_view_orders');
    const canSearchMenu = hasPermission(userRole, 'can_view_menu');
    const getActiveToken = useCallback(async (): Promise<string> => {
        if (adminAuth.currentUser) return adminAuth.currentUser.getIdToken(true);
        if (tenantAuth.currentUser) return tenantAuth.currentUser.getIdToken(true);
        throw new Error('Missing active session');
    }, []);

    const refreshTokens = useCallback(async () => {
        const jobs: Promise<unknown>[] = [];
        if (tenantAuth.currentUser) jobs.push(tenantAuth.currentUser.getIdToken(true));
        if (adminAuth.currentUser) jobs.push(adminAuth.currentUser.getIdToken(true));
        if (jobs.length > 0) {
            await Promise.allSettled(jobs);
        }
    }, []);

    // Dynamically resolved nav links
    const NAV_LINKS: SearchResult[] = useMemo(
        () => NAV_LINKS_BASE
            .filter((n) => hasPermission(userRole, n.permission))
            .map(n => ({
                ...n,
                href: `/${urlStoreId}${n.basePath}`
            })) as SearchResult[],
        [userRole, urlStoreId]
    );

    // ── Search Firestore + filter nav links ──────────────────────────────────
    const runSearch = useCallback(async (q: string) => {
        const trimmed = q.trim();
        const lowerTrimmed = trimmed.toLowerCase();

        if (!trimmed || !urlStoreId) {
            setResults([]);
            setSearching(false);
            return;
        }

        setSearching(true);

        const executeQuery = async () => {
            const navResults = NAV_LINKS.filter(
                (n) =>
                    n.title.toLowerCase().includes(lowerTrimmed) ||
                    n.subtitle.toLowerCase().includes(lowerTrimmed)
            );

            if (!canSearchOrders && !canSearchMenu) {
                setResults(navResults);
                setActiveIndex(0);
                return;
            }

            const token = await getActiveToken();
            const response = await fetch(`/api/search/global?restaurantId=${encodeURIComponent(urlStoreId)}&q=${encodeURIComponent(trimmed)}`, {
                headers: { Authorization: `Bearer ${token}` },
                cache: 'no-store',
            });

            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload?.error || 'Search failed');
            }

            const orderRows = canSearchOrders && Array.isArray(payload?.orders) ? payload.orders : [];
            const menuRows = canSearchMenu && Array.isArray(payload?.menuItems) ? payload.menuItems : [];

            const orderResults: SearchResult[] = orderRows
                .map((o: any) => {
                    return {
                        id: `order-${String(o.id)}`,
                        type: 'order' as const,
                        title: `Order #${o.daily_order_number ?? String(o.id).slice(-6).toUpperCase()}`,
                        subtitle: `Table ${o.table_number}`,
                        href: `/${urlStoreId}/dashboard/orders`,
                        icon: <ShoppingBag className="w-4 h-4" />,
                        badge: o.status,
                        badgeColor: STATUS_COLORS[o.status] ?? STATUS_COLORS.new,
                    };
                });

            const menuResults: SearchResult[] = menuRows
                .map((m: any) => {
                    return {
                        id: `menu-${String(m.id)}`,
                        type: 'menu' as const,
                        title: m.name,
                        subtitle: `₹${m.price}`,
                        href: `/${urlStoreId}/dashboard/menu`,
                        icon: <UtensilsCrossed className="w-4 h-4" />,
                        badge: m.available !== false ? 'Available' : 'Off menu',
                        badgeColor: m.available !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700',
                    };
                });

            const combined = [...orderResults, ...menuResults, ...navResults];
            setResults(combined);
            setActiveIndex(0);
        };

        try {
            await executeQuery();
        } catch (err: any) {
            const message = String(err?.message || '').toLowerCase();
            if (message.includes('permission')) {
                await refreshTokens();
                try {
                    await executeQuery();
                    return;
                } catch {
                    // Fall through to final error logging below.
                }
            }
            console.error('Search error:', err);
        } finally {
            setSearching(false);
        }
    }, [urlStoreId, refreshTokens, getActiveToken, NAV_LINKS, canSearchOrders, canSearchMenu]);

    // ── Debounce ──────────────────────────────────────────────────────────────
    useEffect(() => {
        const t = setTimeout(() => runSearch(query), 250);
        return () => clearTimeout(t);
    }, [query, runSearch, urlStoreId]);

    // ── Close on outside click ────────────────────────────────────────────────
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // ── Keyboard navigation ───────────────────────────────────────────────────
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!open) return;
        const total = (query.trim() ? results : NAV_LINKS).length;
        if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => (i + 1) % total); }
        if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => (i - 1 + total) % total); }
        if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
        if (e.key === 'Enter') {
            const list = query.trim() ? results : NAV_LINKS;
            const item = list[activeIndex];
            if (item) navigate(item);
        }
    };

    const navigate = (item: SearchResult) => {
        router.push(item.href);
        setOpen(false);
        setQuery('');
    };

    const displayList = query.trim() ? results : NAV_LINKS;

    return (
        <div ref={containerRef} className="relative flex-1 max-w-md">
            {/* Input */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search orders, menu items..."
                    autoComplete="off"
                    className="w-full h-10 pl-10 pr-8 bg-slate-50 border border-slate-200/60 rounded-xl text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all"
                />
                {query && (
                    <button
                        onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus(); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {/* Dropdown */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-0 right-0 top-12 bg-white rounded-2xl shadow-xl border border-slate-200/60 z-50 overflow-hidden"
                    >
                        {/* Header */}
                        <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                                {query.trim() ? (searching ? 'Searching…' : `${displayList.length} results`) : 'Quick Navigation'}
                            </span>
                            <span className="text-[10px] text-slate-300 font-mono">↑↓ navigate · Enter select · Esc close</span>
                        </div>

                        {/* Results */}
                        <div className="max-h-80 overflow-y-auto py-1.5">
                            {displayList.length === 0 && !searching && query.trim() ? (
                                <div className="px-4 py-8 text-center">
                                    <Search className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                                    <p className="text-sm text-slate-400">No results for "<strong>{query}</strong>"</p>
                                    <p className="text-xs text-slate-300 mt-1">Try searching by table number, item name, or status</p>
                                </div>
                            ) : (
                                displayList.map((item, i) => (
                                    <motion.button
                                        key={item.id}
                                        initial={false}
                                        animate={{ backgroundColor: i === activeIndex ? 'rgb(248 250 252)' : 'rgb(255 255 255)' }}
                                        onClick={() => navigate(item)}
                                        onMouseEnter={() => setActiveIndex(i)}
                                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-left"
                                    >
                                        {/* Icon */}
                                        <div className={cn(
                                            'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                                            item.type === 'order' ? 'bg-blue-50 text-blue-600' :
                                                item.type === 'menu' ? 'bg-indigo-50 text-indigo-600' :
                                                    'bg-slate-100 text-slate-600'
                                        )}>
                                            {item.icon}
                                        </div>

                                        {/* Text */}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-slate-900 truncate">{item.title}</p>
                                            <p className="text-xs text-slate-500 truncate">{item.subtitle}</p>
                                        </div>

                                        {/* Badge */}
                                        {item.badge && (
                                            <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize flex-shrink-0', item.badgeColor)}>
                                                {item.badge}
                                            </span>
                                        )}

                                        {/* Arrow */}
                                        <ArrowRight className={cn('w-3.5 h-3.5 flex-shrink-0 transition-opacity', i === activeIndex ? 'opacity-100 text-blue-500' : 'opacity-0')} />
                                    </motion.button>
                                ))
                            )}
                        </div>

                        {/* Footer hint */}
                        <div className="px-4 py-2 border-t border-slate-100 flex items-center gap-4 text-[10px] text-slate-300">
                            <span className="flex items-center gap-1"><kbd className="px-1 bg-slate-100 rounded text-slate-400 font-mono">↵</kbd> open</span>
                            <span className="flex items-center gap-1"><kbd className="px-1 bg-slate-100 rounded text-slate-400 font-mono">Esc</kbd> close</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
