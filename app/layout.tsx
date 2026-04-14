import type { Metadata } from 'next';
import './globals.css';
import Providers from './providers';

export const metadata: Metadata = {
    title: {
        default: 'NexResto | Restaurant & Hotel Digital Menus',
        template: '%s | NexResto',
    },
    description: 'NexResto helps restaurants and hotels publish digital menus and streamline online ordering.',
    icons: {
        icon: '/nexresto-mark.svg?v=20260415a',
        shortcut: '/nexresto-mark.svg?v=20260415a',
        apple: '/apple-icon.png',
    },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body>
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
