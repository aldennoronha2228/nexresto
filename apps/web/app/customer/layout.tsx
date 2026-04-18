import type { Metadata } from 'next';
import { AuthProvider } from '@/context/AuthContext';
import { CartProvider } from '@/context/CartContext';

export const metadata: Metadata = {
    title: 'Customer Menu | NexResto',
    robots: { index: false, follow: false },
};

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
    return (
        <AuthProvider>
            <CartProvider>{children}</CartProvider>
        </AuthProvider>
    );
}
