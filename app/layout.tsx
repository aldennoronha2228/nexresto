import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { SuperAdminAuthProvider } from '@/context/SuperAdminAuthContext';
import { Toaster } from 'sonner';
import GlobalGlowTracker from '@/components/ui/GlobalGlowTracker';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'NexResto — Dashboard',
  description: 'NexResto restaurant management dashboard',
  icons: {
    icon: [
      { url: '/icon.png?v=20260321' },
      { url: '/nexresto-mark.svg?v=20260321', type: 'image/svg+xml' },
    ],
    shortcut: '/icon.png?v=20260321',
    apple: '/apple-icon.png?v=20260321',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <GlobalGlowTracker />
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
