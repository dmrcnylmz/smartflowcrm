/**
 * P02 Cards — Pricing Plan Cards (11s / 330 frames)
 *
 * 3 pricing cards slide up with features staggered in
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { SceneContainer, CenteredContent } from '../../../utils/layout';
import { GlassCard, GlowOrb, GridPattern, CheckIcon, Badge } from '../../../utils/shapes';
import {
  fadeIn,
  fadeOut,
  springIn,
  staggerDelay,
} from '../../../utils/animations';
import { COLORS, FONTS, PRICING_PLANS } from '../../../theme';

export const P02_Cards: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Exit
  const exitOpacity = fadeOut(frame, 300, 30);

  return (
    <SceneContainer>
      <GridPattern opacity={0.03} />
      <GlowOrb color={COLORS.primary} size={400} x="50%" y="50%" pulseSpeed={0.03} />

      <CenteredContent style={{ opacity: exitOpacity }}>
        {/* Cards */}
        <div
          style={{
            display: 'flex',
            gap: 36,
            alignItems: 'stretch',
            width: '100%',
            justifyContent: 'center',
          }}
        >
          {PRICING_PLANS.map((plan, i) => {
            const delay = 15 + staggerDelay(i, 15);
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
                  maxWidth: 400,
                  opacity: cardProgress,
                  transform: `translateY(${(1 - cardProgress) * 60}px) scale(${plan.highlighted ? 1.04 : 1})`,
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
                    padding: '44px 36px',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  {/* Plan name */}
                  <h3
                    style={{
                      fontFamily: FONTS.display,
                      fontSize: 26,
                      fontWeight: 700,
                      color: plan.highlighted ? COLORS.primary : COLORS.textPrimary,
                      marginBottom: 12,
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
                      marginBottom: 8,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: FONTS.display,
                        fontSize: 52,
                        fontWeight: 900,
                        color: COLORS.textPrimary,
                      }}
                    >
                      {plan.price.toLocaleString('tr-TR')}₺
                    </span>
                    <span
                      style={{
                        fontSize: 18,
                        color: COLORS.textMuted,
                      }}
                    >
                      {plan.period}
                    </span>
                  </div>

                  {/* Yearly savings note */}
                  <p
                    style={{
                      fontSize: 14,
                      color: COLORS.teal,
                      marginBottom: 24,
                      paddingBottom: 24,
                      borderBottom: `1px solid ${COLORS.borderColor}`,
                    }}
                  >
                    Yıllık ödemede %20 indirim
                  </p>

                  {/* Features */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 16,
                      flex: 1,
                    }}
                  >
                    {plan.features.map((feature, fi) => {
                      const featureDelay = delay + 50 + staggerDelay(fi, 10);
                      const featureOpacity = fadeIn(frame, featureDelay, 15);

                      return (
                        <div
                          key={fi}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            opacity: featureOpacity,
                          }}
                        >
                          <CheckIcon
                            size={20}
                            color={plan.highlighted ? COLORS.primary : COLORS.teal}
                          />
                          <span
                            style={{
                              fontSize: 16,
                              color: COLORS.textSecondary,
                            }}
                          >
                            {feature}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Button */}
                  <div
                    style={{
                      marginTop: 32,
                      padding: '16px 28px',
                      borderRadius: 12,
                      textAlign: 'center',
                      fontWeight: 600,
                      fontSize: 17,
                      background: plan.highlighted
                        ? `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryDark})`
                        : 'transparent',
                      color: plan.highlighted ? '#fff' : COLORS.textSecondary,
                      border: plan.highlighted
                        ? 'none'
                        : `1px solid ${COLORS.borderColor}`,
                      boxShadow: plan.highlighted
                        ? `0 4px 20px ${COLORS.glowRed}`
                        : 'none',
                    }}
                  >
                    {plan.highlighted ? 'Hemen Başla' : 'Plan Seç'}
                  </div>
                </GlassCard>
              </div>
            );
          })}
        </div>
      </CenteredContent>
    </SceneContainer>
  );
};
