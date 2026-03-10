/**
 * Layout Components
 * Reusable layout primitives for Remotion compositions
 */

import React from 'react';
import { AbsoluteFill } from 'remotion';
import { COLORS, FONTS, FONT_IMPORT } from '../theme';

/** Full-screen centered container with dark background and font imports */
export const SceneContainer: React.FC<{
  children: React.ReactNode;
  background?: string;
  style?: React.CSSProperties;
}> = ({ children, background, style = {} }) => {
  return (
    <AbsoluteFill
      style={{
        background: background || COLORS.bgDark,
        fontFamily: FONTS.body,
        color: COLORS.textPrimary,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        ...style,
      }}
    >
      <style>{FONT_IMPORT}</style>
      {children}
    </AbsoluteFill>
  );
};

/** Centered content wrapper with max width */
export const CenteredContent: React.FC<{
  children: React.ReactNode;
  maxWidth?: number;
  style?: React.CSSProperties;
}> = ({ children, maxWidth = 1400, style = {} }) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        maxWidth,
        padding: '0 80px',
        textAlign: 'center',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Split layout - left and right panels */
export const SplitLayout: React.FC<{
  left: React.ReactNode;
  right: React.ReactNode;
  ratio?: number;
  gap?: number;
  style?: React.CSSProperties;
}> = ({ left, right, ratio = 0.5, gap = 60, style = {} }) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        maxWidth: 1600,
        padding: '0 80px',
        gap,
        ...style,
      }}
    >
      <div style={{ flex: ratio, display: 'flex', flexDirection: 'column' }}>
        {left}
      </div>
      <div style={{ flex: 1 - ratio, display: 'flex', flexDirection: 'column' }}>
        {right}
      </div>
    </div>
  );
};

/** Section title with optional subtitle */
export const SectionTitle: React.FC<{
  title: string;
  subtitle?: string;
  titleSize?: number;
  opacity?: number;
  translateY?: number;
}> = ({ title, subtitle, titleSize = 56, opacity = 1, translateY = 0 }) => {
  return (
    <div
      style={{
        textAlign: 'center',
        opacity,
        transform: `translateY(${translateY}px)`,
      }}
    >
      <h2
        style={{
          fontFamily: FONTS.display,
          fontSize: titleSize,
          fontWeight: 700,
          color: COLORS.textPrimary,
          margin: 0,
          letterSpacing: 2,
          lineHeight: 1.2,
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          style={{
            fontSize: 22,
            color: COLORS.textSecondary,
            marginTop: 16,
            fontWeight: 400,
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
};

/** Horizontal row of items with even spacing */
export const HorizontalRow: React.FC<{
  children: React.ReactNode;
  gap?: number;
  style?: React.CSSProperties;
}> = ({ children, gap = 40, style = {} }) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Gradient text */
export const GradientText: React.FC<{
  children: React.ReactNode;
  from?: string;
  to?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  style?: React.CSSProperties;
}> = ({
  children,
  from = COLORS.primary,
  to = COLORS.tealLight,
  fontSize = 64,
  fontFamily = FONTS.display,
  fontWeight = 800,
  style = {},
}) => {
  return (
    <span
      style={{
        fontSize,
        fontFamily,
        fontWeight,
        background: `linear-gradient(135deg, ${from}, ${to})`,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        lineHeight: 1.2,
        letterSpacing: 1,
        ...style,
      }}
    >
      {children}
    </span>
  );
};
