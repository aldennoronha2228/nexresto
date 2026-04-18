import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Unauthorized | NexResto',
    robots: { index: false, follow: false },
};

export default function UnauthorizedLayout({ children }: { children: React.ReactNode }) {
    return children;
}
