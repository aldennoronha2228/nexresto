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
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon-48.png?v=20260328', sizes: '48x48', type: 'image/png' },
      { url: '/icon-192.png?v=20260328', sizes: '192x192', type: 'image/png' },
      { url: '/nexresto-mark.svg?v=20260328', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon-48.png?v=20260328',
    apple: '/apple-touch-icon.png?v=20260328',
  },
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
