import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { SuperAdminAuthProvider } from '@/context/SuperAdminAuthContext';
import { Toaster } from 'sonner';
import { getSiteOrigin } from '@/lib/seo/url';

const inter = Inter({ subsets: ['latin'] });
const siteOrigin = getSiteOrigin();

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: {
    default: 'NexResto | Restaurant & Hotel Digital Menus',
    template: '%s | NexResto',
  },
  description: 'NexResto helps restaurants and hotels publish digital menus and streamline online ordering.',
  keywords: ['restaurant menu', 'digital menu', 'online ordering', 'hotel dining', 'nexresto'],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    title: 'NexResto | Restaurant & Hotel Digital Menus',
    description: 'NexResto helps restaurants and hotels publish digital menus and streamline online ordering.',
    url: '/',
    siteName: 'NexResto',
    images: [
      {
        url: '/icon-192.png',
        width: 1200,
        height: 630,
        alt: 'NexResto platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NexResto | Restaurant & Hotel Digital Menus',
    description: 'NexResto helps restaurants and hotels publish digital menus and streamline online ordering.',
    images: ['/icon-192.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-48.png', sizes: '48x48', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
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
