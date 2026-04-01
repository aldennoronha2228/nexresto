import type { Metadata } from 'next';
import { Space_Grotesk } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { SuperAdminAuthProvider } from '@/context/SuperAdminAuthContext';
import { Toaster } from 'sonner';
import { getSiteOrigin } from '@/lib/seo/url';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  preload: true,
  fallback: ['Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
});
const siteOrigin = getSiteOrigin();
const iconVersion = '20260328d';
const googleSiteVerification = (
  process.env.GOOGLE_SITE_VERIFICATION ||
  process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ||
  ''
).trim();

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
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  ...(googleSiteVerification
    ? {
      verification: {
        google: googleSiteVerification,
      },
    }
    : {}),
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: `/favicon.png?v=${iconVersion}`, sizes: '32x32', type: 'image/png' },
      { url: `/favicon-48.png?v=${iconVersion}`, sizes: '48x48', type: 'image/png' },
      { url: `/icon-192.png?v=${iconVersion}`, sizes: '192x192', type: 'image/png' },
    ],
    shortcut: `/favicon.png?v=${iconVersion}`,
    apple: `/apple-touch-icon.png?v=${iconVersion}`,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={spaceGrotesk.className} suppressHydrationWarning>
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
