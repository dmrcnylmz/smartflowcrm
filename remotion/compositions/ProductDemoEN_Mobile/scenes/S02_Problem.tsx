/**
 * S02 Problem — Pain Points (Mobile 9:16)
 * 3 cards stacked vertically
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { SceneContainer, CenteredContent } from '../../../utils/layout';
import { GlassCard, GlowOrb, GridPattern } from '../../../utils/shapes';
import { typewriter, fadeIn, fadeOut, springIn, staggerDelay } from '../../../utils/animations';
import { COLORS, FONTS } from '../../../theme-en';

const PROBLEMS = [
  { icon: '📵', title: 'Missed Calls', description: '30% can\'t reach you on the first try', stat: '30%' },
  { icon: '⏳', title: 'Long Wait Times', description: 'Average hold time exceeds 3 minutes', stat: '3+ min' },
  { icon: '💸', title: 'Rising Costs', description: 'Call center expenses keep climbing', stat: '↑ 40%' },
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
      <GlowOrb color={COLORS.primary} size={300} x="70%" y="25%" pulseSpeed={0.03} />

      <CenteredContent style={{ opacity: exitOpacity, padding: '0 60px' }}>
        <h2
          style={{
            fontFamily: FONTS.display,
            fontSize: 36,
            fontWeight: 700,
            color: COLORS.textPrimary,
            marginBottom: 50,
            opacity: headlineOpacity,
            minHeight: 50,
            textAlign: 'center',
            lineHeight: 1.3,
          }}
        >
          {headlineText.slice(0, visibleChars)}
          {visibleChars < headlineText.length && (
            <span style={{ opacity: Math.sin(frame * 0.15) > 0 ? 1 : 0, color: COLORS.primary }}>|</span>
          )}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%', alignItems: 'center' }}>
          {PROBLEMS.map((problem, i) => {
            const delay = 60 + staggerDelay(i, 15);
            const cardProgress = springIn({ fps, frame, delay, config: { damping: 14, mass: 0.5, stiffness: 100 } });

            return (
              <GlassCard
                key={i}
                style={{
                  width: '100%',
                  maxWidth: 600,
                  textAlign: 'center',
                  opacity: cardProgress,
                  transform: `translateY(${(1 - cardProgress) * 40}px)`,
                  padding: '28px 24px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'center' }}>
                  <span style={{ fontSize: 36 }}>{problem.icon}</span>
                  <div style={{ fontFamily: FONTS.display, fontSize: 32, fontWeight: 800, color: COLORS.primary }}>
                    {problem.stat}
                  </div>
                </div>
                <h3 style={{ fontFamily: FONTS.display, fontSize: 20, fontWeight: 600, color: COLORS.textPrimary, marginTop: 8, marginBottom: 4 }}>
                  {problem.title}
                </h3>
                <p style={{ fontSize: 15, color: COLORS.textSecondary, lineHeight: 1.4, margin: 0 }}>
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
