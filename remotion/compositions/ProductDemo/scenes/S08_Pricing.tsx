/**
 * S08 Pricing — Plan Cards (9s / 270 frames)
 *
 * 3 cards slide up → Pro highlighted → Feature checkmarks stagger
 * → "14 gün ücretsiz deneme" text
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { SceneContainer, CenteredContent } from '../../../utils/layout';
import { GlassCard, GlowOrb, GridPattern, CheckIcon, Badge, AnimatedUnderline } from '../../../utils/shapes';
import {
  fadeIn,
  fadeOut,
  springIn,
  staggerDelay,
  drawLine,
} from '../../../utils/animations';
import { COLORS, FONTS, PRICING_PLANS } from '../../../theme';

export const S08_Pricing: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Title
  const titleOpacity = fadeIn(frame, 5, 15);
  const underlineProgress = drawLine(frame, 15, 25);

  // Free trial text
  const trialOpacity = fadeIn(frame, 170, 20);

  // Exit
  const exitOpacity = fadeOut(frame, 240, 30);

  return (
    <SceneContainer>
      <GridPattern opacity={0.03} />
      <GlowOrb color={COLORS.primary} size={400} x="50%" y="40%" pulseSpeed={0.03} />

      <CenteredContent style={{ opacity: exitOpacity }}>
        {/* Title */}
        <div style={{ marginBottom: 50 }}>
          <h2
            style={{
              fontFamily: FONTS.display,
              fontSize: 48,
              fontWeight: 700,
              color: COLORS.textPrimary,
              margin: 0,
              opacity: titleOpacity,
            }}
          >
            Planlar ve Fiyatlandırma
          </h2>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
            <AnimatedUnderline progress={underlineProgress} width={240} />
          </div>
        </div>

        {/* Pricing cards */}
        <div
          style={{
            display: 'flex',
            gap: 32,
            alignItems: 'stretch',
            width: '100%',
            justifyContent: 'center',
          }}
        >
          {PRICING_PLANS.map((plan, i) => {
            const delay = 30 + staggerDelay(i, 15);
            const cardProgress = springIn({
              fps,
              frame,
              delay,
              config: { damping: 14, mass: 0.5, stiffness: 80 },
            });

            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  maxWidth: 380,
                  opacity: cardProgress,
                  transform: `translateY(${(1 - cardProgress) * 60}px) scale(${plan.highlighted ? 1.03 : 1})`,
                  position: 'relative',
                }}
              >
                {/* Popular badge */}
                {plan.highlighted && 'badge' in plan && (
                  <div
                    style={{
                      position: 'absolute',
                      top: -14,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      zIndex: 10,
                    }}
                  >
                    <Badge color="#fff" bgColor={COLORS.primary}>
                      {plan.badge}
                    </Badge>
                  </div>
                )}

                <GlassCard
                  highlighted={plan.highlighted}
                  style={{
                    padding: '40px 32px',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  {/* Plan name */}
                  <h3
                    style={{
                      fontFamily: FONTS.display,
                      fontSize: 24,
                      fontWeight: 700,
                      color: plan.highlighted ? COLORS.primary : COLORS.textPrimary,
                      marginBottom: 8,
                    }}
                  >
                    {plan.name}
                  </h3>

                  {/* Price */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 4,
                      marginBottom: 24,
                      paddingBottom: 24,
                      borderBottom: `1px solid ${COLORS.borderColor}`,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: FONTS.display,
                        fontSize: 48,
                        fontWeight: 900,
                        color: COLORS.textPrimary,
                      }}
                    >
                      {plan.price.toLocaleString('tr-TR')}₺
                    </span>
                    <span
                      style={{
                        fontSize: 16,
                        color: COLORS.textMuted,
                      }}
                    >
                      {plan.period}
                    </span>
                  </div>

                  {/* Features */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                      flex: 1,
                    }}
                  >
                    {plan.features.map((feature, fi) => {
                      const featureDelay = delay + 40 + staggerDelay(fi, 8);
                      const featureOpacity = fadeIn(frame, featureDelay, 12);

                      return (
                        <div
                          key={fi}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            opacity: featureOpacity,
                          }}
                        >
                          <CheckIcon
                            size={18}
                            color={plan.highlighted ? COLORS.primary : COLORS.teal}
                          />
                          <span
                            style={{
                              fontSize: 15,
                              color: COLORS.textSecondary,
                            }}
                          >
                            {feature}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* CTA button mock */}
                  <div
                    style={{
                      marginTop: 28,
                      padding: '14px 24px',
                      borderRadius: 10,
                      textAlign: 'center',
                      fontWeight: 600,
                      fontSize: 16,
                      background: plan.highlighted
                        ? `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryDark})`
                        : 'transparent',
                      color: plan.highlighted ? '#fff' : COLORS.textSecondary,
                      border: plan.highlighted
                        ? 'none'
                        : `1px solid ${COLORS.borderColor}`,
                    }}
                  >
                    {plan.highlighted ? 'Hemen Başla' : 'Plan Seç'}
                  </div>
                </GlassCard>
              </div>
            );
          })}
        </div>

        {/* Free trial text */}
        <p
          style={{
            marginTop: 40,
            fontSize: 18,
            color: COLORS.textSecondary,
            opacity: trialOpacity,
            fontWeight: 500,
          }}
        >
          ✨ Tüm planlar{' '}
          <span style={{ color: COLORS.primary, fontWeight: 700 }}>
            14 gün ücretsiz deneme
          </span>{' '}
          ile başlar
        </p>
      </CenteredContent>
    </SceneContainer>
  );
};
