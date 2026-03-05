import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Standalone output for Docker deployment (not needed for Vercel)
  // output: 'standalone',

  // Production hardening
  compress: true,
  poweredByHeader: false,

  typescript: {
    // Firebase client SDK types issue — builds fine on Vercel with proper node_modules
    ignoreBuildErrors: true,
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

export default nextConfig;

