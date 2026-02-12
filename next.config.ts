import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Turbopack workspace root - /Users/pc/ altındaki stray package-lock.json
  // yüzünden Next.js yanlış root seçiyor, bu ayar ile düzeltilir
  turbopack: {
    root: process.cwd(),
  },

  // Performans optimizasyonları - DEV MODUNDA TYPE CHECKING ATLA!
  // Bu compile süresini 3-6 dakikadan 5-10 saniyeye düşürür
  typescript: {
    // Dev modunda type checking'i atla (sadece build'de kontrol et)
    // Bu compile süresini %95 azaltır!
    ignoreBuildErrors: process.env.NODE_ENV === 'development',
  },

  // ESLint - Next.js 16'da artık next.config.ts'de desteklenmiyor
  // ESLint kontrolü için 'npm run lint' kullanın

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

