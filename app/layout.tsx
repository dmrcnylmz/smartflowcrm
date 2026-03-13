import './globals.css';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { ClientLayout } from '@/components/layout/ClientLayout';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
    title: {
        default: 'Callception - AI Destekli Çağrı Yönetimi',
        template: '%s | Callception',
    },
    description: 'Callception - Yapay zeka destekli sesli asistan ve müşteri hizmetleri platformu. Çağrılarınızı otomatikleştirin, müşterilerinizi yönetin.',
    keywords: ['CRM', 'AI', 'sesli asistan', 'müşteri hizmetleri', 'çağrı merkezi', 'Callception', 'yapay zeka', 'çağrı merkezi yazılımı'],
    authors: [{ name: 'Callception' }],
    metadataBase: new URL(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://callception.com'),
    openGraph: {
        type: 'website',
        locale: 'tr_TR',
        siteName: 'Callception',
        title: 'Callception - AI Destekli Çağrı Yönetimi',
        description: 'Yapay zeka destekli sesli asistan ile çağrılarınızı otomatikleştirin. 7/24 müşteri hizmetleri, randevu yönetimi ve çağrı analizi.',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Callception - AI Destekli Çağrı Yönetimi',
        description: 'Yapay zeka destekli sesli asistan ile çağrılarınızı otomatikleştirin.',
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
            <body className="font-sans antialiased overflow-x-hidden">
                <NextIntlClientProvider locale={locale} messages={messages}>
                    <ClientLayout>{children}</ClientLayout>
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
