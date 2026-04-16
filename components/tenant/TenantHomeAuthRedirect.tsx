'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

type Props = {
  storeId: string;
};

export default function TenantHomeAuthRedirect({ storeId }: Props) {
  const router = useRouter();
  const { session, tenantId, subscriptionStatus, loading, tenantLoading } = useAuth();

  useEffect(() => {
    if (loading || tenantLoading) return;
    if (!session || !tenantId) return;
    if (tenantId !== storeId) return;

    if (subscriptionStatus === 'expired') {
      router.replace(`/${storeId}/choose-plan`);
      return;
    }

    router.replace(`/${storeId}/dashboard`);
  }, [loading, tenantLoading, session, tenantId, storeId, subscriptionStatus, router]);

  return null;
}
