/**
 * S09 CTA — Call to Action (7s / 210 frames)
 *
 * Typewriter tagline → CTA button bounces in → Trust badges → Logo → Fade to black
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { SceneContainer, CenteredContent, GradientText } from '../../../utils/layout';
import { GlowOrb, ParticleField, PhoneIcon } from '../../../utils/shapes';
import {
  fadeIn,
  fadeOut,
  typewriter,
  springIn,
  staggerDelay,
} from '../../../utils/animations';
import { COLORS, FONTS } from '../../../theme';

const TRUST_BADGES = [
  '🔒 KVKK Uyumlu',
  '☁️ Bulut Tabanlı',
  '🇹🇷 Türkiye Sunucuları',
];

export const S09_CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Typewriter tagline
  const tagline = 'Müşteri Hizmetlerinizi Dönüştürün';
  const visibleChars = typewriter(frame, 10, tagline.length, 2);

  // CTA button
  const ctaProgress = springIn({
    fps,
    frame,
    delay: 70,
    config: { damping: 10, mass: 0.5, stiffness: 100 },
  });

  // Logo
  const logoOpacity = fadeIn(frame, 130, 20);

  // Fade to black
  const exitOpacity = fadeOut(frame, 180, 30);

  return (
    <SceneContainer>
      <ParticleField count={20} color={COLORS.primary} />
      <GlowOrb color={COLORS.primary} size={500} x="50%" y="45%" pulseSpeed={0.03} />
      <GlowOrb color={COLORS.teal} size={300} x="30%" y="70%" pulseSpeed={0.05} />

      <CenteredContent style={{ opacity: exitOpacity }}>
        {/* Typewriter tagline */}
        <div style={{ marginBottom: 20, minHeight: 80 }}>
          <GradientText fontSize={52} fontWeight={800}>
            {tagline.slice(0, visibleChars)}
          </GradientText>
          {visibleChars < tagline.length && (
            <span
              style={{
                fontSize: 52,
                fontFamily: FONTS.display,
                color: COLORS.primary,
                opacity: Math.sin(frame * 0.15) > 0 ? 1 : 0,
              }}
            >
              |
            </span>
          )}
        </div>

        {/* Subtitle */}
        <p
          style={{
            fontSize: 22,
            color: COLORS.textSecondary,
            marginBottom: 50,
            opacity: fadeIn(frame, 60, 15),
          }}
        >
          Yapay zeka destekli çağrı yönetimi ile fark yaratın
        </p>

        {/* CTA Button */}
        <div
          style={{
            opacity: ctaProgress,
            transform: `scale(${ctaProgress})`,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              padding: '20px 48px',
              borderRadius: 14,
              background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryDark})`,
              color: '#fff',
              fontSize: 22,
              fontWeight: 700,
              fontFamily: FONTS.display,
              boxShadow: `0 0 40px ${COLORS.glowRed}, 0 8px 32px rgba(220,38,38,0.3)`,
              letterSpacing: 1,
            }}
          >
            14 Gün Ücretsiz Deneyin
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </div>
        </div>

        {/* Trust badges */}
        <div
          style={{
            display: 'flex',
            gap: 32,
            marginBottom: 50,
          }}
        >
          {TRUST_BADGES.map((badge, i) => {
            const badgeDelay = 90 + staggerDelay(i, 10);
            const badgeOpacity = fadeIn(frame, badgeDelay, 15);

            return (
              <span
                key={i}
                style={{
                  fontSize: 15,
                  color: COLORS.textMuted,
                  opacity: badgeOpacity,
                }}
              >
                {badge}
              </span>
            );
          })}
        </div>

        {/* Logo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            opacity: logoOpacity,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryDark})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <PhoneIcon size={20} color="#fff" />
          </div>
          <span
            style={{
              fontFamily: FONTS.display,
              fontSize: 24,
              fontWeight: 800,
              color: COLORS.textPrimary,
              letterSpacing: 3,
            }}
          >
            CALLCEPTION
          </span>
        </div>

        {/* URL */}
        <p
          style={{
            marginTop: 12,
            fontSize: 16,
            color: COLORS.textMuted,
            opacity: logoOpacity,
            letterSpacing: 1,
          }}
        >
          callception.com
        </p>
      </CenteredContent>
    </SceneContainer>
  );
};
