import { Composition } from "remotion";
import { CommerlyAd, TOTAL_FRAMES, FPS, WIDTH, HEIGHT } from "./CommerlyAd";
import {
  CommerlyReel,
  TOTAL_FRAMES as REEL_FRAMES,
  FPS as REEL_FPS,
  WIDTH as REEL_WIDTH,
  HEIGHT as REEL_HEIGHT,
} from "./reel/CommerlyReel";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="CommerlyAd"
        component={CommerlyAd}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      {/* Reel vertical (9:16) feito do zero, estilo traço-de-luz -> logo ->
          app -> CTA. Duração ainda sem música; reajusto os cortes quando o
          Matheus mandar a trilha. */}
      <Composition
        id="CommerlyReel"
        component={CommerlyReel}
        durationInFrames={REEL_FRAMES}
        fps={REEL_FPS}
        width={REEL_WIDTH}
        height={REEL_HEIGHT}
      />
    </>
  );
};
