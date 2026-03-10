/**
 * S04 Features — 6-Feature Carousel (Mobile 9:16)
 * Single column: feature card on top, dot nav below
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { SceneContainer, CenteredContent } from '../../../utils/layout';
import { GlowOrb, GridPattern, AnimatedUnderline, GlassCard } from '../../../utils/shapes';
import { fadeIn, fadeOut, slideUp, drawLine } from '../../../utils/animations';
import { COLORS, FONTS, FEATURES_EN } from '../../../theme-en';

const FEATURE_ICONS: Record<string, React.ReactNode> = {
  'AI Voice Assistant': (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke={COLORS.primary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
  ),
  'Auto Scheduling': (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke={COLORS.teal} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>
    </svg>
  ),
  'Complaint Management': (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke={COLORS.warning} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  'Smart Analytics': (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke={COLORS.tealLight} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  ),
  'CRM Integration': (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke={COLORS.primary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/><line x1="14" y1="4" x2="10" y2="20"/>
    </svg>
  ),
  'Enterprise Security': (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke={COLORS.success} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>
    </svg>
  ),
};

export const S04_Features: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = fadeIn(frame, 5, 20);
  const titleSlide = slideUp(frame, 5, 20);
  const underlineProgress = drawLine(frame, 20, 25);

  const featureStartFrame = 60;
  const framesPerFeature = 70;
  const currentFeatureFloat = (frame - featureStartFrame) / framesPerFeature;
  const currentFeatureIndex = Math.max(0, Math.min(5, Math.floor(currentFeatureFloat)));
  const featureProgress = currentFeatureFloat - currentFeatureIndex;

  const exitOpacity = fadeOut(frame, 450, 30);

  return (
    <SceneContainer>
      <GridPattern opacity={0.03} cellSize={60} />
      <GlowOrb color={COLORS.primary} size={250} x="20%" y="35%" pulseSpeed={0.03} />
      <GlowOrb color={COLORS.teal} size={200} x="80%" y="65%" pulseSpeed={0.04} />

      <CenteredContent style={{ opacity: exitOpacity, padding: '0 50px' }}>
        {/* Title */}
        <div style={{ marginBottom: 50 }}>
          <h2 style={{ fontFamily: FONTS.display, fontSize: 40, fontWeight: 700, color: COLORS.textPrimary, margin: 0, opacity: titleOpacity, transform: `translateY(${titleSlide}px)` }}>
            What We Offer
          </h2>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
            <AnimatedUnderline progress={underlineProgress} width={180} />
          </div>
        </div>

        {/* Feature Card — Full width, centered */}
        {frame >= featureStartFrame && (
          <GlassCard
            highlighted
            style={{
              width: '100%', maxWidth: 700,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              textAlign: 'center', padding: '44px 32px',
              opacity: featureProgress < 0.85 ? 1 : fadeOut(featureProgress, 0.85, 0.15),
              marginBottom: 40,
            }}
          >
            <div style={{ marginBottom: 20 }}>
              {FEATURE_ICONS[FEATURES_EN[currentFeatureIndex].title] || <span style={{ fontSize: 56 }}>{FEATURES_EN[currentFeatureIndex].icon}</span>}
            </div>
            <h3 style={{ fontFamily: FONTS.display, fontSize: 28, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 14 }}>
              {FEATURES_EN[currentFeatureIndex].title}
            </h3>
            <p style={{ fontSize: 18, color: COLORS.textSecondary, lineHeight: 1.6, margin: 0, maxWidth: 500 }}>
              {FEATURES_EN[currentFeatureIndex].description}
            </p>
          </GlassCard>
        )}

        {/* Dot Navigation */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center' }}>
          {FEATURES_EN.map((_, i) => {
            const isActive = i === currentFeatureIndex;
            const isPast = i < currentFeatureIndex;
            const dotOpacity = frame >= featureStartFrame + i * framesPerFeature ? 1 : fadeIn(frame, featureStartFrame, 20);
            return (
              <div key={i} style={{
                width: isActive ? 28 : 10, height: 10, borderRadius: 5,
                backgroundColor: isActive ? COLORS.primary : isPast ? COLORS.teal : COLORS.borderColor,
                boxShadow: isActive ? `0 0 10px ${COLORS.glowRed}` : 'none',
                opacity: dotOpacity,
                transition: 'width 0.3s',
              }} />
            );
          })}
        </div>

        {/* Counter */}
        <div style={{ marginTop: 20, fontFamily: FONTS.display, fontSize: 14, color: COLORS.textMuted, letterSpacing: 2 }}>
          {`0${currentFeatureIndex + 1} / 06`}
        </div>
      </CenteredContent>
    </SceneContainer>
  );
};
