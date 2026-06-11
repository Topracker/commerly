import React from "react";
import { AbsoluteFill, interpolate, Easing } from "remotion";

type Props = {
  frame: number;
  // frame em que a bolha cobre 100% da tela (momento do corte)
  center: number;
  inDur?: number;
  outDur?: number;
};

// Diagonal de 1920x1080 ≈ 2203px — 2400 garante cobertura total no scale 1
const BUBBLE_SIZE = 2400;

export const BubbleTransition: React.FC<Props> = ({
  frame,
  center,
  inDur = 13,
  outDur = 15,
}) => {
  if (frame < center - inDur || frame > center + outDur) return null;

  // crescimento com overshoot: 0 -> 1.15, assenta em 1, depois encolhe
  // enquanto a próxima cena já anima por trás
  const scale = interpolate(
    frame,
    [center - inDur, center, center + 4, center + outDur],
    [0, 1.15, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.45, 0, 0.3, 1),
    },
  );

  // motion blur proporcional à velocidade da bolha
  const growBlur = interpolate(frame, [center - inDur, center], [10, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const shrinkBlur = interpolate(frame, [center + 4, center + outDur], [0, 6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // blur só quando a borda do círculo está visível na tela — com a bolha
  // cobrindo tudo o blur não muda nada visualmente e custa caro no render
  const rawBlur = frame < center ? growBlur : shrinkBlur;
  const blur = scale > 0.85 ? 0 : rawBlur;

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 50,
      }}
    >
      <div
        style={{
          width: BUBBLE_SIZE,
          height: BUBBLE_SIZE,
          borderRadius: "50%",
          flexShrink: 0,
          transform: `scale(${scale})`,
          filter: blur > 0.1 ? `blur(${blur}px)` : undefined,
          background:
            "radial-gradient(circle at 32% 28%, #3b82f6 0%, #2563eb 45%, #1e40af 100%)",
          boxShadow: "0 0 120px rgba(59,130,246,0.45)",
        }}
      />
    </AbsoluteFill>
  );
};
