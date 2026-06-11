import { Composition } from "remotion";
import { CommerlyAd, TOTAL_FRAMES, FPS, WIDTH, HEIGHT } from "./CommerlyAd";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="CommerlyAd"
      component={CommerlyAd}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
};
