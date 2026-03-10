/**
 * P01 Title — Pricing Overview Title (4s / 120 frames)
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { SceneContainer, CenteredContent, GradientText } from '../../../utils/layout';
import { GlowOrb, ParticleField, PhoneIcon, AnimatedUnderline } from '../../../utils/shapes';
import {
  fadeIn,
  fadeOut,
  scaleIn,
  drawLine,
  slideUp,
} from '../../../utils/animations';
import { COLORS, FONTS } from '../../../theme';

export const P01_Title: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = scaleIn(fps, frame, 5);
  const titleOpacity = fadeIn(frame, 20, 15);
  const titleSlide = slideUp(frame, 20, 20);
  const subtitleOpacity = fadeIn(frame, 40, 15);
  const underlineProgress = drawLine(frame, 35, 20);
  const exitOpacity = fadeOut(frame, 95, 25);

  return (
    <SceneContainer>
      <ParticleField count={10} color={COLORS.primary} />
      <GlowOrb color={COLORS.primary} size={400} x="50%" y="50%" />

      <CenteredContent style={{ opacity: exitOpacity }}>
        {/* Logo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            marginBottom: 40,
            transform: `scale(${logoScale})`,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryDark})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 0 30px ${COLORS.glowRed}`,
            }}
          >
            <PhoneIcon size={28} color="#fff" />
          </div>
          <span
            style={{
              fontFamily: FONTS.display,
              fontSize: 30,
              fontWeight: 800,
              color: COLORS.textPrimary,
              letterSpacing: 4,
            }}
          >
            CALLCEPTION
          </span>
        </div>

        {/* Title */}
        <div
          style={{
            opacity: titleOpacity,
            transform: `translateY(${titleSlide}px)`,
            marginBottom: 16,
          }}
        >
          <GradientText fontSize={64} fontWeight={800}>
            Planlar ve Fiyatlandırma
          </GradientText>
        </div>

        {/* Underline */}
        <div style={{ marginBottom: 20 }}>
          <AnimatedUnderline progress={underlineProgress} width={300} />
        </div>

        {/* Subtitle */}
        <p
          style={{
            fontSize: 22,
            color: COLORS.textSecondary,
            opacity: subtitleOpacity,
            fontWeight: 400,
          }}
        >
          Her ölçekte işletme için AI destekli çağrı yönetimi
        </p>
      </CenteredContent>
    </SceneContainer>
  );
};
