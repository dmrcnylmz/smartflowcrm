/**
 * P03 Comparison — Feature Highlights (English)
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { SceneContainer, CenteredContent } from '../../../utils/layout';
import { GlowOrb, GridPattern, CheckIcon, AnimatedUnderline } from '../../../utils/shapes';
import { fadeIn, fadeOut, springIn, staggerDelay, drawLine, slideUp } from '../../../utils/animations';
import { COLORS, FONTS } from '../../../theme-en';

const COMPARISON_ROWS = [
  { feature: 'AI Voice Assistant', starter: true, pro: true, enterprise: true },
  { feature: 'Auto Scheduling', starter: true, pro: true, enterprise: true },
  { feature: 'CRM Integration', starter: false, pro: true, enterprise: true },
  { feature: 'Advanced Analytics', starter: false, pro: true, enterprise: true },
  { feature: 'Custom Model Training', starter: false, pro: false, enterprise: true },
  { feature: 'API Access', starter: false, pro: false, enterprise: true },
  { feature: 'SLA Guarantee', starter: false, pro: false, enterprise: true },
];

const XIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={COLORS.textMuted} strokeWidth="2" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const P03_Comparison: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = fadeIn(frame, 5, 15);
  const titleSlide = slideUp(frame, 5, 15);
  const underlineProgress = drawLine(frame, 15, 20);
  const exitOpacity = fadeOut(frame, 150, 30);

  return (
    <SceneContainer>
      <GridPattern opacity={0.02} />
      <GlowOrb color={COLORS.teal} size={350} x="50%" y="50%" pulseSpeed={0.03} />

      <CenteredContent style={{ opacity: exitOpacity, maxWidth: 1200 }}>
        <div style={{ marginBottom: 50 }}>
          <h2 style={{ fontFamily: FONTS.display, fontSize: 42, fontWeight: 700, color: COLORS.textPrimary, margin: 0, opacity: titleOpacity, transform: `translateY(${titleSlide}px)` }}>
            Plan Comparison
          </h2>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
            <AnimatedUnderline progress={underlineProgress} width={220} color={COLORS.teal} />
          </div>
        </div>

        <div style={{ width: '100%', background: COLORS.bgCard, border: `1px solid ${COLORS.borderColor}`, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '20px 32px', borderBottom: `1px solid ${COLORS.borderColor}`, opacity: fadeIn(frame, 20, 15) }}>
            <div style={{ fontSize: 16, color: COLORS.textMuted, fontWeight: 500 }}>Feature</div>
            <div style={{ fontSize: 16, color: COLORS.textSecondary, fontWeight: 600, textAlign: 'center' }}>Starter</div>
            <div style={{ fontSize: 16, color: COLORS.primary, fontWeight: 700, textAlign: 'center' }}>Professional</div>
            <div style={{ fontSize: 16, color: COLORS.textSecondary, fontWeight: 600, textAlign: 'center' }}>Enterprise</div>
          </div>

          {COMPARISON_ROWS.map((row, i) => {
            const rowProgress = springIn({ fps, frame, delay: 30 + staggerDelay(i, 8), config: { damping: 20, mass: 0.3, stiffness: 120 } });
            return (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '16px 32px',
                borderBottom: i < COMPARISON_ROWS.length - 1 ? `1px solid ${COLORS.borderColor}30` : 'none',
                opacity: rowProgress, transform: `translateX(${(1 - rowProgress) * 20}px)`,
                background: i % 2 === 0 ? 'transparent' : `${COLORS.bgSurface}50`,
              }}>
                <div style={{ fontSize: 15, color: COLORS.textSecondary }}>{row.feature}</div>
                <div style={{ textAlign: 'center', display: 'flex', justifyContent: 'center' }}>
                  {row.starter ? <CheckIcon size={20} color={COLORS.teal} /> : <XIcon />}
                </div>
                <div style={{ textAlign: 'center', display: 'flex', justifyContent: 'center' }}>
                  {row.pro ? <CheckIcon size={20} color={COLORS.primary} /> : <XIcon />}
                </div>
                <div style={{ textAlign: 'center', display: 'flex', justifyContent: 'center' }}>
                  {row.enterprise ? <CheckIcon size={20} color={COLORS.teal} /> : <XIcon />}
                </div>
              </div>
            );
          })}
        </div>
      </CenteredContent>
    </SceneContainer>
  );
};
