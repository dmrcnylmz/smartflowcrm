/**
 * S08 Pricing — Plan Cards (Mobile 9:16)
 * Vertical stack: cards stacked top to bottom
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { SceneContainer, CenteredContent } from '../../../utils/layout';
import { GlassCard, GlowOrb, GridPattern, CheckIcon, Badge, AnimatedUnderline } from '../../../utils/shapes';
import { fadeIn, fadeOut, springIn, staggerDelay, drawLine } from '../../../utils/animations';
import { COLORS, FONTS, PRICING_PLANS_EN } from '../../../theme-en';

export const S08_Pricing: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = fadeIn(frame, 5, 15);
  const underlineProgress = drawLine(frame, 15, 25);
  const trialOpacity = fadeIn(frame, 170, 20);
  const exitOpacity = fadeOut(frame, 240, 30);

  return (
    <SceneContainer>
      <GridPattern opacity={0.03} />
      <GlowOrb color={COLORS.primary} size={300} x="50%" y="35%" pulseSpeed={0.03} />

      <CenteredContent style={{ opacity: exitOpacity, padding: '0 50px' }}>
        {/* Title */}
        <div style={{ marginBottom: 36 }}>
          <h2 style={{ fontFamily: FONTS.display, fontSize: 38, fontWeight: 700, color: COLORS.textPrimary, margin: 0, opacity: titleOpacity }}>
            Plans & Pricing
          </h2>
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center' }}>
            <AnimatedUnderline progress={underlineProgress} width={200} />
          </div>
        </div>

        {/* Cards — vertical */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%', alignItems: 'center' }}>
          {PRICING_PLANS_EN.map((plan, i) => {
            const delay = 30 + staggerDelay(i, 12);
            const cardProgress = springIn({ fps, frame, delay, config: { damping: 14, mass: 0.5, stiffness: 80 } });

            return (
              <div key={i} style={{
                width: '100%', maxWidth: 650, opacity: cardProgress,
                transform: `translateY(${(1 - cardProgress) * 40}px)`,
                position: 'relative',
              }}>
                {'badge' in plan && plan.highlighted && (
                  <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
                    <Badge color="#fff" bgColor={COLORS.primary}>{plan.badge}</Badge>
                  </div>
                )}

                <GlassCard highlighted={plan.highlighted} style={{
                  padding: '28px 24px',
                  display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 20,
                }}>
                  {/* Left: plan info */}
                  <div style={{ minWidth: 120 }}>
                    <h3 style={{ fontFamily: FONTS.display, fontSize: 20, fontWeight: 700, color: plan.highlighted ? COLORS.primary : COLORS.textPrimary, marginBottom: 6 }}>
                      {plan.name}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                      <span style={{ fontFamily: FONTS.display, fontSize: 36, fontWeight: 900, color: COLORS.textPrimary }}>
                        {plan.currency}{plan.price}
                      </span>
                      <span style={{ fontSize: 14, color: COLORS.textMuted }}>{plan.period}</span>
                    </div>
                  </div>

                  {/* Divider */}
                  <div style={{ width: 1, height: 80, background: COLORS.borderColor }} />

                  {/* Right: features */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                    {plan.features.slice(0, 4).map((feature, fi) => {
                      const featureOpacity = fadeIn(frame, delay + 30 + staggerDelay(fi, 6), 10);
                      return (
                        <div key={fi} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: featureOpacity }}>
                          <CheckIcon size={14} color={plan.highlighted ? COLORS.primary : COLORS.teal} />
                          <span style={{ fontSize: 13, color: COLORS.textSecondary }}>{feature}</span>
                        </div>
                      );
                    })}
                  </div>
                </GlassCard>
              </div>
            );
          })}
        </div>

        {/* Trial text */}
        <p style={{ marginTop: 30, fontSize: 16, color: COLORS.textSecondary, opacity: trialOpacity, fontWeight: 500 }}>
          ✨ All plans include a{' '}
          <span style={{ color: COLORS.primary, fontWeight: 700 }}>14-day free trial</span>
        </p>
      </CenteredContent>
    </SceneContainer>
  );
};
