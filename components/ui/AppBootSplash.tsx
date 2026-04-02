'use client';

import { useEffect, useState } from 'react';

export default function AppBootSplash() {
    const [visible, setVisible] = useState(true);
    const [fadeOut, setFadeOut] = useState(false);

    useEffect(() => {
        const holdTimer = window.setTimeout(() => setFadeOut(true), 1100);
        const hideTimer = window.setTimeout(() => setVisible(false), 1550);

        return () => {
            window.clearTimeout(holdTimer);
            window.clearTimeout(hideTimer);
        };
    }, []);

    if (!visible) return null;

    return (
        <div
            className={`fixed inset-0 z-[10000] flex items-center justify-center bg-[#030712] transition-opacity duration-500 ${fadeOut ? 'opacity-0' : 'opacity-100'}`}
            aria-label="App loading"
            role="status"
        >
            <div className="flex flex-col items-center gap-4">
                <svg
                    className="h-28 w-28 sm:h-32 sm:w-32"
                    viewBox="0 0 256 256"
                    role="img"
                    aria-label="Loading NexResto"
                >
                    <defs>
                        <filter id="bootGlow" x="-60%" y="-60%" width="220%" height="220%">
                            <feGaussianBlur stdDeviation="4" result="blur" />
                            <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>
                    <g
                        fill="none"
                        stroke="#ff5a00"
                        strokeWidth="10"
                        strokeLinecap="butt"
                        strokeLinejoin="miter"
                        filter="url(#bootGlow)"
                    >
                        <path d="M128 30L56 72L128 114L200 72Z">
                            <animate
                                attributeName="stroke-dasharray"
                                values="0 480;480 0;0 480"
                                dur="1.5s"
                                repeatCount="indefinite"
                            />
                        </path>
                        <path d="M56 72V162L128 204L200 162V72">
                            <animate
                                attributeName="stroke-dasharray"
                                values="0 560;560 0;0 560"
                                dur="1.5s"
                                begin="0.1s"
                                repeatCount="indefinite"
                            />
                        </path>
                        <path d="M128 114V204">
                            <animate
                                attributeName="opacity"
                                values="0.35;1;0.35"
                                dur="1.5s"
                                repeatCount="indefinite"
                            />
                        </path>
                    </g>
                </svg>
                <p className="text-xs tracking-[0.2em] text-slate-300">LOADING</p>
            </div>
        </div>
    );
}
