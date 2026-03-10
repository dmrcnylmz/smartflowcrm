/**
 * S02 Problem — Pain Points (English)
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { SceneContainer, CenteredContent } from '../../../utils/layout';
import { GlassCard, GlowOrb, GridPattern } from '../../../utils/shapes';
import { typewriter, fadeIn, fadeOut, springIn, staggerDelay } from '../../../utils/animations';
import { COLORS, FONTS } from '../../../theme-en';

const PROBLEMS = [
  {
    icon: '📵',
    title: 'Missed Calls',
    description: '30% of your customers can\'t reach you on the first try',
    stat: '30%',
  },
  {
    icon: '⏳',
    title: 'Long Wait Times',
    description: 'Average hold time exceeds 3 minutes',
    stat: '3+ min',
  },
  {
    icon: '💸',
    title: 'Rising Costs',
    description: 'Call center expenses keep climbing year over year',
    stat: '↑ 40%',
  },
];

export const S02_Problem: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headlineText = 'Every Day, Calls Go Unanswered...';
  const visibleChars = typewriter(frame, 10, headlineText.length, 2);
  const headlineOpacity = fadeIn(frame, 5, 15);
  const exitOpacity = fadeOut(frame, 210, 30);

  return (
    <SceneContainer>
      <GridPattern opacity={0.04} />
      <GlowOrb color={COLORS.primary} size={400} x="70%" y="30%" pulseSpeed={0.03} />

      <CenteredContent style={{ opacity: exitOpacity }}>
        <h2
          style={{
            fontFamily: FONTS.display,
            fontSize: 52,
            fontWeight: 700,
            color: COLORS.textPrimary,
            marginBottom: 60,
            opacity: headlineOpacity,
            minHeight: 70,
          }}
        >
          {headlineText.slice(0, visibleChars)}
          {visibleChars < headlineText.length && (
            <span style={{ opacity: Math.sin(frame * 0.15) > 0 ? 1 : 0, color: COLORS.primary }}>|</span>
          )}
        </h2>

        <div style={{ display: 'flex', gap: 40, width: '100%', justifyContent: 'center' }}>
          {PROBLEMS.map((problem, i) => {
            const delay = 60 + staggerDelay(i, 15);
            const cardProgress = springIn({ fps, frame, delay, config: { damping: 14, mass: 0.5, stiffness: 100 } });

            return (
              <GlassCard
                key={i}
                style={{
                  flex: 1,
                  maxWidth: 360,
                  textAlign: 'center',
                  opacity: cardProgress,
                  transform: `translateY(${(1 - cardProgress) * 50}px)`,
                }}
              >
                <div style={{ fontSize: 48, marginBottom: 16 }}>{problem.icon}</div>
                <div style={{ fontFamily: FONTS.display, fontSize: 36, fontWeight: 800, color: COLORS.primary, marginBottom: 8 }}>
                  {problem.stat}
                </div>
                <h3 style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 8 }}>
                  {problem.title}
                </h3>
                <p style={{ fontSize: 16, color: COLORS.textSecondary, lineHeight: 1.5, margin: 0 }}>
                  {problem.description}
                </p>
              </GlassCard>
            );
          })}
        </div>
      </CenteredContent>
    </SceneContainer>
  );
};
