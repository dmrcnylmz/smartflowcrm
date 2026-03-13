import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs';

const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Standalone output for Docker deployment (not needed for Vercel)
  // output: 'standalone',

  // Production hardening
  compress: true,
  poweredByHeader: false,

  typescript: {
    // Strict type checking enabled — all type errors must be resolved
    ignoreBuildErrors: false,
  },

  images: {
    formats: ['image/avif', 'image/webp'],
  },

  // Optimize edilmiş ayarlar
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
    // optimizeCss requires 'critters' package — enable in production if needed
    // optimizeCss: true,
  },

  // TypeScript incremental build için (Next.js 16'da experimental'den çıktı)
  typedRoutes: false,
};

export default withSentryConfig(withNextIntl(nextConfig), {
  // Sentry build options
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Suppress source map upload warnings when no auth token
  silent: !process.env.SENTRY_AUTH_TOKEN,

  // Source maps — only upload when auth token is available
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },

  // Tree-shake Sentry debug logs in production
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludeReplayIframe: true,
    excludeReplayShadowDom: true,
  },
});
