/**
 * P04 CTA — Pricing Overview Call to Action (English)
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { SceneContainer, CenteredContent, GradientText } from '../../../utils/layout';
import { GlowOrb, ParticleField, PhoneIcon } from '../../../utils/shapes';
import { fadeIn, fadeOut, springIn } from '../../../utils/animations';
import { COLORS, FONTS } from '../../../theme-en';

export const P04_CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headlineOpacity = fadeIn(frame, 5, 15);
  const ctaProgress = springIn({ fps, frame, delay: 25, config: { damping: 12, mass: 0.5, stiffness: 100 } });
  const footerOpacity = fadeIn(frame, 50, 15);
  const exitOpacity = fadeOut(frame, 95, 25);

  return (
    <SceneContainer>
      <ParticleField count={15} color={COLORS.primary} />
      <GlowOrb color={COLORS.primary} size={450} x="50%" y="50%" />

      <CenteredContent style={{ opacity: exitOpacity }}>
        <div style={{ marginBottom: 16, opacity: headlineOpacity }}>
          <GradientText fontSize={48} fontWeight={800}>Start Your Free 14-Day Trial</GradientText>
        </div>

        <p style={{ fontSize: 20, color: COLORS.textSecondary, marginBottom: 40, opacity: headlineOpacity }}>
          No credit card required • Cancel anytime
        </p>

        <div style={{ opacity: ctaProgress, transform: `scale(${ctaProgress})`, marginBottom: 50 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 12, padding: '20px 48px', borderRadius: 14,
            background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryDark})`,
            color: '#fff', fontSize: 22, fontWeight: 700, fontFamily: FONTS.display,
            boxShadow: `0 0 40px ${COLORS.glowRed}, 0 8px 32px rgba(220,38,38,0.3)`,
          }}>
            Get Started
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
            </svg>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: footerOpacity }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9,
            background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryDark})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <PhoneIcon size={18} color="#fff" />
          </div>
          <span style={{ fontFamily: FONTS.display, fontSize: 20, fontWeight: 800, color: COLORS.textPrimary, letterSpacing: 3 }}>CALLCEPTION</span>
        </div>
        <p style={{ marginTop: 10, fontSize: 14, color: COLORS.textMuted, opacity: footerOpacity }}>callception.com</p>
      </CenteredContent>
    </SceneContainer>
  );
};
