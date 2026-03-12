// =============================================
// Enterprise Theme Presets — Callception
// =============================================
// 4 tema: Midnight Professional, Corporate Light, Executive Dark, Inception Dark
// Her preset tüm CSS custom property override'larını içerir.

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  mode: 'dark' | 'light';
  preview: {
    bgColor: string;
    primaryColor: string;
    accentColor: string;
    textColor: string;
    cardColor: string;
  };
  variables: Record<string, string>;
  glassConfig: {
    bg: string;
    border: string;
    hoverBorder: string;
    shadow: string;
    hoverShadow: string;
  };
  gradientConfig: {
    primary: string;
    secondary: string;
  };
  scrollbarColor: string;
}

// ── 1. Midnight Professional ──
// Kurumsal koyu tema — lacivert + parlak mavi
// Güvenilirlik, inovasyon, modern enterprise
export const midnightProfessional: ThemePreset = {
  id: 'midnight-professional',
  name: 'Midnight Professional',
  description: 'Koyu lacivert arka plan, parlak mavi vurgular. Modern ve kurumsal.',
  mode: 'dark',
  preview: {
    bgColor: '#081020',
    primaryColor: '#3B82F6',
    accentColor: '#0D9488',
    textColor: '#E4E8ED',
    cardColor: '#0E1729',
  },
  variables: {
    '--background': '222 47% 6%',
    '--foreground': '210 20% 92%',
    '--card': '222 40% 9%',
    '--card-foreground': '210 20% 92%',
    '--popover': '222 40% 9%',
    '--popover-foreground': '210 20% 92%',
    '--primary': '217 91% 60%',
    '--primary-foreground': '0 0% 100%',
    '--secondary': '222 30% 14%',
    '--secondary-foreground': '210 20% 88%',
    '--muted': '222 25% 12%',
    '--muted-foreground': '215 14% 50%',
    '--accent': '222 30% 16%',
    '--accent-foreground': '210 20% 92%',
    '--destructive': '0 84% 60%',
    '--destructive-foreground': '0 0% 100%',
    '--border': '222 20% 18%',
    '--input': '222 20% 18%',
    '--ring': '217 91% 60%',
    // Charts
    '--chart-1': '217 91% 60%',
    '--chart-2': '174 60% 41%',
    '--chart-3': '280 60% 55%',
    '--chart-4': '38 92% 50%',
    '--chart-5': '160 60% 45%',
    // Sidebar
    '--sidebar-background': '222 47% 5%',
    '--sidebar-foreground': '210 20% 85%',
    '--sidebar-primary': '217 91% 60%',
    '--sidebar-primary-foreground': '0 0% 100%',
    '--sidebar-accent': '222 30% 12%',
    '--sidebar-accent-foreground': '210 20% 92%',
    '--sidebar-border': '222 20% 14%',
    '--sidebar-ring': '217 91% 60%',
  },
  glassConfig: {
    bg: 'rgba(8, 16, 32, 0.7)',
    border: 'rgba(59, 130, 246, 0.08)',
    hoverBorder: 'rgba(59, 130, 246, 0.18)',
    shadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.03)',
    hoverShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 20px rgba(59, 130, 246, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
  },
  gradientConfig: {
    primary: 'linear-gradient(135deg, #3B82F6 0%, #60A5FA 40%, #93C5FD 100%)',
    secondary: 'linear-gradient(135deg, #0d9488 0%, #14b8a6 50%, #2dd4bf 100%)',
  },
  scrollbarColor: 'rgba(59, 130, 246, 0.2)',
};

