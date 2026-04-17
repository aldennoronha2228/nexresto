'use client';

import React from 'react';

type PaymentMode = 'my_items' | 'split_equally' | 'one_pays_all';

type PaymentMethodModalProps = {
    open: boolean;
    loading?: boolean;
    onClose: () => void;
    onSelect: (mode: PaymentMode) => void;
};

const OPTIONS: Array<{ mode: PaymentMode; title: string; subtitle: string }> = [
    {
        mode: 'my_items',
        title: 'Pay for my items',
        subtitle: 'Only pay for the items you added.',
    },
    {
        mode: 'split_equally',
        title: 'Split equally',
        subtitle: 'Divide total equally among participants.',
    },
    {
        mode: 'one_pays_all',
        title: 'One person pays for all',
        subtitle: 'Pay full table bill in one payment.',
    },
];

export function PaymentMethodModal({ open, loading = false, onClose, onSelect }: PaymentMethodModalProps) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[95]">
            <button type="button" aria-label="Close payment method modal" className="absolute inset-0 bg-black/60" onClick={onClose} />
            <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border border-white/10 bg-[#0f0f0f] p-4 text-stone-100 shadow-2xl sm:left-1/2 sm:bottom-auto sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
                <div className="mb-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-stone-400">Choose Payment Method</p>
                    <h3 className="mt-1 text-lg font-semibold text-white">How would you like to pay?</h3>
                </div>

                <div className="space-y-2">
                    {OPTIONS.map((option) => (
                        <button
                            key={option.mode}
                            type="button"
                            disabled={loading}
                            onClick={() => onSelect(option.mode)}
                            className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-left transition hover:border-emerald-400/50 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <p className="text-sm font-semibold text-white">{option.title}</p>
                            <p className="mt-0.5 text-xs text-stone-400">{option.subtitle}</p>
                        </button>
                    ))}
                </div>

                <button
                    type="button"
                    onClick={onClose}
                    disabled={loading}
                    className="mt-3 w-full rounded-xl border border-white/15 px-4 py-2 text-sm text-stone-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}

export type { PaymentMode };
