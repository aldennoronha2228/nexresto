import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Maintenance | NexResto',
    robots: { index: false, follow: false },
};

export default function MaintenanceLayout({ children }: { children: React.ReactNode }) {
    return children;
}
