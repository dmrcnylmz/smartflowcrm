/**
 * Remotion Animation Helpers
 * Reusable animation utilities using Remotion's spring() and interpolate()
 */

import { spring, interpolate, Easing } from 'remotion';

interface SpringConfig {
  fps: number;
  frame: number;
  delay?: number;
  config?: {
    damping?: number;
    mass?: number;
    stiffness?: number;
    overshootClamping?: boolean;
  };
}

/** Spring-based entrance with optional delay */
export function springIn({
  fps,
  frame,
  delay = 0,
  config = { damping: 12, mass: 0.5, stiffness: 100 },
}: SpringConfig): number {
  if (frame < delay) return 0;
  return spring({
    fps,
    frame: frame - delay,
    config,
  });
}

/** Fade in from 0 to 1 */
export function fadeIn(
  frame: number,
  startFrame: number,
  durationFrames: number
): number {
  return interpolate(frame, [startFrame, startFrame + durationFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

/** Fade out from 1 to 0 */
export function fadeOut(
  frame: number,
  startFrame: number,
  durationFrames: number
): number {
  return interpolate(frame, [startFrame, startFrame + durationFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

/** Combined fade in then fade out */
export function fadeInOut(
  frame: number,
  totalDuration: number,
  fadeFrames: number = 15
): number {
  const fadeInValue = fadeIn(frame, 0, fadeFrames);
  const fadeOutValue = fadeOut(frame, totalDuration - fadeFrames, fadeFrames);
  return Math.min(fadeInValue, fadeOutValue);
}

/** Slide up from offset */
export function slideUp(
  frame: number,
  startFrame: number,
  durationFrames: number,
  distance: number = 60
): number {
  return interpolate(
    frame,
    [startFrame, startFrame + durationFrames],
    [distance, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    }
  );
}

/** Slide in from left */
export function slideInLeft(
  frame: number,
  startFrame: number,
  durationFrames: number,
  distance: number = 100
): number {
  return interpolate(
    frame,
    [startFrame, startFrame + durationFrames],
    [-distance, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    }
  );
}

/** Slide in from right */
export function slideInRight(
  frame: number,
  startFrame: number,
  durationFrames: number,
  distance: number = 100
): number {
  return interpolate(
    frame,
    [startFrame, startFrame + durationFrames],
    [distance, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    }
  );
}

/** Scale from 0 to 1 with bounce */
export function scaleIn(
  fps: number,
  frame: number,
  delay: number = 0
): number {
  return springIn({
    fps,
    frame,
    delay,
    config: { damping: 10, mass: 0.6, stiffness: 120 },
  });
}

/** Count up animation from 0 to target value */
export function countUp(
  frame: number,
  startFrame: number,
  durationFrames: number,
  targetValue: number
): number {
  const progress = interpolate(
    frame,
    [startFrame, startFrame + durationFrames],
    [0, 1],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    }
  );
  return Math.round(progress * targetValue);
}

/** Typewriter effect - returns number of characters to show */
export function typewriter(
  frame: number,
  startFrame: number,
  textLength: number,
  speed: number = 2 // frames per character
): number {
  if (frame < startFrame) return 0;
  const elapsed = frame - startFrame;
  return Math.min(Math.floor(elapsed / speed), textLength);
}

/** Stagger delay for list items */
export function staggerDelay(index: number, baseDelay: number = 8): number {
  return index * baseDelay;
}

/** Pulsing glow animation */
export function pulseGlow(frame: number, speed: number = 0.05): number {
  return 0.5 + 0.5 * Math.sin(frame * speed);
}

/** Progress line drawing (0 to 1) */
export function drawLine(
  frame: number,
  startFrame: number,
  durationFrames: number
): number {
  return interpolate(
    frame,
    [startFrame, startFrame + durationFrames],
    [0, 1],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.inOut(Easing.cubic),
    }
  );
}

/** Shimmer / shine effect x-position */
export function shimmer(
  frame: number,
  startFrame: number,
  durationFrames: number
): number {
  return interpolate(
    frame,
    [startFrame, startFrame + durationFrames],
    [-100, 200],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );
}
