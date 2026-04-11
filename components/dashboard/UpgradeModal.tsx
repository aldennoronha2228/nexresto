'use client';

/**
 * Premium Upgrade Modal
 * High-converting modal shown to Starter tier users when they try to access Pro features
 */

import { motion, AnimatePresence } from 'motion/react';
import { 
    X, Check, Crown, User
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface UpgradeModalProps {
    isOpen: boolean;
    onClose: () => void;
    featureName?: string;
}

type PlanKey = 'basic' | 'pro';

const PLANS: Record<PlanKey, {
    name: string;
    price: number;
    cadenceLabel: string;
    summary?: string;
    accent: string;
    features: string[];
}> = {
    basic: {
        name: 'Starter',
        price: 2000,
        cadenceLabel: '/ Month',
        accent: 'border-slate-600/40 bg-slate-800/55',
        features: [
            'Phone Ordering',
            'Live Order Queue',
            'QR Code Generation',
            'Menu Management',
            'Single Owner Only',
        ],
    },
    pro: {
        name: 'Pro',
        price: 2000,
        cadenceLabel: '/ Month',
        summary: 'POPULAR',
        accent: 'border-fuchsia-500/40 bg-fuchsia-500/15',
        features: [
            'Everything in Starter',
            'Multi-user Roles (Owner, Manager, Staff)',
            'Role-based Access Control',
            'Analytics Dashboard',
            'Inventory Management',
            'Custom Branding',
        ],
    },
};

export function UpgradeModal({ isOpen, onClose, featureName }: UpgradeModalProps) {
    const [selectedPlan, setSelectedPlan] = useState<PlanKey>('basic');
    const selectedPrice = PLANS[selectedPlan].price;

    const handleRequestUpgrade = () => {
        // In production, this would send an email notification to super admin
        // or redirect to a payment page
        const plan = PLANS[selectedPlan].name;
        alert(`${plan} upgrade request sent! Our team will contact you shortly.`);
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-2 sm:p-4"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.9, y: 20 }}
                        onClick={(e) => e.stopPropagation()}
                        className="relative bg-slate-900 rounded-3xl border border-slate-700 w-[92vw] sm:w-full max-w-xl overflow-hidden origin-top sm:origin-center"
                    >
                        {/* Close button */}
                        <button
                            onClick={onClose}
                            className="absolute top-3 right-3 p-1.5 rounded-full bg-white/10 hover:bg-white/15 transition-colors z-10"
                        >
                            <X className="w-4 h-4 text-slate-200" />
                        </button>

                        <div className="relative p-3 sm:p-5">
                            {/* Header */}
                            <div className="text-center mb-2.5 pt-1">
                                <div className="hidden sm:inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-800 mb-3 shadow-lg shadow-blue-900/40 border border-slate-700">
                                    <Crown className="w-6 h-6 text-white" />
                                </div>
                                <h2 className="font-black text-white leading-tight mb-1 text-[1.6rem] sm:text-[2rem]">
                                    <span className="sm:hidden">Choose Your Plan</span>
                                    <span className="hidden sm:inline">Choose Your Plan to Maximize<br />Your Agent&apos;s Potential</span>
                                </h2>
                                <p className="hidden sm:block text-slate-300 text-sm">
                                    {featureName ? `Unlock ${featureName} and more with a higher plan.` : 'Select the plan that fits your restaurant operations.'}
                                </p>
                            </div>

                            {/* Tier comparison */}
                            <div className="space-y-2 mb-2.5">
                                {(['basic', 'pro'] as PlanKey[]).map((key) => {
                                    const plan = PLANS[key];
                                    const isSelected = selectedPlan === key;
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => setSelectedPlan(key)}
                                            className={cn(
                                                'w-full rounded-3xl border p-2.5 sm:p-3.5 text-left transition-all relative',
                                                plan.accent,
                                                isSelected ? 'ring-2 ring-white/30' : 'hover:border-white/40'
                                            )}
                                        >
                                            {plan.summary && (
                                                <span className="absolute top-2.5 right-2.5 text-[11px] px-2 py-0.5 rounded-full bg-fuchsia-500 text-white font-semibold">{plan.summary}</span>
                                            )}
                                            <div className="flex items-baseline justify-between gap-2 mb-0.5">
                                                <h3 className={cn('text-2xl sm:text-3xl font-bold', key === 'pro' ? 'text-fuchsia-300' : 'text-slate-100')}>{plan.name}</h3>
                                                <p className={cn('text-2xl sm:text-3xl font-black', key === 'pro' ? 'text-fuchsia-300' : 'text-slate-100')}>
                                                    ₹{plan.price.toLocaleString('en-IN')}<span className="text-sm sm:text-base font-semibold opacity-80">/mo</span>
                                                </p>
                                            </div>
                                            <div className="grid gap-0.5 sm:gap-1">
                                                {plan.features.map((feature) => (
                                                    <div key={feature} className="flex items-center gap-2 text-slate-200 text-[12.5px] sm:text-sm">
                                                        {feature === 'Single Owner Only' ? <User className="w-3.5 h-3.5 text-slate-300" /> : <Check className={cn('w-3.5 h-3.5', key === 'pro' ? 'text-fuchsia-300' : 'text-slate-200')} />}
                                                        <span className={key === 'pro' ? 'text-fuchsia-200' : 'text-slate-200'}>{feature}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* CTA Buttons */}
                            <div className="space-y-3">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={handleRequestUpgrade}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 sm:py-3 bg-gradient-to-r from-slate-950 to-blue-950 hover:from-slate-900 hover:to-blue-900 text-white text-sm sm:text-base font-semibold rounded-2xl shadow-lg transition-all"
                                >
                                    Subscribe for ₹{selectedPrice.toLocaleString('en-IN')}
                                </motion.button>
                                <button
                                    onClick={onClose}
                                    className="w-full px-6 py-1 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors"
                                >
                                    Maybe Later
                                </button>
                            </div>

                            {/* Trust badge */}
                            <p className="hidden sm:block text-center text-[11px] text-slate-400 mt-1.5">
                                Monthly subscription renews automatically.
                            </p>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
