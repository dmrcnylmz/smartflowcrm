import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable Turbopack for CSS compatibility (use webpack instead)
  // Note: Next.js 16 uses Turbopack by default, but we'll disable it for build
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
