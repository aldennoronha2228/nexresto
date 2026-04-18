import Link from 'next/link';
import { CustomerMenuShell } from '@/components/customer/CustomerMenuShell';

type TablePageProps = {
    params: Promise<{ tableId: string }>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function clean(value: unknown): string {
    return String(value || '').trim();
}

function readQueryValue(value: string | string[] | undefined): string {
    if (Array.isArray(value)) return clean(value[0]);
    return clean(value);
}

export default async function TableMenuPage({ params, searchParams }: TablePageProps) {
    const resolvedParams = await params;
    const resolvedSearch = (await searchParams) || {};

    const tableId = clean(resolvedParams.tableId);
    const restaurantId = readQueryValue(resolvedSearch.restaurant);

    if (!tableId) {
        return (
            <div className="min-h-screen bg-[#121212] px-4 py-10 text-stone-100">
                <div className="mx-auto max-w-md rounded-xl border border-white/10 bg-black/25 p-5 text-sm">
                    Invalid table session.
                </div>
            </div>
        );
    }

    if (!restaurantId) {
        return (
            <div className="min-h-screen bg-[#121212] px-4 py-10 text-stone-100">
                <div className="mx-auto max-w-md rounded-xl border border-white/10 bg-black/25 p-5">
                    <p className="text-sm text-stone-300">Restaurant context missing in table link.</p>
                    <Link href="/customer" className="mt-3 inline-flex rounded-lg border border-white/15 px-3 py-2 text-xs uppercase tracking-[0.12em] text-stone-100">
                        Open Customer Menu
                    </Link>
                </div>
            </div>
        );
    }

    return <CustomerMenuShell restaurantIdOverride={restaurantId} tableIdOverride={tableId} forceSharedTableContext />;
}
