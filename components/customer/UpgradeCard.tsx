'use client';

import React from 'react';

type UpgradeCardProps = {
    title?: string;
    description?: string;
    ctaLabel?: string;
    onUpgrade?: () => void;
};

export function UpgradeCard({
    title = 'Shared Table Ordering Is Locked',
    description = 'Upgrade to Pro or Growth to enable shared table ordering and split billing from QR sessions.',
    ctaLabel = 'View Plans',
    onUpgrade,
}: UpgradeCardProps) {
    return (
        <div className="rounded-2xl border border-amber-300/40 bg-amber-500/10 p-4 text-amber-100">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">Plan Feature Locked</p>
            <h3 className="mt-2 text-lg font-semibold text-amber-50">{title}</h3>
            <p className="mt-2 text-sm text-amber-100/90">{description}</p>
            <button
                type="button"
                onClick={onUpgrade}
                className="mt-4 rounded-xl border border-amber-100/40 bg-amber-300/20 px-4 py-2 text-sm font-semibold uppercase tracking-[0.12em] text-amber-50 hover:bg-amber-300/30"
            >
                {ctaLabel}
            </button>
        </div>
    );
}
