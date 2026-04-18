import type { MetadataRoute } from 'next';
import { buildAbsoluteUrl } from '@/lib/seo/url';
import { listPublicTenantEntries } from '@/lib/seo/tenant';

export const revalidate = 900;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const now = new Date();
    let tenantEntries: Awaited<ReturnType<typeof listPublicTenantEntries>> = [];

    try {
        tenantEntries = await listPublicTenantEntries();
    } catch (error) {
        // Never fail the whole build because dynamic tenant reads are throttled.
        console.warn('[sitemap] Falling back to base sitemap:', error);
    }

    const urls: MetadataRoute.Sitemap = [
        {
            url: buildAbsoluteUrl('/'),
            lastModified: now,
            changeFrequency: 'weekly',
            priority: 1,
        },
    ];

    for (const tenant of tenantEntries) {
        urls.push(
            {
                url: buildAbsoluteUrl(`/${tenant.storeId}`),
                lastModified: tenant.lastModified,
                changeFrequency: 'weekly',
                priority: 0.8,
            },
            {
                url: buildAbsoluteUrl(`/${tenant.storeId}/menu`),
                lastModified: tenant.lastModified,
                changeFrequency: 'daily',
                priority: 0.9,
            }
        );
    }

    return urls;
}
