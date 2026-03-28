import type { MetadataRoute } from 'next';
import { buildAbsoluteUrl, getSiteOrigin } from '@/lib/seo/url';

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: '*',
                allow: ['/', '/*/menu', '/*'],
                disallow: [
                    '/dashboard',
                    '/*/dashboard',
                    '/super-admin',
                    '/admin',
                    '/api/',
                    '/api/admin',
                    '/api/auth',
                    '/api/reports',
                    '/api/support',
                    '/api/tenant/create',
                    '/customer',
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
        host: getSiteOrigin(),
    };
}
