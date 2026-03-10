/**
 * Pricing Overview Composition — English Version
 * Focused pricing comparison: 750 frames (25s) at 30fps
 */

import React from 'react';
import { Sequence, AbsoluteFill } from 'remotion';
import { PRICING_SCENES } from '../../theme';

import { P01_Title } from './scenes/P01_Title';
import { P02_Cards } from './scenes/P02_Cards';
import { P03_Comparison } from './scenes/P03_Comparison';
import { P04_CTA } from './scenes/P04_CTA';

export const PricingOverviewEN: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a14' }}>
      <Sequence from={PRICING_SCENES.P01_TITLE.from} durationInFrames={PRICING_SCENES.P01_TITLE.duration}><P01_Title /></Sequence>
      <Sequence from={PRICING_SCENES.P02_CARDS.from} durationInFrames={PRICING_SCENES.P02_CARDS.duration}><P02_Cards /></Sequence>
      <Sequence from={PRICING_SCENES.P03_COMPARISON.from} durationInFrames={PRICING_SCENES.P03_COMPARISON.duration}><P03_Comparison /></Sequence>
      <Sequence from={PRICING_SCENES.P04_CTA.from} durationInFrames={PRICING_SCENES.P04_CTA.duration}><P04_CTA /></Sequence>
    </AbsoluteFill>
  );
};
