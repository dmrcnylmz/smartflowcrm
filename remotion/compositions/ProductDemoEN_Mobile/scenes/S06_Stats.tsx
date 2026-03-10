/**
 * S06 Stats — Counter Animations (Mobile 9:16)
 * 2-column grid with tighter spacing
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { SceneContainer, CenteredContent } from '../../../utils/layout';
import { GlowOrb, GlassCard, GridPattern } from '../../../utils/shapes';
import { fadeOut, countUp, springIn, staggerDelay, shimmer } from '../../../utils/animations';
import { COLORS, FONTS, STATS_EN } from '../../../theme-en';

export const S06_Stats: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const exitOpacity = fadeOut(frame, 210, 30);

  return (
    <SceneContainer>
      <GridPattern opacity={0.03} />
      <GlowOrb color={COLORS.primary} size={300} x="50%" y="45%" pulseSpeed={0.025} />
      <GlowOrb color={COLORS.teal} size={200} x="75%" y="30%" pulseSpeed={0.04} />

      <CenteredContent style={{ opacity: exitOpacity, padding: '0 50px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, width: '100%', maxWidth: 700 }}>
          {STATS_EN.map((stat, i) => {
            const delay = 20 + staggerDelay(i, 15);
            const cardProgress = springIn({ fps, frame, delay, config: { damping: 14, mass: 0.5, stiffness: 90 } });
            const countStart = delay + 15;
            const currentValue = countUp(frame, countStart, 50, stat.value);
            const shimmerX = shimmer(frame, countStart + 30, 40);

            return (
              <GlassCard
                key={i}
                style={{
                  textAlign: 'center', padding: '36px 20px', opacity: cardProgress,
                  transform: `translateY(${(1 - cardProgress) * 30}px) scale(${0.9 + cardProgress * 0.1})`,
                  overflow: 'hidden', position: 'relative',
                }}
              >
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent)',
                  transform: `translateX(${shimmerX}%)`, pointerEvents: 'none' as const,
                }} />
                <div style={{
                  fontFamily: FONTS.display, fontSize: 56, fontWeight: 900,
                  background: `linear-gradient(135deg, ${COLORS.textPrimary}, ${COLORS.primary})`,
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  lineHeight: 1, marginBottom: 10,
                }}>
                  {stat.prefix}{currentValue}{stat.suffix}
                </div>
                <div style={{ fontSize: 16, color: COLORS.textSecondary, fontWeight: 500 }}>
                  {stat.label}
                </div>
              </GlassCard>
            );
          })}
        </div>
      </CenteredContent>
    </SceneContainer>
  );
};
