/**
 * S03 Solution — Hero Tagline (8s / 240 frames)
 *
 * Gradient text slides in → Phone with sound waves → Stat badges appear
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { SceneContainer, CenteredContent, GradientText } from '../../../utils/layout';
import { GlowOrb, ParticleField, PhoneIcon, SoundWaves, Badge } from '../../../utils/shapes';
import {
  fadeIn,
  fadeOut,
  slideUp,
  springIn,
  staggerDelay,
} from '../../../utils/animations';
import { COLORS, FONTS } from '../../../theme';

const STAT_BADGES = [
  { text: '7/24 Aktif', color: COLORS.teal },
  { text: '< 2sn Yanıt', color: COLORS.primary },
  { text: '%95 Karşılama', color: COLORS.success },
];

export const S03_Solution: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Headline animation
  const headlineOpacity = fadeIn(frame, 10, 20);
  const headlineSlide = slideUp(frame, 10, 25);

  // Phone + waves
  const phoneProgress = springIn({
    fps,
    frame,
    delay: 40,
    config: { damping: 12, mass: 0.5, stiffness: 80 },
  });

  // Exit
  const exitOpacity = fadeOut(frame, 210, 30);

  return (
    <SceneContainer>
      <ParticleField count={12} color={COLORS.teal} />
      <GlowOrb color={COLORS.teal} size={400} x="50%" y="45%" pulseSpeed={0.035} />
      <GlowOrb color={COLORS.primary} size={300} x="25%" y="60%" pulseSpeed={0.05} />

      <CenteredContent style={{ opacity: exitOpacity }}>
        {/* Main headline */}
        <div
          style={{
            opacity: headlineOpacity,
            transform: `translateY(${headlineSlide}px)`,
            marginBottom: 50,
          }}
        >
          <GradientText fontSize={60} fontWeight={800}>
            Telefonları AI Asistanın
          </GradientText>
          <br />
          <GradientText fontSize={60} fontWeight={800} from={COLORS.tealLight} to={COLORS.primary}>
            Yanıt Versin
          </GradientText>
        </div>

        {/* Phone with sound waves */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 50,
            opacity: phoneProgress,
            transform: `scale(${phoneProgress})`,
          }}
        >
          <div style={{ position: 'relative' }}>
            <div
              style={{
                width: 100,
                height: 100,
                borderRadius: 24,
                background: `linear-gradient(135deg, ${COLORS.bgCard}, ${COLORS.bgSurface})`,
                border: `2px solid ${COLORS.teal}40`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 0 30px ${COLORS.glowTeal}`,
              }}
            >
              <PhoneIcon size={44} color={COLORS.teal} />
            </div>
            {/* Sound waves positioned around */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
              }}
            >
              <SoundWaves color={COLORS.teal} size={160} />
            </div>
          </div>
        </div>

        {/* Stat badges */}
        <div
          style={{
            display: 'flex',
            gap: 24,
            justifyContent: 'center',
          }}
        >
          {STAT_BADGES.map((badge, i) => {
            const delay = 90 + staggerDelay(i, 12);
            const badgeProgress = springIn({
              fps,
              frame,
              delay,
              config: { damping: 14, mass: 0.5, stiffness: 100 },
            });

            return (
              <div
                key={i}
                style={{
                  opacity: badgeProgress,
                  transform: `translateY(${(1 - badgeProgress) * 30}px)`,
                }}
              >
                <Badge color={badge.color}>
                  {badge.text}
                </Badge>
              </div>
            );
          })}
        </div>
      </CenteredContent>
    </SceneContainer>
  );
};
