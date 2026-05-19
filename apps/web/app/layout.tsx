import type { Metadata } from 'next';
import '../../../styles/globals.css';
import Providers from './providers';
import { validateEnv } from '@/lib/env';

export const metadata: Metadata = {
    title: {
        default: 'NexResto | Restaurant & Hotel Digital Menus',
        template: '%s | NexResto',
    },
    description: 'NexResto helps restaurants and hotels publish digital menus and streamline online ordering.',
    manifest: '/site.webmanifest',
    icons: {
        icon: '/nexresto-mark.svg?v=20260415a',
        shortcut: '/nexresto-mark.svg?v=20260415a',
        apple: '/apple-icon.png',
    },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    validateEnv();

    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <link rel="icon" href="/nexresto-mark.svg" />
                <link rel="apple-touch-icon" href="/apple-icon.png" />
            </head>
            <body>
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
