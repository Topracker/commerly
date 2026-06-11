import React from "react";
import { spring, useVideoConfig, interpolate } from "remotion";

type Props = {
  text: string;
  // frame local (0 = início da entrada)
  frame: number;
  delayPerChar?: number;
  style?: React.CSSProperties;
};

// Título com reveal por máscara letra a letra: cada caractere sobe por trás
// de um clip individual (overflow hidden), com stagger e motion blur leve
export const LetterReveal: React.FC<Props> = ({
  text,
  frame,
  delayPerChar = 1.5,
  style,
}) => {
  const { fps } = useVideoConfig();
  const chars = text.split("");

  return (
    <div style={{ display: "flex", whiteSpace: "pre", ...style }}>
      {chars.map((c, i) => {
        const p = spring({
          frame: frame - i * delayPerChar,
          fps,
          config: { damping: 18, stiffness: 130 },
        });
        const y = interpolate(p, [0, 1], [120, 0], {
          extrapolateRight: "clamp",
        });
        const blur = interpolate(p, [0, 0.8, 1], [6, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              overflow: "hidden",
              // folga no clip para não cortar serifa/sombra, sem mudar layout
              padding: "0.12em 0.06em 0.06em",
              margin: "-0.12em -0.06em -0.06em",
            }}
          >
            <span
              style={{
                display: "inline-block",
                transform: `translateY(${y}%)`,
                filter: blur > 0.1 ? `blur(${blur}px)` : undefined,
                willChange: "transform",
              }}
            >
              {c}
            </span>
          </span>
        );
      })}
    </div>
  );
};
