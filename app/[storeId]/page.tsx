import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/seo/JsonLd';
import {
    buildBreadcrumbJsonLd,
    buildRestaurantJsonLd,
    buildTenantMetadata,
    buildWebSiteJsonLd,
    getTenantSeoData,
} from '@/lib/seo/tenant';

type RouteParams = Promise<{ storeId: string }>;

const FALLBACK_HERO = 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600&q=80';

export async function generateMetadata({
    params,
}: {
    params: RouteParams;
}): Promise<Metadata> {
    const { storeId } = await params;
    const tenant = await getTenantSeoData(storeId);
    const canonicalStoreId = tenant?.storeId || storeId.toLowerCase();
    return buildTenantMetadata({
        storeId,
        tenant,
        canonicalPath: `/${canonicalStoreId}`,
        pageLabel: 'Restaurant',
        description: tenant
            ? `${tenant.name} online ordering and digital menu for hotel and restaurant guests.`
            : 'Restaurant online ordering and digital menu.',
    });
}

export default async function TenantHomePage({
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
    const heroImage = tenant.heroImageUrl || tenant.ogImageUrl || FALLBACK_HERO;

    return (
        <>
            <JsonLd id={`website-home-${tenant.storeId}`} data={buildWebSiteJsonLd(tenant)} />
            <JsonLd id={`restaurant-home-${tenant.storeId}`} data={buildRestaurantJsonLd(tenant)} />
            <JsonLd
                id={`breadcrumbs-home-${tenant.storeId}`}
                data={buildBreadcrumbJsonLd([{ name: tenant.name, path: homePath }])}
            />

            <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 md:px-6 md:py-10">
                <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                    <div className="relative aspect-[16/7] w-full bg-slate-100">
                        <Image
                            src={heroImage}
                            alt={`${tenant.name} restaurant ambience and dining experience`}
                            fill
                            sizes="(max-width: 1024px) 100vw, 1200px"
                            priority
                            unoptimized
                            className="object-cover"
                        />
                    </div>

                    <div className="space-y-4 p-6 md:p-8">
                        <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
                            {tenant.name}
                        </h1>
                        <p className="text-base leading-relaxed text-slate-600 md:text-lg">
                            {tenant.description}
                        </p>

                        <div className="flex flex-wrap items-center gap-3 text-sm">
                            <Link
                                href={menuPath}
                                className="rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white transition hover:bg-slate-700"
                            >
                                View Menu
                            </Link>
                            {!tenant.hasMenu ? (
                                <span className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-amber-800">
                                    Menu is being prepared
                                </span>
                            ) : null}
                        </div>
                    </div>
                </article>
            </main>
        </>
    );
}
