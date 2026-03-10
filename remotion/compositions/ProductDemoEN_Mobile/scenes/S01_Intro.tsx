/**
 * S01 Intro — Cinematic Brand Reveal (Mobile 9:16)
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
      <GlowOrb color={COLORS.primary} size={400} x="50%" y="45%" />
      <GlowOrb color={COLORS.teal} size={200} x="30%" y="65%" pulseSpeed={0.06} />
      <ScanLine delay={100} duration={50} />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24,
          opacity: exitOpacity,
          zIndex: 10,
          padding: '0 40px',
        }}
      >
        <div style={{ transform: `scale(${phoneScale})`, marginBottom: 10 }}>
          <div
            style={{
              width: 90,
              height: 90,
              borderRadius: 22,
              background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryDark})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 0 40px ${COLORS.glowRed}, 0 20px 60px rgba(0,0,0,0.5)`,
            }}
          >
            <PhoneIcon size={42} color="#fff" />
          </div>
        </div>

        <h1
          style={{
            fontFamily: FONTS.display,
            fontSize: 56,
            fontWeight: 900,
            letterSpacing: 8,
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
            fontSize: 20,
            fontWeight: 400,
            color: COLORS.textSecondary,
            margin: 0,
            opacity: subtitleOpacity,
            letterSpacing: 3,
            textAlign: 'center',
          }}
        >
          AI-Powered Call Management
        </p>
      </div>
    </SceneContainer>
  );
};
