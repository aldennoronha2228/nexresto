export default function RootLoading() {
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#030712]">
            <div className="flex flex-col items-center gap-4">
                <svg
                    className="loading-cube h-28 w-28 sm:h-32 sm:w-32"
                    viewBox="0 0 256 256"
                    role="img"
                    aria-label="Loading NexResto"
                >
                    <defs>
                        <filter id="loadingGlow" x="-60%" y="-60%" width="220%" height="220%">
                            <feGaussianBlur stdDeviation="4" result="blur" />
                            <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>
                    <g
                        className="loading-cube-group"
                        fill="none"
                        stroke="#ff5a00"
                        strokeWidth="10"
                        strokeLinecap="butt"
                        strokeLinejoin="miter"
                        filter="url(#loadingGlow)"
                    >
                        <path className="loading-cube-top" d="M128 30L56 72L128 114L200 72Z" />
                        <path className="loading-cube-sides" d="M56 72V162L128 204L200 162V72" />
                        <path className="loading-cube-center" d="M128 114V204" />
                    </g>
                </svg>
                <p className="loading-label text-xs tracking-[0.2em] text-slate-300">LOADING</p>
            </div>

            <style jsx>{`
                .loading-cube {
                    transform-origin: 50% 50%;
                    animation: cubeFloat 2.8s cubic-bezier(0.22, 1, 0.36, 1) infinite;
                    will-change: transform, opacity;
                }

                .loading-cube-group {
                    animation: cubeGlow 2.4s ease-in-out infinite;
                    will-change: opacity;
                }

                .loading-cube-top,
                .loading-cube-sides,
                .loading-cube-center {
                    stroke-dasharray: 760;
                    stroke-dashoffset: 760;
                    animation-fill-mode: both;
                }

                .loading-cube-top {
                    animation: drawStroke 2.2s cubic-bezier(0.33, 1, 0.68, 1) infinite;
                }

                .loading-cube-sides {
                    animation: drawStroke 2.2s cubic-bezier(0.33, 1, 0.68, 1) infinite 0.14s;
                }

                .loading-cube-center {
                    animation: drawStroke 2.2s cubic-bezier(0.33, 1, 0.68, 1) infinite 0.26s;
                }

                .loading-label {
                    animation: labelPulse 2.2s ease-in-out infinite;
                }

                @keyframes drawStroke {
                    0% {
                        stroke-dashoffset: 760;
                        opacity: 0.28;
                    }
                    45% {
                        stroke-dashoffset: 0;
                        opacity: 1;
                    }
                    100% {
                        stroke-dashoffset: -120;
                        opacity: 0.34;
                    }
                }

                @keyframes cubeFloat {
                    0%,
                    100% {
                        transform: translate3d(0, 0, 0) scale(1);
                    }
                    50% {
                        transform: translate3d(0, -4px, 0) scale(1.01);
                    }
                }

                @keyframes cubeGlow {
                    0%,
                    100% {
                        opacity: 0.78;
                    }
                    50% {
                        opacity: 1;
                    }
                }

                @keyframes labelPulse {
                    0%,
                    100% {
                        opacity: 0.72;
                    }
                    50% {
                        opacity: 1;
                    }
                }
            `}</style>
        </div>
    );
}
