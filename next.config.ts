import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Standalone output for Docker deployment (not needed for Vercel)
  // output: 'standalone',

  // Optimize edilmiş ayarlar
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  // TypeScript incremental build için (Next.js 16'da experimental'den çıktı)
  typedRoutes: false,
};

export default nextConfig;

