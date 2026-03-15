import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { SuperAdminAuthProvider } from '@/context/SuperAdminAuthContext';
import { Toaster } from 'sonner';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'NexResto — Dashboard',
  description: 'NexResto restaurant management dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        {/*
          Two independent auth providers — each watches a different Firebase auth instance:
            AuthProvider           → firebase          → tenant admin session
            SuperAdminAuthProvider → firebaseAdminAuth → super admin session
          They are completely isolated: signing out of one never affects the other.
        */}
        <AuthProvider>
          <SuperAdminAuthProvider>
            {children}
          </SuperAdminAuthProvider>
        </AuthProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
