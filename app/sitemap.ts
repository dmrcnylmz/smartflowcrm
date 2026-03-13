import type { MetadataRoute } from 'next';

const BASE_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://callception.com';

export default function sitemap(): MetadataRoute.Sitemap {
    return [
        {
            url: `${BASE_URL}/landing`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 1.0,
        },
        {
            url: `${BASE_URL}/privacy`,
            lastModified: new Date('2026-02-01'),
            changeFrequency: 'monthly',
            priority: 0.5,
        },
        {
            url: `${BASE_URL}/terms`,
            lastModified: new Date('2026-03-01'),
            changeFrequency: 'monthly',
            priority: 0.5,
        },
        {
            url: `${BASE_URL}/changelog`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.4,
        },
    ];
}
