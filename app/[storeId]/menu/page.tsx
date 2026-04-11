import { AuthProvider } from '@/context/AuthContext';
import { CartProvider } from '@/context/CartContext';
import { CustomerMenuShell } from '@/components/customer/CustomerMenuShell';

type Params = { storeId: string };

export default async function TenantMenuPage({ params }: { params: Promise<Params> }) {
    const { storeId } = await params;

    return (
        <AuthProvider>
            <CartProvider>
                <CustomerMenuShell
                    restaurantIdOverride={storeId}
                    tenantHomePath={`/${storeId}`}
                />
            </CartProvider>
        </AuthProvider>
    );
}
