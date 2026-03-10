/**
 * Decorative Shape Components
 * Pure CSS/SVG components for visual effects
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS } from '../theme';
import { pulseGlow } from './animations';

/** Animated glowing orb */
export const GlowOrb: React.FC<{
  color?: string;
  size?: number;
  x?: string;
  y?: string;
  pulseSpeed?: number;
}> = ({
  color = COLORS.primary,
  size = 300,
  x = '50%',
  y = '50%',
  pulseSpeed = 0.04,
}) => {
  const frame = useCurrentFrame();
  const pulse = pulseGlow(frame, pulseSpeed);

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: 'translate(-50%, -50%)',
        width: size,
        height: size,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${color}40 0%, ${color}10 40%, transparent 70%)`,
        opacity: 0.4 + pulse * 0.3,
        filter: `blur(${40 + pulse * 20}px)`,
        pointerEvents: 'none' as const,
      }}
    />
  );
};

/** Background grid pattern */
export const GridPattern: React.FC<{
  opacity?: number;
  cellSize?: number;
}> = ({ opacity = 0.06, cellSize = 60 }) => {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `
          linear-gradient(${COLORS.textSecondary}${Math.round(opacity * 255).toString(16).padStart(2, '0')} 1px, transparent 1px),
          linear-gradient(90deg, ${COLORS.textSecondary}${Math.round(opacity * 255).toString(16).padStart(2, '0')} 1px, transparent 1px)
        `,
        backgroundSize: `${cellSize}px ${cellSize}px`,
        pointerEvents: 'none' as const,
      }}
    />
  );
};

/** Animated scan line */
export const ScanLine: React.FC<{
  delay?: number;
  duration?: number;
  color?: string;
}> = ({ delay = 0, duration = 60, color = COLORS.primary }) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();

  if (frame < delay || frame > delay + duration) return null;

  const progress = (frame - delay) / duration;
  const y = progress * height;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: y,
        height: 2,
        background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        boxShadow: `0 0 20px ${color}80, 0 0 60px ${color}40`,
        opacity: 1 - progress * 0.5,
        pointerEvents: 'none' as const,
      }}
    />
  );
};

/** Glass-morphism card */
export const GlassCard: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
  highlighted?: boolean;
}> = ({ children, style = {}, highlighted = false }) => {
  return (
    <div
      style={{
        background: highlighted
          ? `linear-gradient(135deg, ${COLORS.bgCard}, ${COLORS.primary}15)`
          : `linear-gradient(135deg, ${COLORS.bgCard}, ${COLORS.bgSurface})`,
        border: `1px solid ${highlighted ? COLORS.primary + '60' : COLORS.borderColor}`,
        borderRadius: 16,
        padding: '32px',
        backdropFilter: 'blur(10px)',
        boxShadow: highlighted
          ? `0 0 30px ${COLORS.glowRed}, 0 8px 32px rgba(0,0,0,0.4)`
          : '0 8px 32px rgba(0,0,0,0.3)',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Animated particles background */
export const ParticleField: React.FC<{
  count?: number;
  color?: string;
}> = ({ count = 20, color = COLORS.primary }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const particles = React.useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      x: (i * 137.5) % width,
      y: (i * 97.3) % height,
      size: 2 + (i % 4),
      speed: 0.3 + (i % 5) * 0.15,
      phase: (i * 2.1) % (Math.PI * 2),
    }));
  }, [count, width, height]);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' as const }}>
      {particles.map((p, i) => {
        const y = (p.y + frame * p.speed) % (height + 20) - 10;
        const x = p.x + Math.sin(frame * 0.02 + p.phase) * 30;
        const opacity = 0.2 + 0.3 * Math.sin(frame * 0.03 + p.phase);

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: p.size,
              height: p.size,
              borderRadius: '50%',
              backgroundColor: color,
              opacity,
            }}
          />
        );
      })}
    </div>
  );
};

/** Animated underline decoration */
export const AnimatedUnderline: React.FC<{
  progress: number;
  color?: string;
  height?: number;
  width?: number | string;
}> = ({ progress, color = COLORS.primary, height = 3, width = '100%' }) => {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: height,
        background: `linear-gradient(90deg, ${color}, ${COLORS.teal})`,
        transform: `scaleX(${progress})`,
        transformOrigin: 'left',
      }}
    />
  );
};

/** CSS phone icon (simplified) */
export const PhoneIcon: React.FC<{
  size?: number;
  color?: string;
}> = ({ size = 80, color = COLORS.primary }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
};

/** Animated sound waves */
export const SoundWaves: React.FC<{
  color?: string;
  size?: number;
}> = ({ color = COLORS.primary, size = 120 }) => {
  const frame = useCurrentFrame();

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      {[0, 1, 2].map((i) => {
        const delay = i * 8;
        const scale = 1 + (((frame + delay) % 45) / 45) * 0.8;
        const opacity = 1 - (((frame + delay) % 45) / 45);

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: `2px solid ${color}`,
              transform: `scale(${scale})`,
              opacity: opacity * 0.6,
            }}
          />
        );
      })}
    </div>
  );
};

/** Checkmark icon */
export const CheckIcon: React.FC<{
  size?: number;
  color?: string;
}> = ({ size = 20, color = COLORS.success }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/** Badge / tag component */
export const Badge: React.FC<{
  children: React.ReactNode;
  color?: string;
  bgColor?: string;
}> = ({ children, color = COLORS.primary, bgColor }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '6px 16px',
      borderRadius: 20,
      fontSize: 14,
      fontWeight: 600,
      color,
      backgroundColor: bgColor || `${color}20`,
      border: `1px solid ${color}40`,
    }}
  >
    {children}
  </span>
);
