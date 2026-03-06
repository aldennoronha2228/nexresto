import { Metadata } from 'next';
import { CartProvider } from '@/context/CartContext';
import { CustomerGuard } from '@/components/customer/CustomerGuard';
import { AuthProvider } from '@/context/AuthContext';

export const metadata: Metadata = {
    title: 'MENU',
    description: 'Digital Restaurant Menu',
};

/** 
 * Root Layout for the Customer Experience
 * ________________________________________
 * Any page inside /customer is wrapped by this.
 * We include the CustomerGuard to check if the site is public or not.
 */
export default function CustomerLayout({ children }: { children: React.ReactNode }) {
    return (
        <AuthProvider>
            <CartProvider>
                <CustomerGuard>
                    {children}
                </CustomerGuard>
            </CartProvider>
        </AuthProvider>
    );
}
