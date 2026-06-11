import React from "react";
import { interpolate, Easing } from "remotion";

export type Waypoint = { frame: number; x: number; y: number };

type Props = {
  frame: number;
  path: Waypoint[];
  clicks?: number[];
  visibleFrom?: number;
  visibleTo?: number;
};

// Cursor simulando usuário real: move por waypoints com easing,
// "clica" com dip de scale + ripple
export const Cursor: React.FC<Props> = ({
  frame,
  path,
  clicks = [],
  visibleFrom = 0,
  visibleTo = Infinity,
}) => {
  if (frame < visibleFrom || frame > visibleTo || path.length < 2) return null;

  const frames = path.map((p) => p.frame);
  const x = interpolate(frame, frames, path.map((p) => p.x), {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });
  const y = interpolate(frame, frames, path.map((p) => p.y), {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });

  // dip de scale ao clicar
  let scale = 1;
  for (const cf of clicks) {
    if (frame >= cf && frame <= cf + 6) {
      scale = interpolate(frame, [cf, cf + 2, cf + 6], [1, 0.82, 1], {
        extrapolateRight: "clamp",
      });
    }
  }

  const fadeIn = interpolate(frame, [visibleFrom, visibleFrom + 6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <>
      {/* ripples de clique */}
      {clicks.map((cf) => {
        const age = frame - cf;
        if (age < 0 || age > 14) return null;
        const r = interpolate(age, [0, 14], [6, 34]);
        const op = interpolate(age, [0, 14], [0.55, 0]);
        return (
          <div
            key={cf}
            style={{
              position: "absolute",
              left: x - r,
              top: y - r,
              width: r * 2,
              height: r * 2,
              borderRadius: "50%",
              border: "2.5px solid rgba(96,165,250,0.9)",
              opacity: op,
              zIndex: 30,
            }}
          />
        );
      })}

      <svg
        width={30}
        height={34}
        viewBox="0 0 26 30"
        style={{
          position: "absolute",
          left: x,
          top: y,
          transform: `scale(${scale})`,
          transformOrigin: "4px 4px",
          opacity: fadeIn,
          zIndex: 31,
          filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.6))",
        }}
      >
        <path
          d="M3 2 L3 23 L8.5 18.5 L12 27 L15.8 25.3 L12.3 17 L20 17 Z"
          fill="#ffffff"
          stroke="#0b1220"
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
      </svg>
    </>
  );
};
