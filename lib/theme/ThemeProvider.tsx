'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import {
  THEME_PRESETS,
  DEFAULT_THEME_ID,
  getThemeById,
  type ThemePreset,
} from './presets';

// =============================================
// Context
// =============================================

interface ThemeContextValue {
  activeTheme: ThemePreset;
  setTheme: (id: string) => void;
  presets: ThemePreset[];
  loading: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// =============================================
// Apply theme to DOM
// =============================================

function applyThemeToDom(preset: ThemePreset) {
  const root = document.documentElement;

  // 1. Apply all CSS custom properties
  for (const [varName, value] of Object.entries(preset.variables)) {
    root.style.setProperty(varName, value);
  }

  // 2. Apply glass morphism config via CSS custom properties
  root.style.setProperty('--glass-bg', preset.glassConfig.bg);
  root.style.setProperty('--glass-border', preset.glassConfig.border);
  root.style.setProperty('--glass-hover-border', preset.glassConfig.hoverBorder);
  root.style.setProperty('--glass-shadow', preset.glassConfig.shadow);
  root.style.setProperty('--glass-hover-shadow', preset.glassConfig.hoverShadow);

  // 3. Apply gradient config
  root.style.setProperty('--gradient-primary', preset.gradientConfig.primary);
  root.style.setProperty('--gradient-secondary', preset.gradientConfig.secondary);

  // 4. Apply scrollbar color
  root.style.setProperty('--scrollbar-color', preset.scrollbarColor);

  // 5. Apply dark/light mode class
  if (preset.mode === 'light') {
    root.classList.add('light');
    root.classList.remove('dark');
  } else {
    root.classList.remove('light');
    root.classList.add('dark');
  }

  // 6. Store in localStorage for instant load on refresh (before Firestore)
  try {
    localStorage.setItem('callception-theme', preset.id);
  } catch {
    // Storage unavailable
  }
}

// =============================================
// Provider
// =============================================

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [activeTheme, setActiveTheme] = useState<ThemePreset>(
    getThemeById(DEFAULT_THEME_ID)
  );
  const [loading, setLoading] = useState(true);

  // On mount: restore theme from localStorage (fast), then try Firestore
  useEffect(() => {
    // Step 1: Instant restore from localStorage
    try {
      const stored = localStorage.getItem('callception-theme');
      if (stored) {
        const theme = getThemeById(stored);
        setActiveTheme(theme);
        applyThemeToDom(theme);
      } else {
        // Apply default theme
        applyThemeToDom(getThemeById(DEFAULT_THEME_ID));
      }
    } catch {
      applyThemeToDom(getThemeById(DEFAULT_THEME_ID));
    }

    // Step 2: Fetch from tenant settings API (source of truth)
    async function fetchThemeFromServer() {
      try {
        const res = await fetch('/api/tenant/settings', {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          const themeId = data?.settings?.themeId;
          if (themeId && THEME_PRESETS.some((p) => p.id === themeId)) {
            const theme = getThemeById(themeId);
            setActiveTheme(theme);
            applyThemeToDom(theme);
          }
        }
      } catch {
        // Silent fail — use cached/default theme
      } finally {
        setLoading(false);
      }
    }

    fetchThemeFromServer();
  }, []);

  // Set theme handler — apply to DOM + persist
  const setTheme = useCallback((id: string) => {
    const theme = getThemeById(id);
    setActiveTheme(theme);
    applyThemeToDom(theme);

    // Persist to Firestore via tenant settings API (fire-and-forget)
    fetch('/api/tenant/settings', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ themeId: id }),
    }).catch(() => {
      // Silent fail on persist
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      activeTheme,
      setTheme,
      presets: THEME_PRESETS,
      loading,
    }),
    [activeTheme, setTheme, loading]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

// =============================================
// Hook
// =============================================

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
