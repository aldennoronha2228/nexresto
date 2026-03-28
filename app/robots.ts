import type { MetadataRoute } from 'next';
import { buildAbsoluteUrl, getSiteOrigin } from '@/lib/seo/url';

export default function robots(): MetadataRoute.Robots {
    const origin = getSiteOrigin();
    const host = new URL(origin).host;

    return {
        rules: [
            {
                userAgent: '*',
                allow: ['/', '/*/menu', '/sitemap.xml'],
                disallow: [
                    '/dashboard',
                    '/dashboard/',
                    '/*/dashboard',
                    '/*/dashboard/',
                    '/super-admin',
                    '/super-admin/',
                    '/admin',
                    '/admin/',
                    '/api/',
                    '/api/admin',
                    '/api/auth',
                    '/api/reports',
                    '/api/support',
                    '/api/tenant/create',
                    '/customer',
                    '/customer/',
                    '/customer/order-summary',
                    '/customer/order-history',
                    '/login',
                    '/change-password',
                    '/setup-password',
                    '/maintenance',
                    '/unauthorized',
                ],
            },
        ],
        sitemap: buildAbsoluteUrl('/sitemap.xml'),
        host,
    };
}
