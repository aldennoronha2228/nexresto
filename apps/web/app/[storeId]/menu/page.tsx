import { AuthProvider } from '@/context/AuthContext';
import { CartProvider } from '@/context/CartContext';
import { CustomerMenuShell } from '@/components/customer/CustomerMenuShell';
import { getTenantSeoData } from '@/lib/seo/tenant';
import { notFound, redirect } from 'next/navigation';

type Params = { storeId: string };

export default async function TenantMenuPage({ params }: { params: Promise<Params> }) {
    const { storeId } = await params;
    const tenant = await getTenantSeoData(storeId);

    if (!tenant || !tenant.isPublic) {
        notFound();
    }

    const paymentRequired =
        tenant.subscriptionStatus === 'expired' ||
        tenant.accountDisabledReason === 'subscription_expired';

    if (paymentRequired) {
        redirect(`/${tenant.storeId}/choose-plan`);
    }

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
