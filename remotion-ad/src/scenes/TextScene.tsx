import React from "react";
import { AbsoluteFill, spring, useVideoConfig, interpolate } from "remotion";

type Props = {
  frame: number;
  start: number;
  end: number;
  text: string;
};

export const TextScene: React.FC<Props> = ({ frame, start, end, text }) => {
  const { fps } = useVideoConfig();
  if (frame < start || frame >= end) return null;

  const local = frame - start;
  const duration = end - start;

  const enter = spring({
    frame: local,
    fps,
    config: { damping: 18, stiffness: 80, mass: 1 },
  });

  const exitStart = duration - 18;
  const exit = interpolate(local, [exitStart, duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const words = text.split(" ");

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#ffffff",
        opacity: exit,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 22,
          fontFamily:
            "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
          fontWeight: 800,
          fontSize: 140,
          color: "#0b1220",
          letterSpacing: -3,
        }}
      >
        {words.map((w, i) => {
          const wordSpring = spring({
            frame: local - i * 8,
            fps,
            config: { damping: 16, stiffness: 110 },
          });
          const wy = interpolate(wordSpring, [0, 1], [60, 0]);
          return (
            <span
              key={i}
              style={{
                opacity: wordSpring,
                transform: `translateY(${wy}px)`,
                display: "inline-block",
                background:
                  i === words.length - 1
                    ? "linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)"
                    : "none",
                WebkitBackgroundClip: i === words.length - 1 ? "text" : undefined,
                WebkitTextFillColor:
                  i === words.length - 1 ? "transparent" : undefined,
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
      <div
        style={{
          marginTop: 28,
          fontFamily:
            "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
          color: "#475569",
          fontSize: 34,
          letterSpacing: 0.5,
          opacity: interpolate(enter, [0.4, 1], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Vendas · Estoque · Fiado · Equipe · IA
      </div>
    </AbsoluteFill>
  );
};
