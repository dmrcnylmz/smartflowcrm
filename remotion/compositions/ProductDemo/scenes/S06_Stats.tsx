/**
 * S06 Stats — Counter Animations (8s / 240 frames)
 *
 * 2×2 grid of stats with count-up animations and shine effect
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { SceneContainer, CenteredContent } from '../../../utils/layout';
import { GlowOrb, GlassCard, GridPattern } from '../../../utils/shapes';
import {
  fadeIn,
  fadeOut,
  countUp,
  springIn,
  staggerDelay,
  shimmer,
} from '../../../utils/animations';
import { COLORS, FONTS, STATS } from '../../../theme';

export const S06_Stats: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Exit
  const exitOpacity = fadeOut(frame, 210, 30);

  return (
    <SceneContainer>
      <GridPattern opacity={0.03} />
      <GlowOrb color={COLORS.primary} size={400} x="50%" y="50%" pulseSpeed={0.025} />
      <GlowOrb color={COLORS.teal} size={250} x="80%" y="30%" pulseSpeed={0.04} />

      <CenteredContent style={{ opacity: exitOpacity }}>
        {/* 2x2 Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 40,
            width: '100%',
            maxWidth: 900,
          }}
        >
          {STATS.map((stat, i) => {
            const delay = 20 + staggerDelay(i, 15);
            const cardProgress = springIn({
              fps,
              frame,
              delay,
              config: { damping: 14, mass: 0.5, stiffness: 90 },
            });

            // Count-up starts after card appears
            const countStart = delay + 15;
            const currentValue = countUp(frame, countStart, 50, stat.value);

            // Shimmer effect
            const shimmerX = shimmer(frame, countStart + 30, 40);

            return (
              <GlassCard
                key={i}
                style={{
                  textAlign: 'center',
                  padding: '48px 40px',
                  opacity: cardProgress,
                  transform: `translateY(${(1 - cardProgress) * 40}px) scale(${0.9 + cardProgress * 0.1})`,
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                {/* Shimmer overlay */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent)`,
                    transform: `translateX(${shimmerX}%)`,
                    pointerEvents: 'none' as const,
                  }}
                />

                {/* Value */}
                <div
                  style={{
                    fontFamily: FONTS.display,
                    fontSize: 72,
                    fontWeight: 900,
                    background: `linear-gradient(135deg, ${COLORS.textPrimary}, ${COLORS.primary})`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    lineHeight: 1,
                    marginBottom: 12,
                  }}
                >
                  {stat.prefix || ''}
                  {currentValue}
                  {stat.suffix}
                </div>

                {/* Label */}
                <div
                  style={{
                    fontSize: 20,
                    color: COLORS.textSecondary,
                    fontWeight: 500,
                  }}
                >
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
