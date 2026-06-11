import React from "react";
import { AbsoluteFill, spring, useVideoConfig, interpolate } from "remotion";
import { PhoneMockup } from "../PhoneMockup";

type Props = {
  frame: number;
  start: number;
  end: number;
  src: string;
};

export const ScreenScene: React.FC<Props> = ({ frame, start, end, src }) => {
  const { fps } = useVideoConfig();
  if (frame < start - 4 || frame >= end + 4) return null;

  const local = frame - start;
  const duration = end - start;

  const enter = spring({
    frame: local,
    fps,
    config: { damping: 16, stiffness: 85, mass: 1 },
  });

  const exitStart = duration - 14;
  const exit = interpolate(local, [exitStart, duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // entra suavemente pela direita
  const slideX = interpolate(enter, [0, 1], [900, 0]);
  const opacity = enter * exit;

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#ffffff",
        opacity,
      }}
    >
      <div
        style={{
          transform: `translateX(${slideX}px)`,
        }}
      >
        <PhoneMockup src={src} tilt={-10} scale={1} />
      </div>
    </AbsoluteFill>
  );
};
