'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    User, Mail, Shield, Lock, ShieldAlert, Loader2,
    Trash2, Plus, UserPlus, ShieldCheck, Key, FileText, Sparkles,
    ChevronDown, Crown, Users, Briefcase, ToggleLeft, ToggleRight, UserX, Copy, Check, CreditCard, CalendarDays
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSuperAdminAuth } from '@/context/SuperAdminAuthContext';
import { useRestaurant } from '@/hooks/useRestaurant';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { auth } from '@/lib/firebase';
import { RoleGuard } from '@/components/dashboard/RoleGuard';
import { UpgradeModal } from '@/components/dashboard/UpgradeModal';

interface AdminUser {
    email: string;
    is_active: boolean;
    created_at: string;
    role?: string;
    temp_password?: string;
}

// Available roles for Pro tier
const ROLES = [
    { value: 'owner', label: 'Owner', description: 'Full access to all features', icon: Crown },
    { value: 'manager', label: 'Manager', description: 'Can manage operations but not billing', icon: Briefcase },
    { value: 'staff', label: 'Staff', description: 'Orders and tables only', icon: Users },
];

// Team member limits per tier
const TEAM_LIMITS = {
    starter: 2,
    pro: 10,
};

export default function AccountPage() {
    const { user, subscriptionTier, subscriptionStatus, subscriptionEndDate, subscriptionDaysRemaining } = useAuth();
    const { session: superAdminSession } = useSuperAdminAuth();
    const { storeId: tenantId, isSuperAdmin } = useRestaurant();

    const activeUser = user || superAdminSession?.user;

    // Check if Pro tier or God Mode
    const isPro = isSuperAdmin || subscriptionTier === 'pro' || subscriptionTier === '2k' || subscriptionTier === '2.5k';

    // ─── Email Reports State ──────────────────────────────────────────────────
    const [emailReportsEnabled, setEmailReportsEnabled] = useState(false);
    const [emailReportsLoading, setEmailReportsLoading] = useState(false);

    // ─── Protected Management State ───────────────────────────────────────────
    /**
     * "State Management" is how we keep track of what is happening in the app.
     * Here, 'isUnlocked' tells the app IF the admin management list should be shown.
     */
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [gatePassword, setGatePassword] = useState('');
    const [gateLoading, setGateLoading] = useState(false);
    const [admins, setAdmins] = useState<AdminUser[]>([]);
    const [loadingAdmins, setLoadingAdmins] = useState(false);
    const [newAdminEmail, setNewAdminEmail] = useState('');
    const [newAdminRole, setNewAdminRole] = useState<string>('staff');
    const [addingAdmin, setAddingAdmin] = useState(false);
    const [showGate, setShowGate] = useState(false);
    const [showRoleDropdown, setShowRoleDropdown] = useState(false);

    // ─── New User Credentials Modal ───────────────────────────────────────────
    const [showCredentials, setShowCredentials] = useState(false);
    const [newUserCredentials, setNewUserCredentials] = useState<{ email: string; password: string } | null>(null);
    const [copiedPassword, setCopiedPassword] = useState(false);
    const [copiedRowEmail, setCopiedRowEmail] = useState<string | null>(null);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    // ─── Security Token Storage ───────────────────────────────────────────────
    // Once verified, we keep the clean key here to use for all actions.
    const [verifiedMasterKey, setVerifiedMasterKey] = useState<string>('');

    // Get team limit based on tier (must be after admins state is declared)
    const teamLimit = isPro ? TEAM_LIMITS.pro : TEAM_LIMITS.starter;
    const teamCount = admins.length;
    const canAddMore = teamCount < teamLimit;
    const isAtLimit = teamCount >= teamLimit;
    const tierLabel =
        subscriptionTier === '2.5k' ? 'Enterprise ₹2.5k' :
            subscriptionTier === '2k' ? 'Pro ₹2k' :
                subscriptionTier === '1k' ? 'Basic ₹1k' :
                    subscriptionTier === 'pro' ? 'Pro' : 'Starter';
    const statusLabel = (subscriptionStatus || 'active').replace('_', ' ');

    // ─── Fetch Admins (Privileged) ───────────────────────────────────────────
    const fetchAdmins = async (key: string) => {
        const cleanKey = key.trim();
        if (!tenantId) {
            toast.error('Restaurant context missing. Please refresh and try again.');
            return;
        }
        setLoadingAdmins(true);
        try {
            // cb=... is a cache-buster. It forces the browser to get fresh data.
            const res = await fetch(`/api/admin/manage?tenant_id=${encodeURIComponent(tenantId)}&cb=${Date.now()}`, {
                method: 'GET',
                headers: { 'x-admin-key': cleanKey }
            });

            console.log('[AccountPage] fetch status:', res.status, res.ok);

            const text = await res.text();
            console.log('[AccountPage] Raw response from server:', text);

            let data: any;
            try {
                data = JSON.parse(text);
            } catch (err) {
                console.error('[AccountPage] JSON parse failed. Body snippet:', text.slice(0, 50));
                throw new Error(`Server Error: Unexpected response format. (Status: ${res.status})`);
            }

            if (!res.ok) {
                console.warn('[AccountPage] fetch error:', data.error);
                throw new Error(data.error || 'Access Denied');
            }

            setAdmins(data);

            // SUCCESS: We store this key for all future actions during this session.
            setVerifiedMasterKey(cleanKey);

            setIsUnlocked(true);
            setShowGate(false);
            toast.success('Admin management unlocked');
        } catch (err: any) {
            console.error('[AccountPage] fetchAdmins catch:', err);
            toast.error(err.message);
            setIsUnlocked(false);
        } finally {
            setLoadingAdmins(false);
        }
    };

    const handleGateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanKey = gatePassword.trim();
        if (!cleanKey) {
            toast.error('The Admin Master Key cannot be empty.');
            return;
        }
        setGateLoading(true);
        await fetchAdmins(cleanKey);
        setGateLoading(false);
    };

    const handleAddAdmin = async (e: React.FormEvent) => {
        e.preventDefault();

        // Check team limit
        if (isAtLimit) {
            if (isPro) {
                toast.error(`Pro tier allows maximum ${teamLimit} team members. Contact support if you need more.`);
            } else {
                toast.error(`Starter tier allows maximum ${teamLimit} team members. Upgrade to Pro for up to 10 staff accounts.`);
            }
            return;
        }

        setAddingAdmin(true);
        try {
            const res = await fetch(`/api/admin/manage?cb=${Date.now()}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-key': verifiedMasterKey.trim()
                },
                body: JSON.stringify({
                    email: newAdminEmail,
                    action: 'add',
                    role: isPro ? newAdminRole : 'owner', // Starter always gets owner role
                    tenantId: tenantId, // For server-side limit check
                    subscriptionTier: subscriptionTier // For server-side limit check
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            // If a temporary password was generated, show the credentials modal
            if (data.tempPassword) {
                setNewUserCredentials({ email: newAdminEmail, password: data.tempPassword });
                setShowCredentials(true);
                toast.success('Team member created! Share the credentials below.');
            } else {
                toast.success(data.message);
            }

            setNewAdminEmail('');
            setNewAdminRole('staff');
            fetchAdmins(verifiedMasterKey);
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setAddingAdmin(false);
        }
    };

    const handleToggleAdmin = async (email: string, currentlyActive: boolean) => {
        const action = currentlyActive ? 'remove' : 'reactivate';
        try {
            const res = await fetch(`/api/admin/manage?cb=${Date.now()}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-key': verifiedMasterKey.trim()
                },
                body: JSON.stringify({ email, action, tenantId })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            toast.success(currentlyActive ? 'Admin deactivated' : 'Admin reactivated');
            fetchAdmins(verifiedMasterKey);
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    const handleDeleteAdmin = async (email: string) => {
        if (!confirm(`Permanently delete ${email}? This cannot be undone.`)) return;
        try {
            const res = await fetch(`/api/admin/manage?cb=${Date.now()}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-key': verifiedMasterKey.trim()
                },
                body: JSON.stringify({ email, action: 'delete', tenantId })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            toast.success('Admin permanently deleted');
            fetchAdmins(verifiedMasterKey);
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    const handleIssueTempPassword = async (email: string) => {
        try {
            const res = await fetch(`/api/admin/manage?cb=${Date.now()}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-key': verifiedMasterKey.trim(),
                },
                body: JSON.stringify({ email, action: 'issue_temp_password', tenantId }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to issue temporary password');

            if (data.tempPassword) {
                setNewUserCredentials({ email, password: data.tempPassword });
                setShowCredentials(true);
            }

            toast.success('Temporary password generated.');
            fetchAdmins(verifiedMasterKey);
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    // ─── Email Reports Toggle ─────────────────────────────────────────────────
    const fetchEmailReportsSetting = useCallback(async () => {
        if (!tenantId || !isPro) return;

        try {
            const token = await auth.currentUser?.getIdToken();
            const res = await fetch(`/api/reports/settings?restaurantId=${tenantId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.emailReportsEnabled !== undefined) {
                setEmailReportsEnabled(data.emailReportsEnabled);
            }
        } catch (err) {
            console.error('Failed to fetch report settings');
        }
    }, [tenantId, isPro]);

    useEffect(() => {
        fetchEmailReportsSetting();
    }, [fetchEmailReportsSetting]);

    const handleToggleEmailReports = async () => {
        if (!tenantId) return;

        setEmailReportsLoading(true);
        try {
            const token = await auth.currentUser?.getIdToken();
            const res = await fetch('/api/reports/settings', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    restaurantId: tenantId,
                    emailReportsEnabled: !emailReportsEnabled
                })
            });

            const data = await res.json();
            if (data.upgrade) {
                toast.error('Email Reports are a Pro feature');
            } else if (data.error) {
                toast.error(data.error);
            } else {
                setEmailReportsEnabled(!emailReportsEnabled);
                toast.success(emailReportsEnabled ? 'Email reports disabled' : 'Email reports enabled');
            }
        } catch (err) {
            toast.error('Failed to update setting');
        } finally {
            setEmailReportsLoading(false);
        }
    };

    return (
        <RoleGuard requiredPermission="can_view_account">
            <div className="max-w-4xl mx-auto space-y-6">
                <header className="mb-8">
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Account Settings</h1>
                    <p className="text-slate-500 text-sm mt-1">Manage your profile and dashboard permissions.</p>
                </header>

                {/* Profile Overview Card */}
                <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden p-6 lg:p-8">
                    <div className="flex flex-col md:flex-row items-center gap-6">
                        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white text-3xl font-bold shadow-xl shadow-blue-500/20">
                            {activeUser?.email?.[0]?.toUpperCase() || 'A'}
                        </div>
                        <div className="flex-1 text-center md:text-left">
                            <h2 className="text-xl font-bold text-slate-900">
                                {isSuperAdmin ? 'Super Admin (God Mode)' : (activeUser?.displayName || 'Admin User')}
                            </h2>
                            <div className="flex items-center justify-center md:justify-start gap-2 mt-1.5 text-slate-500 text-sm">
                                <Mail className="w-4 h-4" />
                                {activeUser?.email}
                            </div>
                            <div className="mt-4 flex flex-wrap justify-center md:justify-start gap-2">
                                <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-semibold flex items-center gap-1.5">
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                    Active Admin
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Email Reports Toggle (Pro Only) */}
                <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-visible">
                    <div className="px-6 py-5 flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                                <CreditCard className="w-5 h-5 text-indigo-600" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-900 leading-tight">Subscription Settings</h3>
                                <p className="text-xs text-slate-500 mt-0.5">Manage your current plan from Account Settings.</p>
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-100 text-indigo-700">
                                        {tierLabel}
                                    </span>
                                    <span className={cn(
                                        'px-2.5 py-1 rounded-full text-[11px] font-semibold',
                                        subscriptionStatus === 'active' || subscriptionStatus === 'trial'
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : subscriptionStatus === 'past_due'
                                                ? 'bg-amber-100 text-amber-700'
                                                : 'bg-rose-100 text-rose-700'
                                    )}>
                                        {statusLabel}
                                    </span>
                                </div>
                                {!!subscriptionEndDate && (
                                    <div className="mt-2 text-xs text-slate-500 flex items-center gap-1.5">
                                        <CalendarDays className="w-3.5 h-3.5" />
                                        Ends on {subscriptionEndDate}
                                        {typeof subscriptionDaysRemaining === 'number' && (
                                            <span className="text-slate-400">({subscriptionDaysRemaining} day{subscriptionDaysRemaining === 1 ? '' : 's'} left)</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="shrink-0">
                            <button
                                type="button"
                                onClick={() => setShowUpgradeModal(true)}
                                className="h-10 px-4 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
                            >
                                Manage Plan
                            </button>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-visible">
                    <div className="px-6 py-5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center",
                                isPro ? "bg-blue-50" : "bg-slate-100"
                            )}>
                                <FileText className={cn("w-5 h-5", isPro ? "text-blue-600" : "text-slate-400")} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-900 leading-tight flex items-center gap-2">
                                    Daily Email Reports
                                    {!isPro && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-[10px] font-bold">
                                            <Sparkles className="w-3 h-3" />
                                            PRO
                                        </span>
                                    )}
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {isPro
                                        ? "Receive automated sales reports in your inbox every morning"
                                        : "Upgrade to Pro to receive daily sales reports via email"
                                    }
                                </p>
                            </div>
                        </div>
                        {isPro ? (
                            <div className="flex items-center gap-3">
                                <span className={cn(
                                    "text-xs font-medium",
                                    emailReportsEnabled ? "text-emerald-600" : "text-slate-400"
                                )}>
                                    {emailReportsEnabled ? 'Enabled' : 'Disabled'}
                                </span>
                                <Switch
                                    checked={emailReportsEnabled}
                                    onCheckedChange={handleToggleEmailReports}
                                    disabled={emailReportsLoading}
                                />
                            </div>
                        ) : (
                            <div className="px-3 py-1.5 bg-slate-100 text-slate-500 rounded-full text-xs font-medium">
                                Upgrade Required
                            </div>
                        )}
                    </div>
                </div>

            </div>

            <UpgradeModal
                isOpen={showUpgradeModal}
                onClose={() => setShowUpgradeModal(false)}
                featureName="Subscription Settings"
            />

        </RoleGuard>
    );
}

const cn = (...classes: any[]) => classes.filter(Boolean).join(' ');
