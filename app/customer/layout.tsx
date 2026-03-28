import { Metadata } from 'next';
import { CartProvider } from '@/context/CartContext';
import { AuthProvider } from '@/context/AuthContext';

export const metadata: Metadata = {
    title: 'Customer Menu | NexResto',
    description: 'Legacy query-based customer menu route.',
    robots: {
        index: false,
        follow: false,
    },
    alternates: {
        canonical: '/customer',
    },
};

/**
 * Root Layout for the Customer Experience.
 * Any page inside /customer is publicly accessible for QR users.
 */
export default function CustomerLayout({ children }: { children: React.ReactNode }) {
    return (
        <AuthProvider>
            <CartProvider>
                {children}
            </CartProvider>
        </AuthProvider>
    );
}
