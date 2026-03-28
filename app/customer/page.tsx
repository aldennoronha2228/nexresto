import type { Metadata } from 'next';
import { CustomerMenuShell } from '@/components/customer/CustomerMenuShell';
import { buildFallbackMetadata, buildTenantMetadata, getTenantSeoData } from '@/lib/seo/tenant';

type CustomerSearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined): string {
    if (Array.isArray(value)) return (value[0] || '').trim();
    return (value || '').trim();
}

export async function generateMetadata({
    searchParams,
}: {
    searchParams: CustomerSearchParams;
}): Promise<Metadata> {
    const params = await searchParams;
    const restaurantId = firstValue(params.restaurant);

    if (!restaurantId) {
        const fallback = buildFallbackMetadata('/customer', 'Restaurant Menu | NexResto');
        return {
            ...fallback,
            robots: { index: false, follow: false },
        };
    }

    const tenant = await getTenantSeoData(restaurantId);
    const canonicalStoreId = tenant?.storeId || restaurantId.toLowerCase();
    return buildTenantMetadata({
        storeId: restaurantId,
        tenant,
        canonicalPath: `/${canonicalStoreId}/menu`,
        pageLabel: 'Menu',
        description: tenant
            ? `Use this direct link to explore ${tenant.name}'s live menu.`
            : 'Use this direct link to explore the restaurant menu.',
        // Legacy query-based route remains crawl-safe and non-indexable.
        indexableWhenReady: false,
    });
}

export default function CustomerMenuPage() {
    return <CustomerMenuShell />;
}
