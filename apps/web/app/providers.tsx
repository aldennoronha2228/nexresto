'use client';

import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/context/AuthContext';
import { SuperAdminAuthProvider } from '@/context/SuperAdminAuthContext';

export default function Providers({ children }: { children: ReactNode }) {
    return (
        <SuperAdminAuthProvider>
            <AuthProvider>
                {children}
                <Toaster richColors position="top-right" />
            </AuthProvider>
        </SuperAdminAuthProvider>
    );
}
