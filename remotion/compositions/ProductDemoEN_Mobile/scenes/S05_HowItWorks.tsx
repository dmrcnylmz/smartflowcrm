/**
 * S05 How It Works — 3-Step Flow (Mobile 9:16)
 * Vertical stack with vertical connecting lines
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { SceneContainer, CenteredContent } from '../../../utils/layout';
import { GlassCard, GlowOrb, GridPattern, AnimatedUnderline } from '../../../utils/shapes';
import { fadeIn, fadeOut, slideUp, springIn, staggerDelay, drawLine } from '../../../utils/animations';
import { COLORS, FONTS, STEPS_EN } from '../../../theme-en';

export const S05_HowItWorks: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = fadeIn(frame, 5, 20);
  const titleSlide = slideUp(frame, 5, 20);
  const underlineProgress = drawLine(frame, 20, 25);
  const line1Progress = drawLine(frame, 80, 30);
  const line2Progress = drawLine(frame, 110, 30);
  const exitOpacity = fadeOut(frame, 210, 30);

  return (
    <SceneContainer>
      <GridPattern opacity={0.03} />
      <GlowOrb color={COLORS.teal} size={300} x="50%" y="50%" pulseSpeed={0.03} />

      <CenteredContent style={{ opacity: exitOpacity, padding: '0 60px' }}>
        {/* Title */}
        <div style={{ marginBottom: 50 }}>
          <h2 style={{ fontFamily: FONTS.display, fontSize: 40, fontWeight: 700, color: COLORS.textPrimary, margin: 0, opacity: titleOpacity, transform: `translateY(${titleSlide}px)` }}>
            How It Works
          </h2>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
            <AnimatedUnderline progress={underlineProgress} width={160} color={COLORS.teal} />
          </div>
        </div>

        {/* Steps — vertical */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, width: '100%' }}>
          {STEPS_EN.map((step, i) => {
            const delay = 50 + staggerDelay(i, 20);
            const cardProgress = springIn({ fps, frame, delay, config: { damping: 14, mass: 0.5, stiffness: 90 } });

            return (
              <React.Fragment key={i}>
                <GlassCard
                  style={{
                    width: '100%', maxWidth: 500, textAlign: 'center',
                    opacity: cardProgress, transform: `translateY(${(1 - cardProgress) * 30}px)`,
                    padding: '28px 24px',
                  }}
                >
                  {/* Step number circle */}
                  <div style={{
                    width: 56, height: 56, borderRadius: '50%',
                    background: `linear-gradient(135deg, ${COLORS.teal}, ${COLORS.tealLight})`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 16px', boxShadow: `0 0 20px ${COLORS.glowTeal}`,
                  }}>
                    <span style={{ fontFamily: FONTS.display, fontSize: 20, fontWeight: 800, color: '#fff' }}>{step.number}</span>
                  </div>

                  <h3 style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 8 }}>
                    {step.title}
                  </h3>
                  <p style={{ fontSize: 15, color: COLORS.textSecondary, lineHeight: 1.4, margin: 0 }}>
                    {step.description}
                  </p>
                </GlassCard>

                {/* Vertical connecting line (between cards) */}
                {i < STEPS_EN.length - 1 && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: 50 }}>
                    <div style={{
                      width: 2,
                      height: `${(i === 0 ? line1Progress : line2Progress) * 100}%`,
                      background: `linear-gradient(180deg, ${COLORS.teal}, ${COLORS.tealLight})`,
                      borderRadius: 1,
                    }} />
                    {/* Arrow head pointing down */}
                    <div style={{
                      width: 0, height: 0,
                      borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
                      borderTop: `10px solid ${COLORS.tealLight}`,
                      opacity: (i === 0 ? line1Progress : line2Progress) > 0.9 ? 1 : 0,
                    }} />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </CenteredContent>
    </SceneContainer>
  );
};
