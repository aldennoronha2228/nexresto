'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Loader2, Plus, RefreshCw, Save, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import {
    getSubscriptionTierSettings,
    saveSubscriptionTierSettings,
    type ManagedSubscriptionTier,
    type SubscriptionTierKey,
} from '@/lib/firebase-super-admin-actions';
import { cn } from '@/lib/utils';

type Message = { type: 'success' | 'error'; text: string } | null;

const tierTheme: Record<SubscriptionTierKey, { surface: string; chip: string; accent: string }> = {
    starter: {
        surface: 'border-slate-700/80 bg-[#0f1217]',
        chip: 'border-slate-600/70 bg-slate-500/10 text-slate-200',
        accent: 'bg-slate-300',
    },
    growth: {
        surface: 'border-blue-800/70 bg-[#0e1420]',
        chip: 'border-blue-700/70 bg-blue-500/12 text-blue-200',
        accent: 'bg-blue-300',
    },
    pro_chain: {
        surface: 'border-amber-800/70 bg-[#1a1409]',
        chip: 'border-amber-700/70 bg-amber-500/12 text-amber-200',
        accent: 'bg-amber-300',
    },
};

function cloneTiers(tiers: ManagedSubscriptionTier[]): ManagedSubscriptionTier[] {
    return tiers.map((tier) => ({ ...tier, features: [...tier.features] }));
}

