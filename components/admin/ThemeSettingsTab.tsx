'use client';

import { useState } from 'react';
import { Check, Palette, Moon, Sun, Crown, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme/ThemeProvider';
import type { ThemePreset } from '@/lib/theme/presets';
import { useToast } from '@/components/ui/toast';
import { useTranslations } from 'next-intl';

// =============================================
// Mini Preview Component — Shows a mockup of the theme
// =============================================

function ThemePreview({ preset, isActive }: { preset: ThemePreset; isActive: boolean }) {
  const { bgColor, primaryColor, textColor, cardColor, accentColor } = preset.preview;

  return (
    <div
      className="relative w-full rounded-xl overflow-hidden border-2 transition-all duration-300"
      style={{
        backgroundColor: bgColor,
        borderColor: isActive ? primaryColor : 'transparent',
      }}
    >
      {/* Mini sidebar + content mockup */}
      <div className="flex h-[140px]">
        {/* Mini sidebar */}
        <div
          className="w-12 shrink-0 flex flex-col items-center gap-2 py-3 border-r"
          style={{
            backgroundColor: preset.mode === 'light'
              ? 'rgba(255,255,255,0.9)'
              : `color-mix(in srgb, ${bgColor} 70%, white 3%)`,
            borderColor: preset.mode === 'light'
              ? 'rgba(0,0,0,0.08)'
              : 'rgba(255,255,255,0.06)',
          }}
        >
          {/* Logo dot */}
          <div
            className="w-5 h-5 rounded-md mb-1"
            style={{ backgroundColor: primaryColor }}
          />
          {/* Nav items */}
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="w-6 h-1.5 rounded-full"
              style={{
                backgroundColor: i === 1
                  ? primaryColor
                  : preset.mode === 'light'
                    ? 'rgba(0,0,0,0.1)'
                    : 'rgba(255,255,255,0.08)',
              }}
            />
          ))}
        </div>

        {/* Content area */}
        <div className="flex-1 p-3 flex flex-col gap-2">
          {/* Header bar */}
          <div className="flex items-center gap-2">
            <div
              className="w-16 h-2 rounded-full"
              style={{ backgroundColor: textColor, opacity: 0.7 }}
            />
            <div className="flex-1" />
            <div
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: primaryColor, opacity: 0.3 }}
            />
          </div>

          {/* Cards row */}
          <div className="flex gap-2 flex-1">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex-1 rounded-lg p-2 flex flex-col justify-between"
                style={{
                  backgroundColor: cardColor,
                  border: `1px solid ${preset.mode === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                <div
                  className="w-full h-1.5 rounded-full"
                  style={{ backgroundColor: textColor, opacity: 0.2 }}
                />
                <div
                  className="w-8 h-5 rounded-md self-end"
                  style={{
                    backgroundColor: i === 1 ? primaryColor : accentColor,
                    opacity: i === 1 ? 1 : 0.4,
                  }}
                />
              </div>
            ))}
          </div>

          {/* Bottom bar */}
          <div className="flex gap-2 items-center">
            <div
              className="w-20 h-1.5 rounded-full"
              style={{ backgroundColor: textColor, opacity: 0.15 }}
            />
            <div
              className="w-12 h-1.5 rounded-full"
              style={{ backgroundColor: primaryColor, opacity: 0.3 }}
            />
          </div>
        </div>
      </div>

      {/* Active indicator */}
      {isActive && (
        <div
          className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center"
          style={{ backgroundColor: primaryColor }}
        >
          <Check className="h-3.5 w-3.5" style={{ color: preset.mode === 'dark' && preset.id === 'executive-dark' ? '#0D0D0D' : '#FFFFFF' }} />
        </div>
      )}
    </div>
  );
}

// =============================================
// Theme Icon
// =============================================

function ThemeIcon({ preset }: { preset: ThemePreset }) {
  if (preset.id === 'inception-dark') return <Flame className="h-4 w-4" />;
  if (preset.id === 'executive-dark') return <Crown className="h-4 w-4" />;
  if (preset.mode === 'light') return <Sun className="h-4 w-4" />;
  return <Moon className="h-4 w-4" />;
}

// =============================================
// Main Component
// =============================================

export default function ThemeSettingsTab() {
  const { activeTheme, setTheme, presets } = useTheme();
  const { toast } = useToast();
  const t = useTranslations('admin');
  const [applying, setApplying] = useState<string | null>(null);

  async function handleThemeSelect(preset: ThemePreset) {
    if (preset.id === activeTheme.id) return;

    setApplying(preset.id);

    // Apply theme (instant visual change)
    setTheme(preset.id);

    // Small delay for UX feel
    await new Promise((r) => setTimeout(r, 300));
    setApplying(null);

    toast({
      title: t('themeChanged'),
      description: t('themeApplied', { name: preset.name }),
      variant: 'default',
    });
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Palette className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">{t('appearanceSettings')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('appearanceSettingsDesc')}
          </p>
        </div>
      </div>

      {/* Aktif Tema Badge */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t('activeTheme')}:</span>
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium"
          style={{
            backgroundColor: `${activeTheme.preview.primaryColor}15`,
            color: activeTheme.preview.primaryColor,
          }}
        >
          <ThemeIcon preset={activeTheme} />
          {activeTheme.name}
        </span>
      </div>

      {/* Theme Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {presets.map((preset) => {
          const isActive = preset.id === activeTheme.id;
          const isApplying = applying === preset.id;

          return (
            <button
              key={preset.id}
              onClick={() => handleThemeSelect(preset)}
              disabled={isActive || isApplying}
              className={cn(
                'group text-left rounded-2xl border p-4 transition-all duration-300',
                'hover:shadow-lg hover:-translate-y-0.5',
                isActive
                  ? 'border-primary/30 bg-primary/5 shadow-md'
                  : 'border-border hover:border-primary/20 bg-card',
                isApplying && 'opacity-70 pointer-events-none'
              )}
            >
              {/* Preview */}
              <ThemePreview preset={preset} isActive={isActive} />

              {/* Info */}
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ThemeIcon preset={preset} />
                    <h3 className="font-semibold text-sm">{preset.name}</h3>
                  </div>
                  {isActive && (
                    <span className="text-[10px] font-medium uppercase tracking-wider text-primary">
                      {t('active')}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {preset.description}
                </p>

                {/* Color swatches */}
                <div className="flex items-center gap-1.5 pt-1">
                  <div
                    className="w-5 h-5 rounded-full ring-1 ring-white/10"
                    style={{ backgroundColor: preset.preview.bgColor }}
                    title={t('background')}
                  />
                  <div
                    className="w-5 h-5 rounded-full ring-1 ring-white/10"
                    style={{ backgroundColor: preset.preview.primaryColor }}
                    title={t('primaryColor')}
                  />
                  <div
                    className="w-5 h-5 rounded-full ring-1 ring-white/10"
                    style={{ backgroundColor: preset.preview.accentColor }}
                    title={t('accentColor')}
                  />
                  <div
                    className="w-5 h-5 rounded-full ring-1 ring-white/10"
                    style={{ backgroundColor: preset.preview.cardColor }}
                    title={t('cardColor')}
                  />
                  <div className="flex-1" />
                  {!isActive && (
                    <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                      {t('clickAndApply')}
                    </span>
                  )}
                </div>
              </div>

              {/* Applying indicator */}
              {isApplying && (
                <div className="mt-3 flex items-center gap-2 text-xs text-primary">
                  <div className="h-3 w-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  {t('applying')}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Info box */}
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">{t('info')}:</strong> {t('themeInfoText')}
        </p>
      </div>
    </div>
  );
}
