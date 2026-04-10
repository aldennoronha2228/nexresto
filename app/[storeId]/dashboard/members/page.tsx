'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
    Loader2,
    Key,
    Sparkles,
    Users,
    UserPlus,
    ChevronDown,
    Crown,
    Briefcase,
    ChefHat,
    ToggleLeft,
    ToggleRight,
    Trash2,
    Copy,
    Check,
    ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useRestaurant } from '@/hooks/useRestaurant';
import { RoleGuard } from '@/components/dashboard/RoleGuard';
import { UpgradeModal } from '@/components/dashboard/UpgradeModal';

interface AdminUser {
    email: string;
    is_active: boolean;
    created_at: string;
    role?: string;
    temp_password?: string;
}

const ROLES = [
    { value: 'owner', label: 'Owner', description: 'Full access to all features', icon: Crown },
    { value: 'manager', label: 'Manager', description: 'Can manage operations but not billing', icon: Briefcase },
    { value: 'kitchen', label: 'Kitchen', description: 'Kitchen Display (KDS) access only', icon: ChefHat },
    { value: 'staff', label: 'Staff', description: 'Orders and tables only', icon: Users },
];

const TEAM_LIMITS = {
    starter: 2,
    pro: 10,
};

export default function MembersPage() {
    const { subscriptionTier } = useAuth();
    const { storeId: tenantId, isSuperAdmin } = useRestaurant();

    const isPro = isSuperAdmin || subscriptionTier === 'pro' || subscriptionTier === '2k' || subscriptionTier === '2.5k';

    const [admins, setAdmins] = useState<AdminUser[]>([]);
    const [loadingAdmins, setLoadingAdmins] = useState(false);
    const [newAdminEmail, setNewAdminEmail] = useState('');
    const [newAdminRole, setNewAdminRole] = useState<string>('staff');
    const [addingAdmin, setAddingAdmin] = useState(false);
    const [showRoleDropdown, setShowRoleDropdown] = useState(false);
    const [showCredentials, setShowCredentials] = useState(false);
    const [newUserCredentials, setNewUserCredentials] = useState<{ email: string; password: string } | null>(null);
    const [copiedPassword, setCopiedPassword] = useState(false);
    const [copiedRowEmail, setCopiedRowEmail] = useState<string | null>(null);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    const teamLimit = isPro ? TEAM_LIMITS.pro : TEAM_LIMITS.starter;
    const teamCount = admins.length;
    const isAtLimit = teamCount >= teamLimit;

    const getAuthToken = async () => {
        const user = auth.currentUser;
        if (!user) {
            throw new Error('Session expired. Please sign in again.');
        }
        return user.getIdToken(true);
    };

    const fetchAdmins = async () => {
        if (!tenantId) return;

        setLoadingAdmins(true);
        try {
            const token = await getAuthToken();
            const res = await fetch(`/api/admin/manage?tenant_id=${encodeURIComponent(tenantId)}&cb=${Date.now()}`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}` },
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.error || 'Failed to load members');
            }

            setAdmins(Array.isArray(data) ? data : []);
        } catch (err: any) {
            toast.error(err?.message || 'Unable to load members');
        } finally {
            setLoadingAdmins(false);
        }
    };

    useEffect(() => {
        fetchAdmins();
    }, [tenantId]);

    const handleAddAdmin = async () => {
        if (isAtLimit) {
            if (isPro) {
                toast.error(`Pro tier allows maximum ${teamLimit} team members. Contact support if you need more.`);
            } else {
                toast.error(`Starter tier allows maximum ${teamLimit} team members. Upgrade to Pro for up to 10 staff accounts.`);
            }
            return;
        }

        if (!tenantId) {
            toast.error('Restaurant context missing. Please refresh and try again.');
            return;
        }

        setAddingAdmin(true);
        try {
            const token = await getAuthToken();
            const res = await fetch(`/api/admin/manage?cb=${Date.now()}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    email: newAdminEmail,
                    action: 'add',
                    role: isPro ? newAdminRole : 'owner',
                    tenantId,
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            if (data.tempPassword) {
                setNewUserCredentials({ email: newAdminEmail, password: data.tempPassword });
                setShowCredentials(true);
                toast.success('Team member created! Share the credentials below.');
            } else {
                toast.success(data.message || 'Team member added');
            }

            setNewAdminEmail('');
            setNewAdminRole('staff');
            await fetchAdmins();
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setAddingAdmin(false);
        }
    };

    const performMemberAction = async (payload: Record<string, unknown>, successMessage: string) => {
        const token = await getAuthToken();
        const res = await fetch(`/api/admin/manage?cb=${Date.now()}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        toast.success(successMessage);
        await fetchAdmins();
        return data;
    };

    const handleToggleAdmin = async (email: string, currentlyActive: boolean) => {
        try {
            await performMemberAction(
                { email, action: currentlyActive ? 'remove' : 'reactivate', tenantId },
                currentlyActive ? 'Member deactivated' : 'Member reactivated'
            );
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    const handleDeleteAdmin = async (email: string) => {
        if (!confirm(`Permanently delete ${email}? This cannot be undone.`)) return;

        try {
            await performMemberAction({ email, action: 'delete', tenantId }, 'Member permanently deleted');
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    const handleIssueTempPassword = async (email: string) => {
        try {
            const data = await performMemberAction(
                { email, action: 'issue_temp_password', tenantId },
                'Temporary password generated.'
            );

            if (data?.tempPassword) {
                setNewUserCredentials({ email, password: data.tempPassword });
                setShowCredentials(true);
            }
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    return (
        <RoleGuard requiredPermission="can_manage_admins">
            <div className="max-w-5xl mx-auto space-y-6">
                <header className="mb-8">
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Members</h1>
                    <p className="text-slate-500 text-sm mt-1">Owner-only control for dashboard members.</p>
                </header>

                <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden">
                    <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center">
                            <Key className="w-5 h-5 text-slate-500" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-slate-900 leading-tight">Members Management</h3>
                            <p className="text-xs text-slate-500 mt-0.5">No extra unlock password required. Owner access only.</p>
                        </div>
                    </div>

                    <div className="p-6 space-y-6">
                        <div
                            className={cn(
                                'rounded-2xl border p-5',
                                isAtLimit
                                    ? 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200/60'
                                    : 'bg-gradient-to-r from-slate-50 to-blue-50 border-slate-200/60'
                            )}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div
                                        className={cn(
                                            'w-10 h-10 rounded-xl flex items-center justify-center',
                                            isAtLimit
                                                ? 'bg-gradient-to-br from-amber-500 to-orange-500'
                                                : 'bg-gradient-to-br from-blue-500 to-indigo-500'
                                        )}
                                    >
                                        <Users className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-900 leading-tight flex items-center gap-2">
                                            Team Accounts
                                            <span
                                                className={cn(
                                                    'text-sm font-semibold px-2 py-0.5 rounded-lg',
                                                    isAtLimit ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                                                )}
                                            >
                                                {teamCount} / {teamLimit}
                                            </span>
                                        </h4>
                                        <p className="text-xs text-slate-600 mt-0.5">
                                            {isPro
                                                ? isAtLimit
                                                    ? 'Pro tier limit reached. Contact support if you need more.'
                                                    : `Pro tier: ${teamLimit - teamCount} slot${teamLimit - teamCount !== 1 ? 's' : ''} remaining`
                                                : isAtLimit
                                                  ? 'Upgrade to Pro for up to 10 staff accounts'
                                                  : `Starter tier: ${teamLimit - teamCount} slot${teamLimit - teamCount !== 1 ? 's' : ''} remaining`}
                                        </p>
                                    </div>
                                </div>
                                {!isPro && (
                                    <button
                                        type="button"
                                        onClick={() => setShowUpgradeModal(true)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full text-[10px] font-bold"
                                    >
                                        <Sparkles className="w-3 h-3" />
                                        UPGRADE
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="bg-slate-50/50 rounded-2xl border border-slate-200/60 p-5">
                            <div className="flex flex-col gap-3">
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <div className="relative flex-1">
                                        <UserPlus className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            type="email"
                                            value={newAdminEmail}
                                            onChange={(e) => setNewAdminEmail(e.target.value)}
                                            placeholder="Enter new admin email (e.g., manager@hotel.com)"
                                            className={cn(
                                                'w-full h-11 pl-10 pr-4 bg-white border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/30',
                                                isAtLimit ? 'border-slate-200 bg-slate-100 cursor-not-allowed' : 'border-slate-200'
                                            )}
                                            disabled={isAtLimit}
                                        />
                                    </div>

                                    {isPro ? (
                                        <div className="relative">
                                            <button
                                                type="button"
                                                onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                                                className="h-11 px-4 bg-white border border-slate-200 rounded-xl text-sm flex items-center gap-2 min-w-[140px] hover:border-slate-300 transition-colors"
                                            >
                                                {(() => {
                                                    const role = ROLES.find((r) => r.value === newAdminRole);
                                                    const Icon = role?.icon || Users;
                                                    return (
                                                        <>
                                                            <Icon className="w-4 h-4 text-slate-500" />
                                                            <span className="flex-1 text-left font-medium text-slate-700">{role?.label || 'Staff'}</span>
                                                            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[9px] font-bold uppercase tracking-wider rounded-full">
                                                                <Sparkles className="w-2.5 h-2.5" />
                                                                Pro
                                                            </span>
                                                            <ChevronDown
                                                                className={cn(
                                                                    'w-4 h-4 text-slate-400 transition-transform',
                                                                    showRoleDropdown && 'rotate-180'
                                                                )}
                                                            />
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
                                                            onClick={() => {
                                                                setNewAdminRole(role.value);
                                                                setShowRoleDropdown(false);
                                                            }}
                                                            className={cn(
                                                                'w-full px-4 py-3 flex items-start gap-3 hover:bg-slate-50 transition-colors text-left',
                                                                newAdminRole === role.value && 'bg-blue-50'
                                                            )}
                                                        >
                                                            <role.icon
                                                                className={cn(
                                                                    'w-5 h-5 mt-0.5',
                                                                    newAdminRole === role.value ? 'text-blue-600' : 'text-slate-400'
                                                                )}
                                                            />
                                                            <div>
                                                                <div
                                                                    className={cn(
                                                                        'font-semibold text-sm',
                                                                        newAdminRole === role.value ? 'text-blue-600' : 'text-slate-900'
                                                                    )}
                                                                >
                                                                    {role.label}
                                                                </div>
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
                                        disabled={addingAdmin || !newAdminEmail || isAtLimit || loadingAdmins}
                                        className="h-11 px-6 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                                        title={
                                            isAtLimit
                                                ? `Account limit reached. ${isPro ? 'Maximum 10 team members.' : 'Upgrade to Pro for up to 10 staff accounts.'}`
                                                : undefined
                                        }
                                    >
                                        {addingAdmin ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                                        Send Invite
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="overflow-x-auto border border-slate-100 rounded-2xl">
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
                                    {loadingAdmins ? (
                                        <tr>
                                            <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                                                <span className="inline-flex items-center gap-2">
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    Loading members...
                                                </span>
                                            </td>
                                        </tr>
                                    ) : admins.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-4 py-8 text-center text-slate-500">No members found.</td>
                                        </tr>
                                    ) : (
                                        admins.map((admin) => {
                                            const adminRole = admin.role || 'owner';
                                            const roleInfo = ROLES.find((r) => r.value === adminRole) || ROLES[0];
                                            const RoleIcon = roleInfo.icon;

                                            const roleColors = {
                                                owner: 'bg-purple-100 text-purple-700',
                                                manager: 'bg-blue-100 text-blue-700',
                                                kitchen: 'bg-orange-100 text-orange-700',
                                                staff: 'bg-slate-100 text-slate-600',
                                            };
                                            const badgeColor = roleColors[adminRole as keyof typeof roleColors] || roleColors.staff;

                                            return (
                                                <tr key={admin.email} className="hover:bg-slate-50/30 transition-colors">
                                                    <td className="px-4 py-4 font-medium text-slate-900">{admin.email}</td>
                                                    <td className="px-4 py-4">
                                                        <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold', badgeColor)}>
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
                                                                        'p-1 rounded transition-colors',
                                                                        copiedRowEmail === admin.email
                                                                            ? 'bg-emerald-100 text-emerald-600'
                                                                            : 'text-slate-500 hover:bg-slate-200'
                                                                    )}
                                                                    title="Copy temporary password"
                                                                >
                                                                    {copiedRowEmail === admin.email ? (
                                                                        <Check className="w-3.5 h-3.5" />
                                                                    ) : (
                                                                        <Copy className="w-3.5 h-3.5" />
                                                                    )}
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-slate-400">-</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <span
                                                            className={cn(
                                                                'px-2 py-0.5 rounded-full text-[10px] font-bold',
                                                                admin.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500 italic'
                                                            )}
                                                        >
                                                            {admin.is_active ? 'Active' : 'Inactive'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-4 text-right">
                                                        <div className="flex items-center justify-end gap-1">
                                                            <button
                                                                onClick={() => handleToggleAdmin(admin.email, admin.is_active)}
                                                                className={cn(
                                                                    'p-2 rounded-lg transition-colors',
                                                                    admin.is_active
                                                                        ? 'text-amber-600 hover:bg-amber-50'
                                                                        : 'text-emerald-600 hover:bg-emerald-50'
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
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

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
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-4">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <ShieldCheck className="w-5 h-5" />
                                    Team Member Created
                                </h3>
                                <p className="text-emerald-100 text-sm mt-1">Share these credentials with the new team member</p>
                            </div>

                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Email</label>
                                    <div className="bg-slate-50 rounded-lg px-4 py-3 font-mono text-sm text-slate-700">{newUserCredentials.email}</div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Temporary Password</label>
                                    <div className="bg-slate-50 rounded-lg px-4 py-3 font-mono text-sm text-slate-700 flex items-center justify-between gap-2">
                                        <span className="select-all">{newUserCredentials.password}</span>
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(newUserCredentials.password);
                                                setCopiedPassword(true);
                                                setTimeout(() => setCopiedPassword(false), 2000);
                                            }}
                                            className={cn(
                                                'p-2 rounded-lg transition-all',
                                                copiedPassword
                                                    ? 'bg-emerald-100 text-emerald-600'
                                                    : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                                            )}
                                            title="Copy password"
                                        >
                                            {copiedPassword ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                                    <p className="text-amber-800 text-sm">
                                        <strong>Important:</strong> This password remains visible in the Members table until the user changes it. On first login they are automatically redirected to the Change Password screen before dashboard access.
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

            <UpgradeModal isOpen={showUpgradeModal} onClose={() => setShowUpgradeModal(false)} featureName="Members" />
        </RoleGuard>
    );
}

const cn = (...classes: any[]) => classes.filter(Boolean).join(' ');
