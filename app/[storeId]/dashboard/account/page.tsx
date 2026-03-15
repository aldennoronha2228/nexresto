'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    User, Mail, Shield, Lock, ShieldAlert, Loader2,
    Trash2, Plus, UserPlus, ShieldCheck, Key, FileText, Sparkles,
    ChevronDown, Crown, Users, Briefcase, ToggleLeft, ToggleRight, UserX, Copy, Check
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSuperAdminAuth } from '@/context/SuperAdminAuthContext';
import { useRestaurant } from '@/hooks/useRestaurant';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { auth } from '@/lib/firebase';
import { RoleGuard } from '@/components/dashboard/RoleGuard';

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
    const { user, subscriptionTier } = useAuth();
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

    // ─── Security Token Storage ───────────────────────────────────────────────
    // Once verified, we keep the clean key here to use for all actions.
    const [verifiedMasterKey, setVerifiedMasterKey] = useState<string>('');

    // Get team limit based on tier (must be after admins state is declared)
    const teamLimit = isPro ? TEAM_LIMITS.pro : TEAM_LIMITS.starter;
    const teamCount = admins.length;
    const canAddMore = teamCount < teamLimit;
    const isAtLimit = teamCount >= teamLimit;

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

                {/* Admin Management Protection Gate */}
                <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden">
                    <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center">
                                <Key className="w-5 h-5 text-slate-500" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-900 leading-tight">Admin Management</h3>
                                <p className="text-xs text-slate-500 mt-0.5">Control who can access the dashboard</p>
                            </div>
                        </div>
                        {!isUnlocked ? (
                            <button
                                onClick={() => setShowGate(true)}
                                className="text-sm font-semibold text-blue-600 hover:text-blue-700 underline underline-offset-4"
                            >
                                Open Management
                            </button>
                        ) : (
                            <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] uppercase font-bold tracking-wider">
                                Unlocked
                            </span>
                        )}
                    </div>

                    <div className="p-6">
                        <AnimatePresence mode="wait">
                            {!isUnlocked ? (
                                showGate ? (
                                    <motion.div
                                        key="gate" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                        className="max-w-md mx-auto py-8 text-center"
                                    >
                                        <div className="w-16 h-16 rounded-2xl bg-amber-50 mx-auto flex items-center justify-center mb-4">
                                            <Lock className="w-8 h-8 text-amber-500" />
                                        </div>
                                        <h4 className="font-bold text-slate-900">Privileged Access Required</h4>
                                        <p className="text-xs text-slate-500 mt-1 mb-6 leading-relaxed">
                                            Managing administrators requires a master access key.<br />Please enter it to reveal the controls.
                                        </p>
                                        <form onSubmit={handleGateSubmit} className="space-y-3">
                                            <input
                                                type="password"
                                                value={gatePassword}
                                                onChange={e => setGatePassword(e.target.value)}
                                                placeholder="Enter Admin Access Key"
                                                className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/30 transition-all font-mono"
                                                required
                                            />
                                            <button
                                                type="submit"
                                                disabled={gateLoading}
                                                className="w-full h-11 bg-slate-900 text-white rounded-xl font-semibold text-sm hover:bg-slate-800 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                            >
                                                {gateLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Unlock Controls'}
                                            </button>
                                            <button onClick={() => setShowGate(false)} type="button" className="text-xs text-slate-500 hover:text-slate-900">Cancel</button>
                                        </form>
                                    </motion.div>
                                ) : (
                                    <div key="inactive" className="py-12 text-center opacity-40">
                                        <ShieldAlert className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                                        <p className="text-sm font-medium text-slate-500 italic">Management controls are currently locked.</p>
                                    </div>
                                )
                            ) : (
                                <motion.div
                                    key="controls" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                    className="space-y-6"
                                >
                                    {/* Capacity Tracker & Limitation Banner */}
                                    <div className={cn(
                                        "rounded-2xl border p-5 mb-4",
                                        isAtLimit
                                            ? "bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200/60"
                                            : "bg-gradient-to-r from-slate-50 to-blue-50 border-slate-200/60"
                                    )}>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={cn(
                                                    "w-10 h-10 rounded-xl flex items-center justify-center",
                                                    isAtLimit
                                                        ? "bg-gradient-to-br from-amber-500 to-orange-500"
                                                        : "bg-gradient-to-br from-blue-500 to-indigo-500"
                                                )}>
                                                    <Users className="w-5 h-5 text-white" />
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-slate-900 leading-tight flex items-center gap-2">
                                                        Team Accounts
                                                        <span className={cn(
                                                            "text-sm font-semibold px-2 py-0.5 rounded-lg",
                                                            isAtLimit ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                                                        )}>
                                                            {teamCount} / {teamLimit}
                                                        </span>
                                                    </h4>
                                                    <p className="text-xs text-slate-600 mt-0.5">
                                                        {isPro
                                                            ? isAtLimit
                                                                ? "Pro tier limit reached. Contact support if you need more."
                                                                : `Pro tier: ${teamLimit - teamCount} slot${teamLimit - teamCount !== 1 ? 's' : ''} remaining`
                                                            : isAtLimit
                                                                ? "Upgrade to Pro for up to 10 staff accounts"
                                                                : `Starter tier: ${teamLimit - teamCount} slot${teamLimit - teamCount !== 1 ? 's' : ''} remaining`
                                                        }
                                                    </p>
                                                </div>
                                            </div>
                                            {!isPro && (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full text-[10px] font-bold">
                                                    <Sparkles className="w-3 h-3" />
                                                    UPGRADE
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Add Admin Form */}
                                    <div className="bg-slate-50/50 rounded-2xl border border-slate-200/60 p-5">
                                        <div className="flex flex-col gap-3">
                                            <div className="flex flex-col sm:flex-row gap-3">
                                                <div className="relative flex-1">
                                                    <UserPlus className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                    <input
                                                        type="email"
                                                        value={newAdminEmail}
                                                        onChange={e => setNewAdminEmail(e.target.value)}
                                                        placeholder="Enter new admin email (e.g., manager@hotel.com)"
                                                        className={cn(
                                                            "w-full h-11 pl-10 pr-4 bg-white border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/30",
                                                            isAtLimit ? "border-slate-200 bg-slate-100 cursor-not-allowed" : "border-slate-200"
                                                        )}
                                                        disabled={isAtLimit}
                                                    />
                                                </div>

                                                {/* Role Dropdown - Pro Only */}
                                                {isPro ? (
                                                    <div className="relative">
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                                                            className="h-11 px-4 bg-white border border-slate-200 rounded-xl text-sm flex items-center gap-2 min-w-[140px] hover:border-slate-300 transition-colors"
                                                        >
                                                            {(() => {
                                                                const role = ROLES.find(r => r.value === newAdminRole);
                                                                const Icon = role?.icon || Users;
                                                                return (
                                                                    <>
                                                                        <Icon className="w-4 h-4 text-slate-500" />
                                                                        <span className="flex-1 text-left font-medium text-slate-700">{role?.label || 'Staff'}</span>
                                                                        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[9px] font-bold uppercase tracking-wider rounded-full">
                                                                            <Sparkles className="w-2.5 h-2.5" />
                                                                            Pro
                                                                        </span>
                                                                        <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", showRoleDropdown && "rotate-180")} />
                                                                    </>
                                                                );
                                                            })()}
                                                        </button>

                                                        {showRoleDropdown && (
                                                            <div className="absolute bottom-full left-0 mb-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 max-h-60 overflow-y-auto overscroll-contain z-50">
                                                                {ROLES.map((role) => (
                                                                    <button
                                                                        key={role.value}
                                                                        type="button"
                                                                        onClick={() => { setNewAdminRole(role.value); setShowRoleDropdown(false); }}
                                                                        className={cn(
                                                                            "w-full px-4 py-3 flex items-start gap-3 hover:bg-slate-50 transition-colors text-left",
                                                                            newAdminRole === role.value && "bg-blue-50"
                                                                        )}
                                                                    >
                                                                        <role.icon className={cn("w-5 h-5 mt-0.5", newAdminRole === role.value ? "text-blue-600" : "text-slate-400")} />
                                                                        <div>
                                                                            <div className={cn("font-semibold text-sm", newAdminRole === role.value ? "text-blue-600" : "text-slate-900")}>{role.label}</div>
                                                                            <div className="text-xs text-slate-500 mt-0.5">{role.description}</div>
                                                                        </div>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="h-11 px-4 bg-slate-100 border border-slate-200 rounded-xl text-sm flex items-center gap-2 min-w-[140px] opacity-60">
                                                        <Crown className="w-4 h-4 text-slate-400" />
                                                        <span className="flex-1 text-left font-medium text-slate-500">Owner Only</span>
                                                    </div>
                                                )}

                                                <button
                                                    onClick={handleAddAdmin}
                                                    disabled={addingAdmin || !newAdminEmail || isAtLimit}
                                                    className="h-11 px-6 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                                                    title={isAtLimit ? `Account limit reached. ${isPro ? 'Maximum 10 team members.' : 'Upgrade to Pro for up to 10 staff accounts.'}` : undefined}
                                                >
                                                    {addingAdmin ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                                                    Send Invite
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Admins Table */}
                                    <div className="overflow-hidden border border-slate-100 rounded-2xl">
                                        <table className="w-full text-left text-sm">
                                            <thead className="bg-slate-50/50 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                                                <tr>
                                                    <th className="px-4 py-3">Admin Email</th>
                                                    <th className="px-4 py-3">Role</th>
                                                    <th className="px-4 py-3">Temp Password</th>
                                                    <th className="px-4 py-3">Status</th>
                                                    <th className="px-4 py-3 text-right">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {admins.map((admin) => {
                                                    // Get role with fallback to 'owner'
                                                    const adminRole = admin.role || 'owner';
                                                    const roleInfo = ROLES.find(r => r.value === adminRole) || ROLES[0];
                                                    const RoleIcon = roleInfo.icon;

                                                    // Role badge colors: Purple for Owner, Blue for Manager, Slate for Staff
                                                    const roleColors = {
                                                        owner: 'bg-purple-100 text-purple-700',
                                                        manager: 'bg-blue-100 text-blue-700',
                                                        staff: 'bg-slate-100 text-slate-600',
                                                    };
                                                    const badgeColor = roleColors[adminRole as keyof typeof roleColors] || roleColors.staff;

                                                    return (
                                                        <tr key={admin.email} className="hover:bg-slate-50/30 transition-colors">
                                                            <td className="px-4 py-4 font-medium text-slate-900">{admin.email}</td>
                                                            <td className="px-4 py-4">
                                                                <span className={cn(
                                                                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold",
                                                                    badgeColor
                                                                )}>
                                                                    <RoleIcon className="w-3.5 h-3.5" />
                                                                    {roleInfo.label}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                {admin.temp_password ? (
                                                                    <div className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
                                                                        <span className="font-mono text-xs text-slate-700 select-all">{admin.temp_password}</span>
                                                                        <button
                                                                            onClick={() => {
                                                                                navigator.clipboard.writeText(admin.temp_password || '');
                                                                                setCopiedRowEmail(admin.email);
                                                                                setTimeout(() => setCopiedRowEmail(null), 1500);
                                                                            }}
                                                                            className={cn(
                                                                                "p-1 rounded transition-colors",
                                                                                copiedRowEmail === admin.email
                                                                                    ? "bg-emerald-100 text-emerald-600"
                                                                                    : "text-slate-500 hover:bg-slate-200"
                                                                            )}
                                                                            title="Copy temporary password"
                                                                        >
                                                                            {copiedRowEmail === admin.email ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-xs text-slate-400">-</span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                <span className={cn(
                                                                    "px-2 py-0.5 rounded-full text-[10px] font-bold",
                                                                    admin.is_active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500 italic"
                                                                )}>
                                                                    {admin.is_active ? 'Active' : 'Inactive'}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-4 text-right">
                                                                <div className="flex items-center justify-end gap-1">
                                                                    <button
                                                                        onClick={() => handleToggleAdmin(admin.email, admin.is_active)}
                                                                        className={cn(
                                                                            "p-2 rounded-lg transition-colors",
                                                                            admin.is_active
                                                                                ? "text-amber-600 hover:bg-amber-50"
                                                                                : "text-emerald-600 hover:bg-emerald-50"
                                                                        )}
                                                                        title={admin.is_active ? 'Deactivate' : 'Reactivate'}
                                                                    >
                                                                        {admin.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleIssueTempPassword(admin.email)}
                                                                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                                        title="Generate temporary password"
                                                                    >
                                                                        <Key className="w-4 h-4" />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDeleteAdmin(admin.email)}
                                                                        className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                                                        title="Delete permanently"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            {/* New User Credentials Modal */}
            <AnimatePresence>
                {showCredentials && newUserCredentials && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                        onClick={() => setShowCredentials(false)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-4">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <ShieldCheck className="w-5 h-5" />
                                    Team Member Created
                                </h3>
                                <p className="text-emerald-100 text-sm mt-1">
                                    Share these credentials with the new team member
                                </p>
                            </div>

                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                                        Email
                                    </label>
                                    <div className="bg-slate-50 rounded-lg px-4 py-3 font-mono text-sm text-slate-700">
                                        {newUserCredentials.email}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                                        Temporary Password
                                    </label>
                                    <div className="bg-slate-50 rounded-lg px-4 py-3 font-mono text-sm text-slate-700 flex items-center justify-between gap-2">
                                        <span className="select-all">{newUserCredentials.password}</span>
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(newUserCredentials.password);
                                                setCopiedPassword(true);
                                                setTimeout(() => setCopiedPassword(false), 2000);
                                            }}
                                            className={cn(
                                                "p-2 rounded-lg transition-all",
                                                copiedPassword
                                                    ? "bg-emerald-100 text-emerald-600"
                                                    : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                                            )}
                                            title="Copy password"
                                        >
                                            {copiedPassword ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                                    <p className="text-amber-800 text-sm">
                                        <strong>Important:</strong> This password is also visible in the unlocked Admin Management table until the user changes it. On first login they are automatically redirected to the Change Password screen before dashboard access.
                                    </p>
                                </div>

                                <button
                                    onClick={() => {
                                        setShowCredentials(false);
                                        setNewUserCredentials(null);
                                        setCopiedPassword(false);
                                    }}
                                    className="w-full py-3 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800 transition-colors"
                                >
                                    Done
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

        </RoleGuard>
    );
}

const cn = (...classes: any[]) => classes.filter(Boolean).join(' ');
