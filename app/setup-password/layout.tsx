import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Set Password | NexResto',
    robots: { index: false, follow: false },
};

export default function SetupPasswordLayout({ children }: { children: React.ReactNode }) {
    return children;
}
