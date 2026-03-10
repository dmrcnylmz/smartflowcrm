import React from 'react';
import { Composition } from 'remotion';
import { ProductDemo } from './compositions/ProductDemo';
import { PricingOverview } from './compositions/PricingOverview';
import { ProductDemoEN } from './compositions/ProductDemoEN';
import { PricingOverviewEN } from './compositions/PricingOverviewEN';
import { ProductDemoEN_Mobile } from './compositions/ProductDemoEN_Mobile';
import { VIDEO, VIDEO_MOBILE } from './theme';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Turkish versions (16:9) */}
      <Composition
        id="product-demo"
        component={ProductDemo}
        durationInFrames={2400}
        fps={VIDEO.fps}
        width={VIDEO.width}
        height={VIDEO.height}
      />
      <Composition
        id="pricing-overview"
        component={PricingOverview}
        durationInFrames={750}
        fps={VIDEO.fps}
        width={VIDEO.width}
        height={VIDEO.height}
      />

      {/* English versions (16:9) */}
      <Composition
        id="product-demo-en"
        component={ProductDemoEN}
        durationInFrames={2400}
        fps={VIDEO.fps}
        width={VIDEO.width}
        height={VIDEO.height}
      />
      <Composition
        id="pricing-overview-en"
        component={PricingOverviewEN}
        durationInFrames={750}
        fps={VIDEO.fps}
        width={VIDEO.width}
        height={VIDEO.height}
      />

      {/* English Mobile (9:16 vertical) */}
      <Composition
        id="product-demo-en-mobile"
        component={ProductDemoEN_Mobile}
        durationInFrames={2400}
        fps={VIDEO_MOBILE.fps}
        width={VIDEO_MOBILE.width}
        height={VIDEO_MOBILE.height}
      />
    </>
  );
};
