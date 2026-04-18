import { redirect } from 'next/navigation';
export default async function DashboardIndexPage({ params }: { params: Promise<{ storeId: string }> }) {
    const { storeId } = await params;
    redirect(`/${storeId}/dashboard/orders`);
}
