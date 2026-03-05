import './globals.css';
import { ClientLayout } from '@/components/layout/ClientLayout';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
    title: {
        default: 'Callception - AI Destekli Çağrı Yönetimi',
        template: '%s | Callception',
    },
    description: 'Callception - Yapay zeka destekli sesli asistan ve müşteri hizmetleri platformu. Çağrılarınızı otomatikleştirin, müşterilerinizi yönetin.',
    keywords: ['CRM', 'AI', 'sesli asistan', 'müşteri hizmetleri', 'çağrı merkezi', 'Callception'],
    authors: [{ name: 'Callception' }],
    robots: 'noindex, nofollow',
    icons: {
        icon: '/favicon.ico',
    },
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    themeColor: [
        { media: '(prefers-color-scheme: light)', color: '#f0f2f5' },
        { media: '(prefers-color-scheme: dark)', color: '#0a0a14' },
    ],
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="tr" suppressHydrationWarning>
            <body className="font-sans antialiased">
                <ClientLayout>{children}</ClientLayout>
            </body>
        </html>
    );
}
