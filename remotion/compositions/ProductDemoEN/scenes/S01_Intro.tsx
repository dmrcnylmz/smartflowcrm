/**
 * S01 Intro — Cinematic Brand Reveal (English)
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { SceneContainer } from '../../../utils/layout';
import { GlowOrb, ScanLine, ParticleField, PhoneIcon } from '../../../utils/shapes';
import { fadeIn, fadeOut, slideUp, scaleIn } from '../../../utils/animations';
import { COLORS, FONTS } from '../../../theme-en';

export const S01_Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const phoneScale = scaleIn(fps, frame, 20);
  const titleOpacity = fadeIn(frame, 40, 20);
  const titleSlide = slideUp(frame, 40, 25);
  const subtitleOpacity = fadeIn(frame, 70, 20);
  const exitOpacity = fadeOut(frame, 150, 30);

  return (
    <SceneContainer>
      <ParticleField count={15} color={COLORS.primary} />
      <GlowOrb color={COLORS.primary} size={500} x="50%" y="50%" />
      <GlowOrb color={COLORS.teal} size={250} x="30%" y="70%" pulseSpeed={0.06} />
      <ScanLine delay={100} duration={50} />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 30,
          opacity: exitOpacity,
          zIndex: 10,
        }}
      >
        <div style={{ transform: `scale(${phoneScale})`, marginBottom: 10 }}>
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: 28,
              background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryDark})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 0 40px ${COLORS.glowRed}, 0 20px 60px rgba(0,0,0,0.5)`,
            }}
          >
            <PhoneIcon size={56} color="#fff" />
          </div>
        </div>

        <h1
          style={{
            fontFamily: FONTS.display,
            fontSize: 88,
            fontWeight: 900,
            letterSpacing: 12,
            color: COLORS.textPrimary,
            margin: 0,
            opacity: titleOpacity,
            transform: `translateY(${titleSlide}px)`,
            textShadow: `0 0 40px ${COLORS.glowRed}`,
          }}
        >
          CALLCEPTION
        </h1>

        <p
          style={{
            fontFamily: FONTS.body,
            fontSize: 26,
            fontWeight: 400,
            color: COLORS.textSecondary,
            margin: 0,
            opacity: subtitleOpacity,
            letterSpacing: 4,
          }}
        >
          AI-Powered Call Management Platform
        </p>
      </div>
    </SceneContainer>
  );
};
