import React from "react";
import { interpolate } from "remotion";

type Props = {
  // progresso da entrada (spring 0..1)
  progress: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
};

// Texto entrando por máscara: overflow hidden + translateY, com motion blur leve
export const MaskedText: React.FC<Props> = ({ progress, children, style }) => {
  const p = Math.min(Math.max(progress, 0), 1);
  const y = interpolate(p, [0, 1], [110, 0]);
  const blur = interpolate(p, [0, 0.8, 1], [7, 1, 0]);

  return (
    <div style={{ overflow: "hidden", padding: "0.08em 0.15em", ...style }}>
      <div
        style={{
          transform: `translateY(${y}%)`,
          filter: blur > 0.1 ? `blur(${blur}px)` : undefined,
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  );
};
