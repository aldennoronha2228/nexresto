'use client';

import React from 'react';

type QuantitySelectorProps = {
    quantity: number;
    onIncrease: () => void;
    onDecrease: () => void;
};

export function QuantitySelector({ quantity, onIncrease, onDecrease }: QuantitySelectorProps) {
    return (
        <div className="inline-flex items-center gap-2 rounded-md border border-stone-300 bg-white px-2 py-1">
            <button
                type="button"
                onClick={onDecrease}
                className="h-7 w-7 rounded border border-stone-300 text-sm font-semibold text-stone-700 hover:bg-stone-100"
                aria-label="Decrease quantity"
            >
                -
            </button>
            <span className="min-w-6 text-center text-sm font-semibold text-stone-800">{quantity}</span>
            <button
                type="button"
                onClick={onIncrease}
                className="h-7 w-7 rounded border border-stone-300 text-sm font-semibold text-stone-700 hover:bg-stone-100"
                aria-label="Increase quantity"
            >
                +
            </button>
        </div>
    );
}
