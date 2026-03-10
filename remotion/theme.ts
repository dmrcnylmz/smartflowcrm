/**
 * Callception Brand Theme
 * Shared constants for all Remotion compositions
 */

export const COLORS = {
  // Primary
  primary: '#dc2626',
  primaryLight: '#ef4444',
  primaryDark: '#b91c1c',

  // Background
  bgDark: '#0a0a14',
  bgSurface: '#0f0f19',
  bgCard: '#161625',
  bgCardHover: '#1a1a2e',

  // Accent
  teal: '#0d9488',
  tealLight: '#14b8a6',

  // Text
  textPrimary: '#ffffff',
  textSecondary: '#a1a1aa',
  textMuted: '#71717a',

  // Utility
  borderColor: '#27272a',
  glowRed: 'rgba(220, 38, 38, 0.4)',
  glowTeal: 'rgba(13, 148, 136, 0.3)',
  success: '#22c55e',
  warning: '#eab308',
} as const;

export const FONTS = {
  display: "'Orbitron', sans-serif",
  body: "'Inter', sans-serif",
} as const;

export const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap');
`;

export const VIDEO = {
  width: 1920,
  height: 1080,
  fps: 30,
} as const;

export const VIDEO_MOBILE = {
  width: 1080,
  height: 1920,
  fps: 30,
} as const;

// Scene durations in frames (at 30fps)
export const SCENES = {
  S01_INTRO: { from: 0, duration: 180 },       // 6s
  S02_PROBLEM: { from: 180, duration: 240 },    // 8s
  S03_SOLUTION: { from: 420, duration: 240 },    // 8s
  S04_FEATURES: { from: 660, duration: 480 },    // 16s
  S05_HOW_IT_WORKS: { from: 1140, duration: 240 }, // 8s
  S06_STATS: { from: 1380, duration: 240 },      // 8s
  S07_DASHBOARD: { from: 1620, duration: 300 },  // 10s
  S08_PRICING: { from: 1920, duration: 270 },    // 9s
  S09_CTA: { from: 2190, duration: 210 },        // 7s
} as const;

export const PRICING_SCENES = {
  P01_TITLE: { from: 0, duration: 120 },        // 4s
  P02_CARDS: { from: 120, duration: 330 },       // 11s
  P03_COMPARISON: { from: 450, duration: 180 },  // 6s
  P04_CTA: { from: 630, duration: 120 },         // 4s
} as const;

// Product data
export const FEATURES = [
  {
    icon: '🤖',
    title: 'AI Sesli Asistan',
    description: 'Doğal dilde konuşan yapay zeka ile 7/24 çağrı yanıtlama',
  },
  {
    icon: '📅',
    title: 'Otomatik Randevu',
    description: 'Sesli görüşmeden otomatik randevu oluşturma ve takip',
  },
  {
    icon: '📋',
    title: 'Şikayet Yönetimi',
    description: 'Akıllı kategorizasyon ve önceliklendirme ile hızlı çözüm',
  },
  {
    icon: '📊',
    title: 'Akıllı Raporlama',
    description: 'Gerçek zamanlı analitik ve performans metrikleri',
  },
  {
    icon: '🔗',
    title: 'CRM Entegrasyonu',
    description: 'Mevcut sistemlerinizle sorunsuz entegrasyon',
  },
  {
    icon: '🔒',
    title: 'KVKK Uyumlu',
    description: 'Türkiye veri koruma mevzuatına tam uyumluluk',
  },
] as const;

export const PRICING_PLANS = [
  {
    name: 'Başlangıç',
    price: 990,
    period: '/ay',
    features: [
      '500 dakika AI görüşme',
      '1 AI asistan',
      'Temel raporlama',
      'E-posta desteği',
    ],
    highlighted: false,
  },
  {
    name: 'Profesyonel',
    price: 2990,
    period: '/ay',
    features: [
      '2.000 dakika AI görüşme',
      '5 AI asistan',
      'Gelişmiş analitik',
      'CRM entegrasyonu',
      'Öncelikli destek',
    ],
    highlighted: true,
    badge: 'En Popüler',
  },
  {
    name: 'Kurumsal',
    price: 7990,
    period: '/ay',
    features: [
      'Sınırsız AI görüşme',
      'Sınırsız AI asistan',
      'Özel model eğitimi',
      'API erişimi',
      'Dedicated destek',
      'SLA garantisi',
    ],
    highlighted: false,
  },
] as const;

export const STEPS = [
  { number: '01', title: 'Kayıt Olun', description: 'Hızlı kayıt ile başlayın' },
  { number: '02', title: 'Numaranızı Bağlayın', description: 'Telefon numaranızı sisteme ekleyin' },
  { number: '03', title: 'Çağrıları Karşılayın', description: 'AI asistanınız hizmete hazır' },
] as const;

export const STATS = [
  { value: 95, prefix: '', suffix: '%', label: 'Çağrı Karşılama' },
  { value: 2, prefix: '<', suffix: 'sn', label: 'Yanıt Süresi' },
  { value: 24, prefix: '', suffix: '/7', label: 'Kesintisiz Hizmet' },
  { value: 40, prefix: '', suffix: '%', label: 'Maliyet Tasarrufu' },
] as const;
