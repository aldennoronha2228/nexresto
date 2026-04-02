import type { Metadata, Viewport } from 'next';
import { Space_Grotesk } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { SuperAdminAuthProvider } from '@/context/SuperAdminAuthContext';
import { Toaster } from 'sonner';
import AppBootSplash from '@/components/ui/AppBootSplash';
import { getSiteOrigin } from '@/lib/seo/url';
import { getPlatformMaintenanceMode } from '@/lib/platform-settings';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  preload: true,
  fallback: ['Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
});
const siteOrigin = getSiteOrigin();
const iconVersion = '20260402d';
const siteUrl = new URL('/', siteOrigin).toString();
const brandLogoUrl = new URL('/nexresto-logo-current.png', siteOrigin).toString();
const brandIconUrl = new URL('/icon-512.png', siteOrigin).toString();
const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${siteUrl}#organization`,
  name: 'NexResto',
  url: siteUrl,
  logo: {
    '@type': 'ImageObject',
    url: brandLogoUrl,
    width: 1200,
    height: 420,
  },
  image: brandIconUrl,
};
const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${siteUrl}#website`,
  name: 'NexResto',
  url: siteUrl,
  publisher: {
    '@id': `${siteUrl}#organization`,
  },
  inLanguage: 'en',
};
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
        url: '/nexresto-logo-current.png',
        width: 1200,
        height: 420,
        alt: 'NexResto',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NexResto | Restaurant & Hotel Digital Menus',
    description: 'NexResto helps restaurants and hotels publish digital menus and streamline online ordering.',
    images: ['/nexresto-logo-current.png'],
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
  manifest: `/site.webmanifest?v=${iconVersion}`,
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

export const viewport: Viewport = {
  themeColor: '#030712',
  colorScheme: 'dark',
};

function shouldBypassMaintenance(pathname: string): boolean {
  return (
    pathname === '/maintenance' ||
    pathname.startsWith('/maintenance/') ||
    pathname.startsWith('/super-admin') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/change-password') ||
    pathname.startsWith('/setup-password') ||
    pathname.startsWith('/unauthorized')
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const pathname = h.get('x-pathname') || '/';
  const maintenanceEnabled = await getPlatformMaintenanceMode();
  const isMaintenanceRoute = pathname === '/maintenance' || pathname.startsWith('/maintenance/');

  if (maintenanceEnabled && !shouldBypassMaintenance(pathname)) {
    redirect('/maintenance');
  }

  if (!maintenanceEnabled && isMaintenanceRoute) {
    redirect('/');
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={spaceGrotesk.className} suppressHydrationWarning>
        <AppBootSplash />
        <script
          id="schema-org-organization"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <script
          id="schema-org-website"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
        />
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