// ── 2. Corporate Light ──
// Kurumsal açık tema — beyaz + koyu mavi
// Temiz, güvenilir, erişilebilir
export const corporateLight: ThemePreset = {
  id: 'corporate-light',
  name: 'Corporate Light',
  description: 'Temiz beyaz arka plan, koyu mavi vurgular. Klasik kurumsal.',
  mode: 'light',
  preview: {
    bgColor: '#F5F7FA',
    primaryColor: '#2563EB',
    accentColor: '#0D9488',
    textColor: '#0F172A',
    cardColor: '#FFFFFF',
  },
  variables: {
    '--background': '210 20% 97%',
    '--foreground': '222 47% 11%',
    '--card': '0 0% 100%',
    '--card-foreground': '222 47% 11%',
    '--popover': '0 0% 100%',
    '--popover-foreground': '222 47% 11%',
    '--primary': '221 83% 53%',
    '--primary-foreground': '0 0% 100%',
    '--secondary': '210 20% 94%',
    '--secondary-foreground': '222 47% 11%',
    '--muted': '210 20% 96%',
    '--muted-foreground': '215 14% 40%',
    '--accent': '221 70% 95%',
    '--accent-foreground': '222 47% 11%',
    '--destructive': '0 84% 60%',
    '--destructive-foreground': '0 0% 100%',
    '--border': '220 13% 88%',
    '--input': '220 13% 88%',
    '--ring': '221 83% 53%',
    // Charts
    '--chart-1': '221 83% 53%',
    '--chart-2': '174 60% 41%',
    '--chart-3': '280 60% 55%',
    '--chart-4': '38 92% 50%',
    '--chart-5': '160 60% 45%',
    // Sidebar
    '--sidebar-background': '0 0% 100%',
    '--sidebar-foreground': '222 47% 11%',
    '--sidebar-primary': '221 83% 53%',
    '--sidebar-primary-foreground': '0 0% 100%',
    '--sidebar-accent': '210 20% 95%',
    '--sidebar-accent-foreground': '222 47% 11%',
    '--sidebar-border': '220 13% 90%',
    '--sidebar-ring': '221 83% 53%',
  },
  glassConfig: {
    bg: 'rgba(255, 255, 255, 0.8)',
    border: 'rgba(37, 99, 235, 0.08)',
    hoverBorder: 'rgba(37, 99, 235, 0.16)',
    shadow: '0 4px 16px rgba(0, 0, 0, 0.06)',
    hoverShadow: '0 8px 24px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(37, 99, 235, 0.06)',
  },
  gradientConfig: {
    primary: 'linear-gradient(135deg, #2563EB 0%, #3B82F6 40%, #60A5FA 100%)',
    secondary: 'linear-gradient(135deg, #0d9488 0%, #14b8a6 50%, #2dd4bf 100%)',
  },
  scrollbarColor: 'rgba(37, 99, 235, 0.18)',
};

