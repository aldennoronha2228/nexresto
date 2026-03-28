import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CustomerMenuShell } from '@/components/customer/CustomerMenuShell';
import { AuthProvider } from '@/context/AuthContext';
import { CartProvider } from '@/context/CartContext';
import { JsonLd } from '@/components/seo/JsonLd';
import {
    buildBreadcrumbJsonLd,
    buildMenuJsonLd,
    buildRestaurantJsonLd,
    buildTenantMetadata,
    buildWebSiteJsonLd,
    getTenantSeoData,
} from '@/lib/seo/tenant';

type RouteParams = Promise<{ storeId: string }>;

export async function generateMetadata({
    params,
    searchParams,
}: {
    params: RouteParams;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
    const { storeId } = await params;
    const qs = await searchParams;
    const preview = Array.isArray(qs.preview) ? qs.preview[0] : qs.preview;
    const tenant = await getTenantSeoData(storeId);
    const canonicalStoreId = tenant?.storeId || storeId.toLowerCase();
    return buildTenantMetadata({
        storeId,
        tenant,
        canonicalPath: `/${canonicalStoreId}/menu`,
        pageLabel: 'Menu',
        description: tenant
            ? `Browse ${tenant.name}'s live menu with categories, pricing, and real-time availability.`
            : 'Browse this restaurant menu with categories and real-time availability.',
        indexableWhenReady: preview !== '1',
    });
}

export default async function TenantMenuPage({
    params,
}: {
    params: RouteParams;
}) {
    const { storeId } = await params;
    const tenant = await getTenantSeoData(storeId);

    if (!tenant || !tenant.isPublic) {
        notFound();
    }

    const homePath = `/${tenant.storeId}`;
    const menuPath = `${homePath}/menu`;

    if (!tenant.hasMenu) {
        return (
            <main className="mx-auto min-h-screen max-w-3xl px-4 py-16">
                <nav className="mb-8 text-sm">
                    <Link href={homePath} className="text-blue-700 underline underline-offset-2">Back to {tenant.name}</Link>
                </nav>
                <h1 className="text-3xl font-bold text-slate-900">{tenant.name} Menu</h1>
                <p className="mt-3 text-slate-600">
                    This menu is being prepared and will be published soon.
                </p>
            </main>
        );
    }

    return (
        <>
            <JsonLd id={`website-${tenant.storeId}`} data={buildWebSiteJsonLd(tenant)} />
            <JsonLd id={`restaurant-${tenant.storeId}`} data={buildRestaurantJsonLd(tenant)} />
            <JsonLd id={`menu-${tenant.storeId}`} data={buildMenuJsonLd(tenant)} />
            <JsonLd
                id={`breadcrumbs-${tenant.storeId}`}
                data={buildBreadcrumbJsonLd([
                    { name: tenant.name, path: homePath },
                    { name: 'Menu', path: menuPath },
                ])}
            />

            <div className="mx-auto w-full max-w-3xl px-4 py-2 text-xs text-slate-600 md:px-6">
                <Link href={homePath} className="font-medium text-slate-800 underline underline-offset-2">
                    {tenant.name} Home
                </Link>
                <span className="px-2 text-slate-400">/</span>
                <span aria-current="page">Menu</span>
            </div>

            <AuthProvider>
                <CartProvider>
                    <CustomerMenuShell
                        restaurantIdOverride={tenant.storeId}
                        tenantHomePath={homePath}
                        restaurantName={tenant.name}
                    />
                </CartProvider>
            </AuthProvider>
        </>
    );
}
