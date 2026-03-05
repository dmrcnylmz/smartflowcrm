import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Standalone output for Docker deployment (not needed for Vercel)
  // output: 'standalone',

  // Production hardening
  compress: true,
  poweredByHeader: false,

  images: {
    formats: ['image/avif', 'image/webp'],
  },

  // Optimize edilmiş ayarlar
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
    optimizeCss: true,
  },

  // TypeScript incremental build için (Next.js 16'da experimental'den çıktı)
  typedRoutes: false,
};

export default nextConfig;

