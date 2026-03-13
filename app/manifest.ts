import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Callception - AI Destekli Çağrı Yönetimi',
        short_name: 'Callception',
        description: 'Yapay zeka destekli sesli asistan ile çağrılarınızı otomatikleştirin. 7/24 müşteri hizmetleri, randevu yönetimi ve çağrı analizi.',
        start_url: '/dashboard',
        display: 'standalone',
        background_color: '#0a0a14',
        theme_color: '#7c3aed',
        orientation: 'portrait-primary',
        categories: ['business', 'productivity'],
        icons: [
            {
                src: '/icon',
                sizes: '32x32',
                type: 'image/png',
            },
            {
                src: '/apple-icon',
                sizes: '180x180',
                type: 'image/png',
            },
        ],
    };
}
