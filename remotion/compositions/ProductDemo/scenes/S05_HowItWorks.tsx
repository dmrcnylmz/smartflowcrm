/**
 * S05 How It Works — 3-Step Flow (8s / 240 frames)
 *
 * Section title → 3 numbered GlassCards → Connected by animated lines
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { SceneContainer, CenteredContent } from '../../../utils/layout';
import { GlassCard, GlowOrb, GridPattern, AnimatedUnderline } from '../../../utils/shapes';
import {
  fadeIn,
  fadeOut,
  slideUp,
  springIn,
  staggerDelay,
  drawLine,
} from '../../../utils/animations';
import { COLORS, FONTS, STEPS } from '../../../theme';

export const S05_HowItWorks: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Title
  const titleOpacity = fadeIn(frame, 5, 20);
  const titleSlide = slideUp(frame, 5, 20);
  const underlineProgress = drawLine(frame, 20, 25);

  // Connection lines
  const line1Progress = drawLine(frame, 80, 30);
  const line2Progress = drawLine(frame, 110, 30);

  // Exit
  const exitOpacity = fadeOut(frame, 210, 30);

  return (
    <SceneContainer>
      <GridPattern opacity={0.03} />
      <GlowOrb color={COLORS.teal} size={350} x="50%" y="55%" pulseSpeed={0.03} />

      <CenteredContent style={{ opacity: exitOpacity }}>
        {/* Title */}
        <div style={{ marginBottom: 70 }}>
          <h2
            style={{
              fontFamily: FONTS.display,
              fontSize: 48,
              fontWeight: 700,
              color: COLORS.textPrimary,
              margin: 0,
              opacity: titleOpacity,
              transform: `translateY(${titleSlide}px)`,
            }}
          >
            Nasıl Çalışır?
          </h2>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
            <AnimatedUnderline progress={underlineProgress} width={180} color={COLORS.teal} />
          </div>
        </div>

        {/* Steps row with connecting lines */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 0,
            width: '100%',
            justifyContent: 'center',
          }}
        >
          {STEPS.map((step, i) => {
            const delay = 50 + staggerDelay(i, 20);
            const cardProgress = springIn({
              fps,
              frame,
              delay,
              config: { damping: 14, mass: 0.5, stiffness: 90 },
            });

            return (
              <React.Fragment key={i}>
                {/* Step card */}
                <GlassCard
                  style={{
                    width: 340,
                    textAlign: 'center',
                    opacity: cardProgress,
                    transform: `translateY(${(1 - cardProgress) * 40}px)`,
                    position: 'relative',
                  }}
                >
                  {/* Step number */}
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: '50%',
                      background: `linear-gradient(135deg, ${COLORS.teal}, ${COLORS.tealLight})`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 20px',
                      boxShadow: `0 0 20px ${COLORS.glowTeal}`,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: FONTS.display,
                        fontSize: 24,
                        fontWeight: 800,
                        color: '#fff',
                      }}
                    >
                      {step.number}
                    </span>
                  </div>

                  {/* Title */}
                  <h3
                    style={{
                      fontFamily: FONTS.display,
                      fontSize: 24,
                      fontWeight: 700,
                      color: COLORS.textPrimary,
                      marginBottom: 10,
                    }}
                  >
                    {step.title}
                  </h3>

                  {/* Description */}
                  <p
                    style={{
                      fontSize: 16,
                      color: COLORS.textSecondary,
                      lineHeight: 1.5,
                      margin: 0,
                    }}
                  >
                    {step.description}
                  </p>
                </GlassCard>

                {/* Connecting arrow (between cards) */}
                {i < STEPS.length - 1 && (
                  <div
                    style={{
                      width: 80,
                      height: 2,
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <div
                      style={{
                        width: `${(i === 0 ? line1Progress : line2Progress) * 100}%`,
                        height: 2,
                        background: `linear-gradient(90deg, ${COLORS.teal}, ${COLORS.tealLight})`,
                        borderRadius: 1,
                      }}
                    />
                    {/* Arrow head */}
                    <div
                      style={{
                        position: 'absolute',
                        right: 0,
                        width: 0,
                        height: 0,
                        borderTop: '6px solid transparent',
                        borderBottom: '6px solid transparent',
                        borderLeft: `10px solid ${COLORS.tealLight}`,
                        opacity: (i === 0 ? line1Progress : line2Progress) > 0.9 ? 1 : 0,
                      }}
                    />
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
