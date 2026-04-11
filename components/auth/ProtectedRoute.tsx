'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { session, loading, tenantLoading } = useAuth();

  useEffect(() => {
    if (!loading && !tenantLoading && !session) {
      router.replace('/login');
    }
  }, [loading, tenantLoading, session, router]);

  if (loading || tenantLoading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#03050b] text-white">
        <div className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm">Checking access...</div>
      </div>
    );
  }

  return <>{children}</>;
}
