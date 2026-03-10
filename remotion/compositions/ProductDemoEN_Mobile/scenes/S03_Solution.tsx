/**
 * S03 Solution — Hero Tagline (Mobile 9:16)
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { SceneContainer, CenteredContent, GradientText } from '../../../utils/layout';
import { GlowOrb, ParticleField, PhoneIcon, SoundWaves, Badge } from '../../../utils/shapes';
import { fadeIn, fadeOut, slideUp, springIn, staggerDelay } from '../../../utils/animations';
import { COLORS } from '../../../theme-en';

const STAT_BADGES = [
  { text: '24/7 Active', color: COLORS.teal },
  { text: '< 2s Response', color: COLORS.primary },
  { text: '95% Answer Rate', color: COLORS.success },
];

export const S03_Solution: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headlineOpacity = fadeIn(frame, 10, 20);
  const headlineSlide = slideUp(frame, 10, 25);
  const phoneProgress = springIn({ fps, frame, delay: 40, config: { damping: 12, mass: 0.5, stiffness: 80 } });
  const exitOpacity = fadeOut(frame, 210, 30);

  return (
    <SceneContainer>
      <ParticleField count={12} color={COLORS.teal} />
      <GlowOrb color={COLORS.teal} size={350} x="50%" y="40%" pulseSpeed={0.035} />
      <GlowOrb color={COLORS.primary} size={200} x="25%" y="65%" pulseSpeed={0.05} />

      <CenteredContent style={{ opacity: exitOpacity, padding: '0 50px' }}>
        <div style={{ opacity: headlineOpacity, transform: `translateY(${headlineSlide}px)`, marginBottom: 40, textAlign: 'center' }}>
          <GradientText fontSize={44} fontWeight={800}>
            Let AI Answer
          </GradientText>
          <br />
          <GradientText fontSize={44} fontWeight={800} from={COLORS.tealLight} to={COLORS.primary}>
            Your Phone Calls
          </GradientText>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 40, opacity: phoneProgress, transform: `scale(${phoneProgress})` }}>
          <div style={{ position: 'relative' }}>
            <div
              style={{
                width: 90, height: 90, borderRadius: 22,
                background: `linear-gradient(135deg, ${COLORS.bgCard}, ${COLORS.bgSurface})`,
                border: `2px solid ${COLORS.teal}40`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 0 30px ${COLORS.glowTeal}`,
              }}
            >
              <PhoneIcon size={40} color={COLORS.teal} />
            </div>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
              <SoundWaves color={COLORS.teal} size={140} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
          {STAT_BADGES.map((badge, i) => {
            const delay = 90 + staggerDelay(i, 12);
            const badgeProgress = springIn({ fps, frame, delay, config: { damping: 14, mass: 0.5, stiffness: 100 } });
            return (
              <div key={i} style={{ opacity: badgeProgress, transform: `translateY(${(1 - badgeProgress) * 20}px)` }}>
                <Badge color={badge.color}>{badge.text}</Badge>
              </div>
            );
          })}
        </div>
      </CenteredContent>
    </SceneContainer>
  );
};
