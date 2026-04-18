'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useRestaurant } from '@/hooks/useRestaurant';

export default function PaymentsSettingsRootRedirectPage() {
    const router = useRouter();
    const { storeId } = useRestaurant();

    useEffect(() => {
        if (storeId) {
            router.replace(`/${storeId}/dashboard/settings/payments`);
            return;
        }
        router.replace('/login');
    }, [router, storeId]);

    return (
        <div className="flex min-h-[220px] items-center justify-center text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="ml-2">Opening payment settings...</span>
        </div>
    );
}