export default function SuperAdminSubscriptionTiersPage() {
    const [tiers, setTiers] = useState<ManagedSubscriptionTier[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<Message>(null);
    const [snapshot, setSnapshot] = useState('');
    const [lastSyncedAt, setLastSyncedAt] = useState<string>('');

    const loadSettings = async () => {
        setLoading(true);
        try {
            const data = await getSubscriptionTierSettings();
            const next = cloneTiers(data);
            setTiers(next);
            setSnapshot(JSON.stringify(next));
            setLastSyncedAt(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
            setMessage(null);
        } catch {
            setMessage({ type: 'error', text: 'Failed to load subscription tier settings.' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSettings();
    }, []);

    useEffect(() => {
        if (!message) return;
        const timer = setTimeout(() => setMessage(null), 3000);
        return () => clearTimeout(timer);
    }, [message]);

    const hasEmptyFeatures = useMemo(
        () => tiers.some((tier) => tier.features.some((feature) => feature.trim().length === 0)),
        [tiers]
    );

    const hasUnsavedChanges = useMemo(() => JSON.stringify(tiers) !== snapshot, [tiers, snapshot]);

    const updateTier = (key: SubscriptionTierKey, mutator: (current: ManagedSubscriptionTier) => ManagedSubscriptionTier) => {
        setTiers((prev) => prev.map((tier) => (tier.key === key ? mutator(tier) : tier)));
    };

    const updateFeature = (key: SubscriptionTierKey, index: number, value: string) => {
        updateTier(key, (current) => {
            const features = [...current.features];
            features[index] = value;
            return { ...current, features };
        });
    };

    const addFeature = (key: SubscriptionTierKey) => {
        updateTier(key, (current) => ({
            ...current,
            features: [...current.features, ''],
        }));
    };

    const removeFeature = (key: SubscriptionTierKey, index: number) => {
        updateTier(key, (current) => {
            const features = current.features.filter((_, i) => i !== index);
            return { ...current, features: features.length > 0 ? features : [''] };
        });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const cleaned = tiers.map((tier) => ({
                ...tier,
                name: tier.name.trim(),
                description: tier.description.trim(),
                price_inr: Math.max(0, Math.round(Number(tier.price_inr) || 0)),
                features: tier.features.map((f) => f.trim()).filter((f) => f.length > 0),
            }));

            const result = await saveSubscriptionTierSettings(cleaned);
            if (!result.success) {
                setMessage({ type: 'error', text: result.error || 'Failed to save subscription tiers.' });
                return;
            }

            const next = cloneTiers(cleaned);
            setTiers(next);
            setSnapshot(JSON.stringify(next));
            setLastSyncedAt(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
            setMessage({ type: 'success', text: 'Subscription tiers updated successfully.' });
        } catch {
            setMessage({ type: 'error', text: 'Failed to save subscription tiers.' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6 text-slate-100">
            <div className="rounded-2xl border border-white/10 bg-[#0b0d11] px-5 py-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold text-white">Subscription Tier Controls</h1>
                        <p className="mt-1 text-sm text-slate-400">
                            Manage pricing plans used by super admin billing and tier assignment.
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                            Last synced: {lastSyncedAt || 'Not synced yet'}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <span
                            className={cn(
                                'rounded-full border px-3 py-1 text-xs font-medium',
                                hasUnsavedChanges
                                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                            )}
                        >
                            {hasUnsavedChanges ? 'Unsaved changes' : 'All changes saved'}
                        </span>
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                        onClick={loadSettings}
                        disabled={loading || saving}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition-colors hover:bg-white/10 disabled:opacity-50"
                    >
                        <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                        Reload
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading || saving || hasEmptyFeatures || !hasUnsavedChanges}
                        className="inline-flex items-center gap-2 rounded-lg border border-blue-400/30 bg-blue-500/20 px-4 py-2 text-sm font-medium text-blue-100 transition-colors hover:bg-blue-500/30 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save Changes
                    </button>
                </div>
            </div>

            {message && (
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                        'rounded-xl border px-4 py-3 text-sm',
                        message.type === 'success'
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                            : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                    )}
                >
                    {message.text}
                </motion.div>
            )}

            {loading ? (
                <div className="flex h-44 items-center justify-center rounded-2xl border border-white/10 bg-[#0d1014]">
                    <Loader2 className="h-7 w-7 animate-spin text-violet-300" />
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
                    {tiers.map((tier) => (
                        <section
                            key={tier.key}
                            className={cn(
                                'rounded-2xl border p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]',
                                tierTheme[tier.key]?.surface || 'border-white/10 bg-[#0f1217]'
                            )}
                        >
                            <div className="mb-4 flex items-center justify-between gap-3">
                                <div className="space-y-1">
                                    <span className="text-xs uppercase tracking-[0.18em] text-slate-400">{tier.key.replace('_', ' ')}</span>
                                    <div className="flex items-center gap-2 text-sm text-slate-300">
                                        <span className={cn('h-1.5 w-1.5 rounded-full', tierTheme[tier.key].accent)} />
                                        Rs {tier.price_inr.toLocaleString('en-IN')} / month
                                    </div>
                                </div>
                                <button
                                    onClick={() => updateTier(tier.key, (current) => ({ ...current, available: !current.available }))}
                                    className={cn(
                                        'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                                        tier.available ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-slate-600/60 bg-slate-700/40 text-slate-300'
                                    )}
                                >
                                    {tier.available ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                                    {tier.available ? 'Enabled' : 'Disabled'}
                                </button>
                            </div>

                            <div className="space-y-3">
                                <label className="block">
                                    <span className="mb-1.5 block text-[12px] font-medium text-slate-400">Tier name</span>
                                    <input
                                        value={tier.name}
                                        onChange={(e) => updateTier(tier.key, (current) => ({ ...current, name: e.target.value }))}
                                        className="w-full rounded-lg border border-slate-700 bg-[#0a0d12] px-3 py-2 text-sm text-white outline-none focus:border-slate-500"
                                    />
                                </label>

                                <label className="block">
                                    <span className="mb-1.5 block text-[12px] font-medium text-slate-400">Price (INR / month)</span>
                                    <input
                                        type="number"
                                        min={0}
                                        value={tier.price_inr}
                                        onChange={(e) => updateTier(tier.key, (current) => ({ ...current, price_inr: Number(e.target.value) || 0 }))}
                                        className="w-full rounded-lg border border-slate-700 bg-[#0a0d12] px-3 py-2 text-sm text-white outline-none focus:border-slate-500"
                                    />
                                </label>

                                <label className="block">
                                    <span className="mb-1.5 block text-[12px] font-medium text-slate-400">Description</span>
                                    <input
                                        value={tier.description}
                                        onChange={(e) => updateTier(tier.key, (current) => ({ ...current, description: e.target.value }))}
                                        className="w-full rounded-lg border border-slate-700 bg-[#0a0d12] px-3 py-2 text-sm text-white outline-none focus:border-slate-500"
                                    />
                                </label>
                            </div>

                            <div className="mt-5">
                                <div className="mb-2.5 flex items-center justify-between">
                                    <p className="text-[12px] font-medium text-slate-400">Features</p>
                                    <button
                                        onClick={() => addFeature(tier.key)}
                                        className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800/60 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
                                    >
                                        <Plus className="h-3.5 w-3.5" /> Add
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    {tier.features.map((feature, index) => (
                                        <div key={`${tier.key}-feature-${index}`} className="flex items-center gap-2">
                                            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#0a0d12] text-slate-400 text-xs font-medium border border-slate-700">
                                                {index + 1}
                                            </div>
                                            <input
                                                value={feature}
                                                onChange={(e) => updateFeature(tier.key, index, e.target.value)}
                                                className="flex-1 rounded-lg border border-slate-700 bg-[#0a0d12] px-3 py-2 text-sm text-white outline-none focus:border-slate-500"
                                            />
                                            <button
                                                onClick={() => removeFeature(tier.key, index)}
                                                className="rounded-lg border border-slate-700 bg-[#0a0d12] p-2 text-slate-400 hover:text-rose-300"
                                                title="Remove feature"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    ))}
                </div>
            )}

            {hasEmptyFeatures && !loading && (
                <p className="text-xs text-amber-300">
                    Empty feature rows are not allowed. Fill or remove them before saving.
                </p>
            )}
        </div>
    );
}