// ── 3. Executive Dark ──
// Premium koyu tema — kömür grisi + altın
// Lüks, prestij, üst düzey
export const executiveDark: ThemePreset = {
  id: 'executive-dark',
  name: 'Executive Dark',
  description: 'Premium koyu arka plan, altın vurgular. Lüks ve prestijli.',
  mode: 'dark',
  preview: {
    bgColor: '#121212',
    primaryColor: '#EAB308',
    accentColor: '#A3841A',
    textColor: '#E5E5E5',
    cardColor: '#1A1A1A',
  },
  variables: {
    '--background': '0 0% 7%',
    '--foreground': '0 0% 90%',
    '--card': '0 0% 10%',
    '--card-foreground': '0 0% 90%',
    '--popover': '0 0% 10%',
    '--popover-foreground': '0 0% 90%',
    '--primary': '38 92% 50%',
    '--primary-foreground': '0 0% 5%',
    '--secondary': '0 0% 14%',
    '--secondary-foreground': '0 0% 85%',
    '--muted': '0 0% 12%',
    '--muted-foreground': '0 0% 50%',
    '--accent': '0 0% 16%',
    '--accent-foreground': '0 0% 90%',
    '--destructive': '0 84% 60%',
    '--destructive-foreground': '0 0% 100%',
    '--border': '0 0% 18%',
    '--input': '0 0% 18%',
    '--ring': '38 92% 50%',
    // Charts
    '--chart-1': '38 92% 50%',
    '--chart-2': '174 60% 41%',
    '--chart-3': '280 60% 55%',
    '--chart-4': '217 91% 60%',
    '--chart-5': '160 60% 45%',
    // Sidebar
    '--sidebar-background': '0 0% 6%',
    '--sidebar-foreground': '0 0% 80%',
    '--sidebar-primary': '38 92% 50%',
    '--sidebar-primary-foreground': '0 0% 5%',
    '--sidebar-accent': '0 0% 12%',
    '--sidebar-accent-foreground': '0 0% 90%',
    '--sidebar-border': '0 0% 14%',
    '--sidebar-ring': '38 92% 50%',
  },
  glassConfig: {
    bg: 'rgba(18, 18, 18, 0.7)',
    border: 'rgba(234, 179, 8, 0.08)',
    hoverBorder: 'rgba(234, 179, 8, 0.18)',
    shadow: '0 8px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.02)',
    hoverShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(234, 179, 8, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
  },
  gradientConfig: {
    primary: 'linear-gradient(135deg, #EAB308 0%, #FACC15 40%, #FDE68A 100%)',
    secondary: 'linear-gradient(135deg, #A3841A 0%, #CA8A04 50%, #EAB308 100%)',
  },
  scrollbarColor: 'rgba(234, 179, 8, 0.2)',
};

// ── 4. Inception Dark ──
// Orijinal Callception teması — koyu lacivert + kırmızı
// Teknoloji, güç, cesaret — onboarding ve landing page için ideal
export const inceptionDark: ThemePreset = {
  id: 'inception-dark',
  name: 'Inception Dark',
  description: 'Orijinal Callception teması. Koyu lacivert + kırmızı vurgular. Cesur ve teknolojik.',
  mode: 'dark',
  preview: {
    bgColor: '#0a0a14',
    primaryColor: '#dc2626',
    accentColor: '#0D9488',
    textColor: '#F2F2F2',
    cardColor: '#101018',
  },
  variables: {
    '--background': '240 20% 4%',
    '--foreground': '0 0% 95%',
    '--card': '240 15% 7%',
    '--card-foreground': '0 0% 95%',
    '--popover': '240 15% 7%',
    '--popover-foreground': '0 0% 95%',
    '--primary': '0 72% 51%',
    '--primary-foreground': '0 0% 100%',
    '--secondary': '240 10% 12%',
    '--secondary-foreground': '0 0% 95%',
    '--muted': '240 10% 10%',
    '--muted-foreground': '215 14% 50%',
    '--accent': '240 10% 14%',
    '--accent-foreground': '0 0% 95%',
    '--destructive': '0 84% 60%',
    '--destructive-foreground': '0 0% 100%',
    '--border': '240 10% 14%',
    '--input': '240 10% 14%',
    '--ring': '0 72% 51%',
    // Charts
    '--chart-1': '0 72% 51%',
    '--chart-2': '174 60% 41%',
    '--chart-3': '280 60% 55%',
    '--chart-4': '38 92% 50%',
    '--chart-5': '160 60% 45%',
    // Sidebar
    '--sidebar-background': '240 20% 3%',
    '--sidebar-foreground': '210 20% 85%',
    '--sidebar-primary': '0 72% 51%',
    '--sidebar-primary-foreground': '0 0% 100%',
    '--sidebar-accent': '240 10% 10%',
    '--sidebar-accent-foreground': '0 0% 95%',
    '--sidebar-border': '240 10% 12%',
    '--sidebar-ring': '0 72% 51%',
  },
  glassConfig: {
    bg: 'rgba(10, 10, 20, 0.7)',
    border: 'rgba(220, 38, 38, 0.08)',
    hoverBorder: 'rgba(220, 38, 38, 0.18)',
    shadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.03)',
    hoverShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 20px rgba(220, 38, 38, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
  },
  gradientConfig: {
    primary: 'linear-gradient(135deg, #dc2626 0%, #ef4444 40%, #f87171 100%)',
    secondary: 'linear-gradient(135deg, #0d9488 0%, #14b8a6 50%, #2dd4bf 100%)',
  },
  scrollbarColor: 'rgba(220, 38, 38, 0.2)',
};

// ── All presets ──
export const THEME_PRESETS: ThemePreset[] = [
  midnightProfessional,
  corporateLight,
  executiveDark,
  inceptionDark,
];

export const DEFAULT_THEME_ID = 'midnight-professional';

export function getThemeById(id: string): ThemePreset {
  return THEME_PRESETS.find((t) => t.id === id) || midnightProfessional;
}
