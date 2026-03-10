/**
 * Product Demo Composition
 * Full product walkthrough: 2400 frames (80s) at 30fps
 */

import React from 'react';
import { Sequence, AbsoluteFill } from 'remotion';
import { SCENES } from '../../theme';

import { S01_Intro } from './scenes/S01_Intro';
import { S02_Problem } from './scenes/S02_Problem';
import { S03_Solution } from './scenes/S03_Solution';
import { S04_Features } from './scenes/S04_Features';
import { S05_HowItWorks } from './scenes/S05_HowItWorks';
import { S06_Stats } from './scenes/S06_Stats';
import { S07_Dashboard } from './scenes/S07_Dashboard';
import { S08_Pricing } from './scenes/S08_Pricing';
import { S09_CTA } from './scenes/S09_CTA';

export const ProductDemo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a14' }}>
      <Sequence from={SCENES.S01_INTRO.from} durationInFrames={SCENES.S01_INTRO.duration}>
        <S01_Intro />
      </Sequence>

      <Sequence from={SCENES.S02_PROBLEM.from} durationInFrames={SCENES.S02_PROBLEM.duration}>
        <S02_Problem />
      </Sequence>

      <Sequence from={SCENES.S03_SOLUTION.from} durationInFrames={SCENES.S03_SOLUTION.duration}>
        <S03_Solution />
      </Sequence>

      <Sequence from={SCENES.S04_FEATURES.from} durationInFrames={SCENES.S04_FEATURES.duration}>
        <S04_Features />
      </Sequence>

      <Sequence from={SCENES.S05_HOW_IT_WORKS.from} durationInFrames={SCENES.S05_HOW_IT_WORKS.duration}>
        <S05_HowItWorks />
      </Sequence>

      <Sequence from={SCENES.S06_STATS.from} durationInFrames={SCENES.S06_STATS.duration}>
        <S06_Stats />
      </Sequence>

      <Sequence from={SCENES.S07_DASHBOARD.from} durationInFrames={SCENES.S07_DASHBOARD.duration}>
        <S07_Dashboard />
      </Sequence>

      <Sequence from={SCENES.S08_PRICING.from} durationInFrames={SCENES.S08_PRICING.duration}>
        <S08_Pricing />
      </Sequence>

      <Sequence from={SCENES.S09_CTA.from} durationInFrames={SCENES.S09_CTA.duration}>
        <S09_CTA />
      </Sequence>
    </AbsoluteFill>
  );
};
