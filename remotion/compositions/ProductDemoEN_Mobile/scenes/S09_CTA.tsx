/**
 * S09 CTA — Call to Action (Mobile 9:16)
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { SceneContainer, CenteredContent, GradientText } from '../../../utils/layout';
import { GlowOrb, ParticleField, PhoneIcon } from '../../../utils/shapes';
import { fadeIn, fadeOut, typewriter, springIn, staggerDelay } from '../../../utils/animations';
import { COLORS, FONTS } from '../../../theme-en';

const TRUST_BADGES = [
  '🔒 GDPR Compliant',
  '☁️ Cloud Based',
  '🌍 Global Infrastructure',
];

export const S09_CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const tagline = 'Transform Your Customer Service';
  const visibleChars = typewriter(frame, 10, tagline.length, 2);
  const ctaProgress = springIn({ fps, frame, delay: 70, config: { damping: 10, mass: 0.5, stiffness: 100 } });
  const logoOpacity = fadeIn(frame, 130, 20);
  const exitOpacity = fadeOut(frame, 180, 30);

  return (
    <SceneContainer>
      <ParticleField count={15} color={COLORS.primary} />
      <GlowOrb color={COLORS.primary} size={400} x="50%" y="40%" pulseSpeed={0.03} />
      <GlowOrb color={COLORS.teal} size={250} x="30%" y="70%" pulseSpeed={0.05} />

      <CenteredContent style={{ opacity: exitOpacity, padding: '0 50px' }}>
        <div style={{ marginBottom: 16, minHeight: 120, textAlign: 'center' }}>
          <GradientText fontSize={40} fontWeight={800}>
            {tagline.slice(0, visibleChars)}
          </GradientText>
          {visibleChars < tagline.length && (
            <span style={{ fontSize: 40, fontFamily: FONTS.display, color: COLORS.primary, opacity: Math.sin(frame * 0.15) > 0 ? 1 : 0 }}>|</span>
          )}
        </div>

        <p style={{ fontSize: 18, color: COLORS.textSecondary, marginBottom: 40, opacity: fadeIn(frame, 60, 15), textAlign: 'center' }}>
          Make a difference with AI-powered call management
        </p>

        {/* CTA Button */}
        <div style={{ opacity: ctaProgress, transform: `scale(${ctaProgress})`, marginBottom: 36 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10, padding: '18px 36px', borderRadius: 14,
            background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryDark})`,
            color: '#fff', fontSize: 20, fontWeight: 700, fontFamily: FONTS.display,
            boxShadow: `0 0 40px ${COLORS.glowRed}, 0 8px 32px rgba(220,38,38,0.3)`, letterSpacing: 1,
          }}>
            Start Free Trial
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
            </svg>
          </div>
        </div>

        {/* Trust badges — vertical on mobile */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', marginBottom: 40 }}>
          {TRUST_BADGES.map((badge, i) => (
            <span key={i} style={{ fontSize: 14, color: COLORS.textMuted, opacity: fadeIn(frame, 90 + staggerDelay(i, 10), 15) }}>
              {badge}
            </span>
          ))}
        </div>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: logoOpacity }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9,
            background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryDark})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <PhoneIcon size={18} color="#fff" />
          </div>
          <span style={{ fontFamily: FONTS.display, fontSize: 20, fontWeight: 800, color: COLORS.textPrimary, letterSpacing: 3 }}>CALLCEPTION</span>
        </div>
        <p style={{ marginTop: 10, fontSize: 14, color: COLORS.textMuted, opacity: logoOpacity, letterSpacing: 1 }}>callception.com</p>
      </CenteredContent>
    </SceneContainer>
  );
};
