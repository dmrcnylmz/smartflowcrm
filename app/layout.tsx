import './globals.css';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { Analytics } from '@vercel/analytics/next';
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

export default async function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const locale = await getLocale();
    const messages = await getMessages();

    return (
        <html lang={locale} suppressHydrationWarning>
            <body className="font-sans antialiased">
                <NextIntlClientProvider locale={locale} messages={messages}>
                    <ClientLayout>{children}</ClientLayout>
                </NextIntlClientProvider>
                <Analytics />
            </body>
        </html>
    );
}
