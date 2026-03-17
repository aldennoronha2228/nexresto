'use client';

/**
 * Super Admin - Restaurant Manager
 * Searchable, paginated table of all restaurants with action menus
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    Search, MoreVertical, Building2, User, CreditCard,
    ChevronLeft, ChevronRight, LogIn, KeyRound,
    Trash2, AlertTriangle, Check, X, Copy, FileText, Calendar,
    Eye, EyeOff, RefreshCw, Shield, Users, Filter, DollarSign, TrendingUp, Clock3, Archive
} from 'lucide-react';
import Link from 'next/link';
import { DayPicker } from 'react-day-picker';
import { format } from 'date-fns';
import {
    getAllRestaurants,
    updateRestaurantSubscription,
    updateRestaurantStatus,
    archiveRestaurant,
    deleteRestaurant,
    resetUserPassword,
    sendPasswordResetEmail,
    getRestaurantUsers,
    updateSubscriptionDates,
    type RestaurantManagerMetrics,
    type RestaurantWithOwner
} from '@/lib/firebase-super-admin-actions';
import { cn } from '@/lib/utils';

const ITEMS_PER_PAGE = 10;

const tierColors: Record<string, string> = {
    'starter': 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    'pro': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    '1k': 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    '2k': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    '2.5k': 'bg-amber-500/20 text-amber-300 border-amber-500/40',
};

const statusColors = {
    active: 'bg-green-500/20 text-green-400 border-green-500/30',
    past_due: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
    trial: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    expired: 'bg-red-600/30 text-red-300 border-red-500/50',
};

const tierLabels: Record<string, string> = {
    'starter': 'Basic ₹1k',
    'pro': 'Pro ₹2k',
    '1k': 'Basic ₹1k',
    '2k': 'Pro ₹2k',
    '2.5k': 'Enterprise ₹2.5k',
};

function parseDateInput(value: string): Date | undefined {
    if (!value) return undefined;
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return undefined;
    const dt = new Date(y, m - 1, d);
    if (Number.isNaN(dt.getTime())) return undefined;
    return dt;
}

function formatDateInput(value?: Date): string {
    if (!value) return '';
    return format(value, 'yyyy-MM-dd');
}

export default function RestaurantManager() {
    const [metrics, setMetrics] = useState<RestaurantManagerMetrics>({
        total_revenue: 0,
        total_active_restaurants: 0,
        growth_percent: 0,
        pending_renewals: 0,
    });
    const [restaurants, setRestaurants] = useState<RestaurantWithOwner[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [tierFilter, setTierFilter] = useState<'all' | 'free' | 'pro' | 'enterprise'>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'past_due' | 'cancelled' | 'trial' | 'expired'>('all');
    const [showFilters, setShowFilters] = useState(false);
    const [loading, setLoading] = useState(true);
    const [activeMenu, setActiveMenu] = useState<string | null>(null);

    // Modal states
    const [showTierModal, setShowTierModal] = useState<string | null>(null);
    const [showPasswordModal, setShowPasswordModal] = useState<{ restaurantId: string; users: any[] } | null>(null);
    const [showDatesModal, setShowDatesModal] = useState<RestaurantWithOwner | null>(null);
    const [showExtendModal, setShowExtendModal] = useState<RestaurantWithOwner | null>(null);
    const [showDangerModal, setShowDangerModal] = useState<{ id: string; name: string } | null>(null);
    const [dangerAction, setDangerAction] = useState<'archive' | 'delete' | null>(null);
    const [dangerConfirmText, setDangerConfirmText] = useState('');
    const [processingDanger, setProcessingDanger] = useState(false);

    // Subscription dates state
    const [subStartDate, setSubStartDate] = useState<string>('');
    const [subEndDate, setSubEndDate] = useState<string>('');
    const [activeDateField, setActiveDateField] = useState<'start' | 'end'>('end');
    const [savingDates, setSavingDates] = useState(false);

    // Action states
    const [tempPassword, setTempPassword] = useState<string | null>(null);
    const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Password reset states
    const [customPassword, setCustomPassword] = useState<string>('');
    const [showPassword, setShowPassword] = useState(false);
    const [selectedUser, setSelectedUser] = useState<{ id: string; email: string; role: string } | null>(null);
    const [resettingPassword, setResettingPassword] = useState(false);

    const loadRestaurants = useCallback(async () => {
        setLoading(true);
        const { data, total, metrics: nextMetrics } = await getAllRestaurants(page, ITEMS_PER_PAGE, search, {
            tier: tierFilter,
            status: statusFilter,
        });
        setRestaurants(data);
        setTotal(total);
        setMetrics(nextMetrics);
        setLoading(false);
    }, [page, search, tierFilter, statusFilter]);

    useEffect(() => {
        loadRestaurants();
    }, [loadRestaurants]);

    useEffect(() => {
        // Reset to page 1 when search or filters change
        setPage(1);
    }, [search, tierFilter, statusFilter]);

    const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

    const handleDangerAction = async () => {
        if (!showDangerModal || !dangerAction) return;
        const expected = dangerAction === 'delete' ? 'DELETE' : 'ARCHIVE';
        if (dangerConfirmText.trim().toUpperCase() !== expected) {
            setActionMessage({ type: 'error', text: `Type ${expected} to confirm` });
            return;
        }

        setProcessingDanger(true);
        const result = dangerAction === 'delete'
            ? await deleteRestaurant(showDangerModal.id)
            : await archiveRestaurant(showDangerModal.id);

        if (result.success) {
            setActionMessage({
                type: 'success',
                text: dangerAction === 'delete' ? 'Restaurant deleted' : 'Restaurant archived',
            });
            loadRestaurants();
            setShowDangerModal(null);
            setDangerAction(null);
            setDangerConfirmText('');
        } else {
            setActionMessage({ type: 'error', text: result.error || 'Action failed' });
        }
        setProcessingDanger(false);
    };

    const handleTierChange = async (restaurantId: string, tier: 'starter' | 'pro' | '1k' | '2k') => {
        const result = await updateRestaurantSubscription(restaurantId, tier);
        if (result.success) {
            setActionMessage({ type: 'success', text: 'Subscription updated' });
            loadRestaurants();
        } else {
            setActionMessage({ type: 'error', text: result.error || 'Failed to update' });
        }
        setShowTierModal(null);
    };

    const handleStatusChange = async (restaurantId: string, status: 'active' | 'past_due' | 'cancelled' | 'trial' | 'expired') => {
        if (status === 'expired') return;
        const result = await updateRestaurantStatus(restaurantId, status);
        if (result.success) {
            setActionMessage({ type: 'success', text: 'Status updated' });
            loadRestaurants();
        } else {
            setActionMessage({ type: 'error', text: result.error || 'Failed to update' });
        }
    };

    const openDatesModal = (restaurant: RestaurantWithOwner) => {
        setShowDatesModal(restaurant);
        setSubStartDate(restaurant.subscription_start_date || '');
        setSubEndDate(restaurant.subscription_end_date || '');
        setActiveDateField('end');
        setActiveMenu(null);
    };

    const handleSaveDates = async () => {
        if (!showDatesModal) return;
        setSavingDates(true);
        const result = await updateSubscriptionDates(
            showDatesModal.id,
            subStartDate || null,
            subEndDate || null
        );
        if (result.success) {
            setActionMessage({ type: 'success', text: 'Subscription dates updated' });
            loadRestaurants();
        } else {
            setActionMessage({ type: 'error', text: result.error || 'Failed to update dates' });
        }
        setSavingDates(false);
        setShowDatesModal(null);
    };

    const openPasswordModal = async (restaurantId: string) => {
        const users = await getRestaurantUsers(restaurantId);
        setShowPasswordModal({ restaurantId, users });
        setCustomPassword('');
        setShowPassword(false);
        setSelectedUser(null);
        setTempPassword(null);
        setActiveMenu(null);
    };

    const handleQuickExtend = async (days: 7 | 30) => {
        if (!showExtendModal) return;
        const baseDate = showExtendModal.subscription_end_date
            ? new Date(showExtendModal.subscription_end_date)
            : new Date();
        const today = new Date();
        const base = Number.isNaN(baseDate.getTime()) || baseDate < today ? today : baseDate;
        const nextEnd = new Date(base);
        nextEnd.setDate(nextEnd.getDate() + days);

        const endStr = format(nextEnd, 'yyyy-MM-dd');
        const result = await updateSubscriptionDates(
            showExtendModal.id,
            showExtendModal.subscription_start_date || format(today, 'yyyy-MM-dd'),
            endStr
        );

        if (result.success) {
            setActionMessage({ type: 'success', text: `Subscription extended by ${days} days` });
            setShowExtendModal(null);
            loadRestaurants();
        } else {
            setActionMessage({ type: 'error', text: result.error || 'Failed to extend subscription' });
        }
    };

    // Generate a strong password
    const generateStrongPassword = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        const specials = '!@#$%&*';
        let password = '';
        for (let i = 0; i < 12; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        // Add a special character and number at random positions
        const specialChar = specials.charAt(Math.floor(Math.random() * specials.length));
        const pos = Math.floor(Math.random() * password.length);
        password = password.slice(0, pos) + specialChar + password.slice(pos);
        setCustomPassword(password);
    };

    const handleResetPassword = async (userId: string, email: string, sendEmail: boolean) => {
        if (sendEmail) {
            const result = await sendPasswordResetEmail(email);
            if (result.success) {
                setActionMessage({ type: 'success', text: 'Password reset email sent' });
            } else {
                setActionMessage({ type: 'error', text: result.error || 'Failed to send email' });
            }
        } else {
            const result = await resetUserPassword(userId);
            if (result.success && result.tempPassword) {
                setTempPassword(result.tempPassword);
            } else {
                setActionMessage({ type: 'error', text: result.error || 'Failed to reset password' });
            }
        }
    };

    const handleSetCustomPassword = async () => {
        if (!selectedUser || !customPassword) return;

        if (customPassword.length < 8) {
            setActionMessage({ type: 'error', text: 'Password must be at least 8 characters' });
            return;
        }

        setResettingPassword(true);
        const result = await resetUserPassword(selectedUser.id, customPassword);

        if (result.success) {
            setActionMessage({ type: 'success', text: `Password updated successfully for ${selectedUser.email}` });
            setTempPassword(customPassword);
            setSelectedUser(null);
        } else {
            setActionMessage({ type: 'error', text: result.error || 'Failed to set password' });
        }
        setResettingPassword(false);
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setActionMessage({ type: 'success', text: 'Copied to clipboard!' });
    };

    // Clear action message after 3 seconds
    useEffect(() => {
        if (actionMessage) {
            const timer = setTimeout(() => setActionMessage(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [actionMessage]);

    return (
        <div className="space-y-6">
            {/* Top metrics row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-slate-800/70 backdrop-blur-sm rounded-xl px-4 py-3">
                    <p className="text-slate-400 text-xs">Total Revenue</p>
                    <p className="text-white text-lg font-semibold mt-1 flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-emerald-400" />
                        ₹{metrics.total_revenue.toLocaleString('en-IN')}
                    </p>
                </div>
                <div className="bg-slate-800/70 backdrop-blur-sm rounded-xl px-4 py-3">
                    <p className="text-slate-400 text-xs">Total Active Restaurants</p>
                    <p className="text-white text-lg font-semibold mt-1">{metrics.total_active_restaurants}</p>
                </div>
                <div className="bg-slate-800/70 backdrop-blur-sm rounded-xl px-4 py-3">
                    <p className="text-slate-400 text-xs">Growth %</p>
                    <p className={cn(
                        "text-lg font-semibold mt-1 flex items-center gap-2",
                        metrics.growth_percent >= 0 ? 'text-green-400' : 'text-red-400'
                    )}>
                        <TrendingUp className="w-4 h-4" />
                        {metrics.growth_percent >= 0 ? '+' : ''}{metrics.growth_percent}%
                    </p>
                </div>
                <div className="bg-slate-800/70 backdrop-blur-sm rounded-xl px-4 py-3">
                    <p className="text-slate-400 text-xs">Pending Renewals</p>
                    <p className="text-amber-400 text-lg font-semibold mt-1 flex items-center gap-2">
                        <Clock3 className="w-4 h-4" />
                        {metrics.pending_renewals}
                    </p>
                </div>
            </div>

            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Restaurant Manager</h1>
                    <p className="text-slate-400 mt-1">{total} restaurants in total</p>
                </div>

                {/* Search and Filter */}
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative w-full sm:w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search restaurants..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                        />
                    </div>
                    <div className="relative">
                        <button
                            onClick={() => setShowFilters((prev) => !prev)}
                            className={cn(
                                "inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm transition-colors",
                                (tierFilter !== 'all' || statusFilter !== 'all')
                                    ? 'bg-purple-500/20 border-purple-500/30 text-purple-300'
                                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                            )}
                        >
                            <Filter className="w-4 h-4" />
                            Filter
                        </button>

                        <AnimatePresence>
                            {showFilters && (
                                <motion.div
                                    initial={{ opacity: 0, y: -6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -6 }}
                                    className="absolute right-0 mt-2 w-72 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-30 p-4"
                                >
                                    <p className="text-slate-300 text-sm mb-2">Tier</p>
                                    <div className="flex flex-wrap gap-2 mb-4">
                                        {['all', 'free', 'pro', 'enterprise'].map((tier) => (
                                            <button
                                                key={tier}
                                                onClick={() => setTierFilter(tier as typeof tierFilter)}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-lg text-xs capitalize transition-colors",
                                                    tierFilter === tier
                                                        ? 'bg-purple-600 text-white'
                                                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                                )}
                                            >
                                                {tier}
                                            </button>
                                        ))}
                                    </div>

                                    <p className="text-slate-300 text-sm mb-2">Status</p>
                                    <div className="flex flex-wrap gap-2">
                                        {['all', 'active', 'past_due', 'trial', 'cancelled', 'expired'].map((status) => (
                                            <button
                                                key={status}
                                                onClick={() => setStatusFilter(status as typeof statusFilter)}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-lg text-xs capitalize transition-colors",
                                                    statusFilter === status
                                                        ? 'bg-purple-600 text-white'
                                                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                                )}
                                            >
                                                {status.replace('_', ' ')}
                                            </button>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            {/* Action Message Toast */}
            <AnimatePresence>
                {actionMessage && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className={cn(
                            "fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl border shadow-lg",
                            actionMessage.type === 'success'
                                ? "bg-green-500/20 text-green-400 border-green-500/30"
                                : "bg-red-500/20 text-red-400 border-red-500/30"
                        )}
                    >
                        {actionMessage.type === 'success' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                        {actionMessage.text}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Table */}
            <div className="bg-slate-800 rounded-2xl border border-slate-700">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="w-8 h-8 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
                    </div>
                ) : restaurants.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                        <Building2 className="w-12 h-12 mb-4 opacity-50" />
                        <p>No restaurants found</p>
                    </div>
                ) : (
                    <div>
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-700">
                                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Restaurant</th>
                                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Owner</th>
                                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Team</th>
                                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Tier</th>
                                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Status</th>
                                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Ends On</th>
                                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Last Report</th>
                                    <th className="text-right px-6 py-4 text-sm font-medium text-slate-400">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {restaurants.map((restaurant) => (
                                    <tr
                                        key={restaurant.id}
                                        className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">
                                                    {restaurant.name[0]?.toUpperCase() || 'R'}
                                                </div>
                                                <div>
                                                    <p className="text-white font-medium">{restaurant.name}</p>
                                                    <p className="text-slate-400 text-xs">{restaurant.id}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <User className="w-4 h-4 text-slate-400" />
                                                <span className="text-slate-300 text-sm">{restaurant.owner_name || 'No owner'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {/* Team column - show count and role breakdown for Pro tier */}
                                            <div className="flex items-center gap-2">
                                                <Users className="w-4 h-4 text-slate-400" />
                                                <div className="flex flex-col">
                                                    <span className="text-slate-300 text-sm font-medium">{restaurant.team_count || 1} member{(restaurant.team_count || 1) !== 1 ? 's' : ''}</span>
                                                    {restaurant.subscription_tier === 'pro' && restaurant.team_roles && restaurant.team_roles.length > 0 && (
                                                        <div className="flex gap-1 mt-0.5">
                                                            {restaurant.team_roles.map((r, i) => (
                                                                <span key={i} className={cn(
                                                                    "text-[10px] px-1.5 py-0.5 rounded",
                                                                    r.role === 'owner' ? 'bg-amber-500/20 text-amber-400' :
                                                                        r.role === 'manager' ? 'bg-blue-500/20 text-blue-400' :
                                                                            r.role === 'staff' ? 'bg-slate-500/20 text-slate-400' :
                                                                                'bg-purple-500/20 text-purple-400'
                                                                )}>
                                                                    {r.count} {r.role}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {restaurant.subscription_tier !== 'pro' && (restaurant.team_count || 1) > 1 && (
                                                        <span className="text-[10px] text-amber-400">⚠ RBAC requires Pro</span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={() => setShowTierModal(restaurant.id)}
                                                className={cn(
                                                    "px-3 py-1 rounded-full text-xs font-medium border hover:opacity-80 transition-opacity",
                                                    tierColors[restaurant.subscription_tier]
                                                )}
                                            >
                                                {tierLabels[restaurant.subscription_tier]}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4">
                                            {restaurant.subscription_status === 'expired' ? (
                                                <span className={cn(
                                                    "px-3 py-1 rounded-full text-xs font-medium border inline-flex",
                                                    statusColors.expired
                                                )}>
                                                    Expired
                                                </span>
                                            ) : (
                                                <select
                                                    value={restaurant.subscription_status}
                                                    onChange={(e) => handleStatusChange(restaurant.id, e.target.value as any)}
                                                    className={cn(
                                                        "px-3 py-1 rounded-full text-xs font-medium border bg-transparent cursor-pointer focus:outline-none",
                                                        statusColors[restaurant.subscription_status]
                                                    )}
                                                >
                                                    <option value="active" className="bg-slate-800">Active</option>
                                                    <option value="past_due" className="bg-slate-800">Past Due</option>
                                                    <option value="cancelled" className="bg-slate-800">Cancelled</option>
                                                    <option value="trial" className="bg-slate-800">Trial</option>
                                                </select>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <div className="min-w-[84px]">
                                                    {restaurant.subscription_end_date ? (
                                                        <span className="text-slate-300 text-sm">
                                                            {new Date(restaurant.subscription_end_date).toLocaleDateString('en-IN', {
                                                                month: 'short',
                                                                day: 'numeric',
                                                                year: 'numeric',
                                                            })}
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-500 text-xs italic">Not set</span>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={() => openDatesModal(restaurant)}
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs transition-colors"
                                                    title="Set subscription/trial dates"
                                                >
                                                    <Calendar className="w-3.5 h-3.5" />
                                                    Set
                                                </button>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {restaurant.last_report_date ? (
                                                <div className="flex items-center gap-2">
                                                    <FileText className="w-4 h-4 text-emerald-400" />
                                                    <span className="text-slate-300 text-sm">
                                                        {new Date(restaurant.last_report_date).toLocaleDateString('en-IN', {
                                                            month: 'short',
                                                            day: 'numeric'
                                                        })}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-slate-500 text-sm italic">No reports</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="relative inline-block">
                                                <button
                                                    onClick={() => setActiveMenu(activeMenu === restaurant.id ? null : restaurant.id)}
                                                    className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                                                >
                                                    <MoreVertical className="w-5 h-5 text-slate-400" />
                                                </button>

                                                <AnimatePresence>
                                                    {activeMenu === restaurant.id && (
                                                        <motion.div
                                                            initial={{ opacity: 0, scale: 0.95 }}
                                                            animate={{ opacity: 1, scale: 1 }}
                                                            exit={{ opacity: 0, scale: 0.95 }}
                                                            className="absolute right-0 top-full mt-1 w-48 bg-slate-700 rounded-xl border border-slate-600 shadow-xl z-20 overflow-hidden"
                                                        >
                                                            <Link
                                                                href={`/super-admin/impersonate/${restaurant.id}`}
                                                                onClick={() => setActiveMenu(null)}
                                                                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-slate-600 transition-colors"
                                                            >
                                                                <LogIn className="w-4 h-4" />
                                                                Impersonate
                                                            </Link>
                                                            <button
                                                                onClick={() => {
                                                                    setShowExtendModal(restaurant);
                                                                    setActiveMenu(null);
                                                                }}
                                                                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-slate-600 transition-colors"
                                                            >
                                                                <Calendar className="w-4 h-4" />
                                                                Quick Extend
                                                            </button>
                                                            <button
                                                                onClick={() => openPasswordModal(restaurant.id)}
                                                                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-slate-600 transition-colors"
                                                            >
                                                                <KeyRound className="w-4 h-4" />
                                                                Reset Password
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setShowTierModal(restaurant.id);
                                                                    setActiveMenu(null);
                                                                }}
                                                                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-slate-600 transition-colors"
                                                            >
                                                                <CreditCard className="w-4 h-4" />
                                                                Change Tier
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setShowDangerModal({ id: restaurant.id, name: restaurant.name });
                                                                    setDangerAction(null);
                                                                    setDangerConfirmText('');
                                                                    setActiveMenu(null);
                                                                }}
                                                                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                                Delete / Archive
                                                            </button>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700">
                        <p className="text-sm text-slate-400">
                            Showing {(page - 1) * ITEMS_PER_PAGE + 1} - {Math.min(page * ITEMS_PER_PAGE, total)} of {total}
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4 text-slate-300" />
                            </button>
                            <span className="text-sm text-slate-400 px-3">
                                Page {page} of {totalPages}
                            </span>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronRight className="w-4 h-4 text-slate-300" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Quick Extend Modal */}
            <AnimatePresence>
                {showExtendModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                        onClick={() => setShowExtendModal(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.95 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-slate-800 rounded-2xl border border-slate-700 p-6 w-full max-w-md"
                        >
                            <h3 className="text-lg font-semibold text-white mb-2">Quick Extend</h3>
                            <p className="text-slate-400 text-sm mb-6">Extend subscription for {showExtendModal.name}</p>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => handleQuickExtend(7)}
                                    className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-colors"
                                >
                                    +7 Days
                                </button>
                                <button
                                    onClick={() => handleQuickExtend(30)}
                                    className="px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors"
                                >
                                    +30 Days
                                </button>
                            </div>
                            <button
                                onClick={() => setShowExtendModal(null)}
                                className="w-full mt-4 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-colors"
                            >
                                Cancel
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Double Confirmation Modal */}
            <AnimatePresence>
                {showDangerModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                        onClick={() => {
                            setShowDangerModal(null);
                            setDangerAction(null);
                            setDangerConfirmText('');
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.95 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.95 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-slate-800 rounded-2xl border border-slate-700 p-6 w-full max-w-md"
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-red-500/20 rounded-xl">
                                    <AlertTriangle className="w-6 h-6 text-red-400" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-white">Delete / Archive</h3>
                                    <p className="text-slate-400 text-sm">Double confirmation required</p>
                                </div>
                            </div>

                            {!dangerAction ? (
                                <div className="space-y-3">
                                    <p className="text-slate-300 text-sm">Choose action for {showDangerModal.name}:</p>
                                    <button
                                        onClick={() => setDangerAction('archive')}
                                        className="w-full flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl transition-colors"
                                    >
                                        <Archive className="w-4 h-4" />
                                        Archive Restaurant
                                    </button>
                                    <button
                                        onClick={() => setDangerAction('delete')}
                                        className="w-full flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        Delete Permanently
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <p className="text-slate-300 text-sm">
                                        Type <span className="font-semibold text-white">{dangerAction === 'delete' ? 'DELETE' : 'ARCHIVE'}</span> to confirm.
                                    </p>
                                    <input
                                        value={dangerConfirmText}
                                        onChange={(e) => setDangerConfirmText(e.target.value)}
                                        className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                                        placeholder={dangerAction === 'delete' ? 'Type DELETE' : 'Type ARCHIVE'}
                                    />
                                    <button
                                        onClick={handleDangerAction}
                                        disabled={processingDanger}
                                        className={cn(
                                            "w-full px-4 py-2.5 text-white rounded-xl transition-colors disabled:opacity-50",
                                            dangerAction === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'
                                        )}
                                    >
                                        {processingDanger ? 'Processing...' : 'Confirm'}
                                    </button>
                                </div>
                            )}

                            <button
                                onClick={() => {
                                    setShowDangerModal(null);
                                    setDangerAction(null);
                                    setDangerConfirmText('');
                                }}
                                className="w-full mt-4 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-colors"
                            >
                                Cancel
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Tier Change Modal */}
            <AnimatePresence>
                {showTierModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                        onClick={() => setShowTierModal(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.95 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-slate-800 rounded-2xl border border-slate-700 p-6 w-full max-w-lg"
                        >
                            <h3 className="text-lg font-semibold text-white mb-4">Change Subscription Tier</h3>
                            <div className="space-y-4">
                                {/* Starter Tier */}
                                <button
                                    onClick={() => handleTierChange(showTierModal, 'starter')}
                                    className={cn(
                                        "w-full text-left p-4 rounded-xl border transition-all hover:scale-[1.01]",
                                        tierColors['starter']
                                    )}
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="font-semibold text-lg">Starter</span>
                                        <span className="font-bold">₹1,000/mo</span>
                                    </div>
                                    <ul className="space-y-1.5 text-xs opacity-80">
                                        <li className="flex items-center gap-2">
                                            <Check className="w-3.5 h-3.5" />
                                            Phone Ordering
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <Check className="w-3.5 h-3.5" />
                                            Live Order Queue
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <Check className="w-3.5 h-3.5" />
                                            QR Code Generation
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <Check className="w-3.5 h-3.5" />
                                            Menu Management
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <User className="w-3.5 h-3.5" />
                                            Single Owner Only
                                        </li>
                                    </ul>
                                </button>

                                {/* Pro Tier */}
                                <button
                                    onClick={() => handleTierChange(showTierModal, 'pro')}
                                    className={cn(
                                        "w-full text-left p-4 rounded-xl border transition-all hover:scale-[1.01] relative overflow-hidden",
                                        tierColors['pro']
                                    )}
                                >
                                    <div className="absolute top-2 right-2 px-2 py-0.5 bg-purple-500 text-white text-[10px] font-bold rounded-full uppercase tracking-wider">
                                        Popular
                                    </div>
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="font-semibold text-lg">Pro</span>
                                        <span className="font-bold">₹2,000/mo</span>
                                    </div>
                                    <ul className="space-y-1.5 text-xs opacity-80">
                                        <li className="flex items-center gap-2">
                                            <Check className="w-3.5 h-3.5" />
                                            Everything in Starter
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <Users className="w-3.5 h-3.5 text-purple-400" />
                                            Multi-user Roles (Owner, Manager, Staff)
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <Shield className="w-3.5 h-3.5 text-purple-400" />
                                            Role-based Access Control
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <Check className="w-3.5 h-3.5" />
                                            Analytics Dashboard
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <Check className="w-3.5 h-3.5" />
                                            Inventory Management
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <Check className="w-3.5 h-3.5" />
                                            Custom Branding
                                        </li>
                                    </ul>
                                </button>
                            </div>
                            <button
                                onClick={() => setShowTierModal(null)}
                                className="w-full mt-4 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-colors"
                            >
                                Cancel
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Subscription Dates Modal */}
            <AnimatePresence>
                {showDatesModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                        onClick={() => setShowDatesModal(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.95 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
                        >
                            <div className="px-6 py-5 border-b border-slate-700/70">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-purple-500/20 rounded-xl">
                                        <Calendar className="w-6 h-6 text-purple-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-white">Subscription Dates</h3>
                                        <p className="text-slate-400 text-sm">{showDatesModal.name}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="px-6 py-5 space-y-4 overflow-y-auto">
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="block text-sm font-medium text-slate-300">
                                            Start Date
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => setSubStartDate('')}
                                            className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setActiveDateField('start')}
                                        className={cn(
                                            "w-full px-4 py-2.5 text-left border rounded-xl transition-colors",
                                            activeDateField === 'start'
                                                ? "bg-slate-800 border-purple-500 text-white"
                                                : "bg-slate-900 border-slate-700 text-slate-200 hover:border-slate-500"
                                        )}
                                    >
                                        {subStartDate
                                            ? format(parseDateInput(subStartDate) || new Date(subStartDate), 'dd MMM yyyy')
                                            : 'Select start date'}
                                    </button>
                                    <p className="text-xs text-slate-500 mt-1">When the subscription/trial begins</p>
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="block text-sm font-medium text-slate-300">
                                            End Date
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => setSubEndDate('')}
                                            className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setActiveDateField('end')}
                                        className={cn(
                                            "w-full px-4 py-2.5 text-left border rounded-xl transition-colors",
                                            activeDateField === 'end'
                                                ? "bg-slate-800 border-purple-500 text-white"
                                                : "bg-slate-900 border-slate-700 text-slate-200 hover:border-slate-500"
                                        )}
                                    >
                                        {subEndDate
                                            ? format(parseDateInput(subEndDate) || new Date(subEndDate), 'dd MMM yyyy')
                                            : 'Select end date'}
                                    </button>
                                    <p className="text-xs text-slate-500 mt-1">When the subscription/trial expires</p>
                                </div>

                                <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-700 overflow-auto">
                                    <p className="text-xs text-slate-400 mb-2">
                                        Picking for: <span className="text-slate-200 font-medium">{activeDateField === 'start' ? 'Start Date' : 'End Date'}</span>
                                    </p>
                                    <div className="text-white rounded-xl bg-slate-950/40 border border-slate-800 p-3">
                                        <DayPicker
                                            mode="single"
                                            selected={parseDateInput(activeDateField === 'start' ? subStartDate : subEndDate)}
                                            onSelect={(date) => {
                                                const next = formatDateInput(date);
                                                if (activeDateField === 'start') {
                                                    setSubStartDate(next);
                                                } else {
                                                    setSubEndDate(next);
                                                }
                                            }}
                                            showOutsideDays
                                            className="w-full"
                                            classNames={{
                                                months: 'flex flex-col gap-2',
                                                month: 'space-y-3',
                                                caption: 'flex items-center justify-between',
                                                caption_label: 'text-base font-semibold text-slate-100',
                                                nav: 'flex items-center gap-1',
                                                button_previous: 'h-8 w-8 inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 transition-colors',
                                                button_next: 'h-8 w-8 inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 transition-colors',
                                                weekdays: 'grid grid-cols-7 gap-1',
                                                weekday: 'h-8 flex items-center justify-center text-[11px] font-semibold uppercase tracking-wide text-slate-400',
                                                week: 'grid grid-cols-7 gap-1 mt-1',
                                                day: 'h-9 w-9',
                                                day_button: 'h-9 w-9 rounded-md text-sm text-slate-200 hover:bg-slate-800 transition-colors',
                                                selected: 'bg-cyan-400 text-slate-950 hover:bg-cyan-300 font-semibold',
                                                today: 'ring-1 ring-cyan-500/60',
                                                outside: 'text-slate-500',
                                                disabled: 'text-slate-600 opacity-50',
                                            }}
                                        />
                                    </div>
                                </div>

                                <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-700">
                                    <p className="text-xs text-slate-400 mb-1">Current Tier & Status</p>
                                    <div className="flex items-center gap-2">
                                        <span className={cn(
                                            "px-2 py-0.5 rounded-full text-xs font-medium border",
                                            tierColors[showDatesModal.subscription_tier]
                                        )}>
                                            {tierLabels[showDatesModal.subscription_tier] || showDatesModal.subscription_tier}
                                        </span>
                                        <span className={cn(
                                            "px-2 py-0.5 rounded-full text-xs font-medium border",
                                            statusColors[showDatesModal.subscription_status]
                                        )}>
                                            {showDatesModal.subscription_status}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="px-6 py-4 border-t border-slate-700/70 bg-slate-800/95">
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setShowDatesModal(null)}
                                        className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSaveDates}
                                        disabled={savingDates}
                                        className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors disabled:opacity-50"
                                    >
                                        {savingDates ? 'Saving...' : 'Save Dates'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Password Reset Modal */}
            <AnimatePresence>
                {showPasswordModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                        onClick={() => { setShowPasswordModal(null); setTempPassword(null); setSelectedUser(null); setCustomPassword(''); }}
                    >
                        <motion.div
                            initial={{ scale: 0.95 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.95 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-slate-800 rounded-2xl border border-slate-700 p-6 w-full max-w-md"
                        >
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-3 bg-amber-500/20 rounded-xl">
                                    <Shield className="w-6 h-6 text-amber-400" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-white">Password Override</h3>
                                    <p className="text-slate-400 text-sm">Super Admin Password Reset</p>
                                </div>
                            </div>

                            {tempPassword ? (
                                <div className="space-y-4">
                                    <div className="p-4 bg-green-500/20 border border-green-500/30 rounded-xl">
                                        <p className="text-green-400 text-sm mb-2">Password Set Successfully:</p>
                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 text-white font-mono bg-slate-900 px-3 py-2 rounded-lg text-sm">
                                                {tempPassword}
                                            </code>
                                            <button
                                                onClick={() => copyToClipboard(tempPassword)}
                                                className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                                                title="Copy to clipboard"
                                            >
                                                <Copy className="w-4 h-4 text-slate-400" />
                                            </button>
                                        </div>
                                        <p className="text-green-400/70 text-xs mt-2">User can login immediately with this password</p>
                                    </div>
                                    <button
                                        onClick={() => { setShowPasswordModal(null); setTempPassword(null); setSelectedUser(null); setCustomPassword(''); }}
                                        className="w-full px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors"
                                    >
                                        Done
                                    </button>
                                </div>
                            ) : showPasswordModal.users.length === 0 ? (
                                <div className="text-center py-8">
                                    <p className="text-slate-400">No users found for this restaurant</p>
                                    <button
                                        onClick={() => setShowPasswordModal(null)}
                                        className="mt-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-colors"
                                    >
                                        Close
                                    </button>
                                </div>
                            ) : selectedUser ? (
                                // Custom password input view
                                <div className="space-y-4">
                                    <div className="p-3 bg-slate-700/50 rounded-xl">
                                        <p className="text-slate-400 text-xs">Setting password for:</p>
                                        <p className="text-white font-medium">{selectedUser.email}</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-2">
                                            New Password
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                value={customPassword}
                                                onChange={(e) => setCustomPassword(e.target.value)}
                                                placeholder="Enter new password..."
                                                className="w-full px-4 py-2.5 pr-20 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 font-mono"
                                            />
                                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                                                <button
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors"
                                                    title={showPassword ? 'Hide password' : 'Show password'}
                                                >
                                                    {showPassword ? <EyeOff className="w-4 h-4 text-slate-400" /> : <Eye className="w-4 h-4 text-slate-400" />}
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-1">Minimum 8 characters</p>
                                    </div>

                                    <button
                                        onClick={generateStrongPassword}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-colors"
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                        Generate Strong Password
                                    </button>

                                    <div className="flex gap-3 pt-2">
                                        <button
                                            onClick={() => { setSelectedUser(null); setCustomPassword(''); }}
                                            className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-colors"
                                        >
                                            Back
                                        </button>
                                        <button
                                            onClick={handleSetCustomPassword}
                                            disabled={resettingPassword || customPassword.length < 8}
                                            className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        >
                                            {resettingPassword ? (
                                                <>
                                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                                    Setting...
                                                </>
                                            ) : (
                                                <>
                                                    <Check className="w-4 h-4" />
                                                    Confirm Override
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                // User selection view
                                <div className="space-y-3">
                                    <p className="text-slate-400 text-sm">Select a user to reset their password:</p>
                                    {showPasswordModal.users.map((user) => (
                                        <div key={user.id} className="p-4 bg-slate-700/50 rounded-xl border border-slate-600/50 hover:border-slate-500/50 transition-colors">
                                            <div className="flex items-center justify-between mb-3">
                                                <div>
                                                    <p className="text-white font-medium">{user.email}</p>
                                                    <p className="text-slate-400 text-xs capitalize">{user.role}</p>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleResetPassword(user.id, user.email, true)}
                                                    className="flex-1 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                                                >
                                                    Send Email
                                                </button>
                                                <button
                                                    onClick={() => handleResetPassword(user.id, user.email, false)}
                                                    className="flex-1 px-3 py-2 text-sm bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors"
                                                >
                                                    Auto Generate
                                                </button>
                                                <button
                                                    onClick={() => { setSelectedUser({ id: user.id, email: user.email, role: user.role }); generateStrongPassword(); }}
                                                    className="flex-1 px-3 py-2 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors"
                                                >
                                                    Set Custom
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    <button
                                        onClick={() => setShowPasswordModal(null)}
                                        className="w-full px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-colors mt-2"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Click outside to close menu */}
            {activeMenu && (
                <div
                    className="fixed inset-0 z-10"
                    onClick={() => setActiveMenu(null)}
                />
            )}
        </div>
    );
}
