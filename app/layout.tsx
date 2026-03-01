import './globals.css';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { Inter } from 'next/font/google';
import type { Metadata, Viewport } from 'next';

const inter = Inter({
    subsets: ['latin'],
    display: 'swap',
    variable: '--font-inter',
});

export const metadata: Metadata = {
    title: {
        default: 'SmartFlow CRM - AI Receptionist',
        template: '%s | SmartFlow CRM',
    },
    description: 'Yapay zeka destekli sesli asistan ve müşteri hizmetleri platformu. Çağrılarınızı otomatikleştirin, müşterilerinizi yönetin.',
    keywords: ['CRM', 'AI', 'sesli asistan', 'müşteri hizmetleri', 'çağrı merkezi', 'SmartFlow'],
    authors: [{ name: 'SmartFlow' }],
    robots: 'noindex, nofollow',
    icons: {
        icon: '/favicon.ico',
    },
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    themeColor: [
        { media: '(prefers-color-scheme: light)', color: '#ffffff' },
        { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
    ],
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="tr" className={inter.variable} suppressHydrationWarning>
            <body className={inter.className}>
                <ClientLayout>{children}</ClientLayout>
            </body>
        </html>
    );
}
