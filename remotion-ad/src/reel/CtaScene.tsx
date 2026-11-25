import React from "react";
import { AbsoluteFill, interpolate, Easing } from "remotion";
import { SwirlReveal } from "./SwirlReveal";

type Props = {
  frame: number;
  dur: number;
};

export const CtaReelScene: React.FC<Props> = ({ frame, dur }) => {
  const in1 = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const in2 = interpolate(frame, [10, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const in3 = interpolate(frame, [20, 36], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exit = interpolate(frame, [dur - 12, dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: "radial-gradient(ellipse at 50% 55%, #0e1a16 0%, #0a0f1a 55%, #050709 100%)",
        opacity: 1 - exit,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <SwirlReveal frame={frame} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div
          style={{
            opacity: in1,
            transform: `translateY(${(1 - in1) * 16}px)`,
            fontFamily: "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
            fontWeight: 800,
            fontSize: 58,
            color: "#ffffff",
            textAlign: "center",
            maxWidth: 820,
            lineHeight: 1.15,
          }}
        >
          Pare de anotar no caderno.
        </div>
        <div
          style={{
            marginTop: 10,
            opacity: in2,
            transform: `translateY(${(1 - in2) * 16}px)`,
            fontFamily: "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
            fontWeight: 800,
            fontSize: 58,
            background: "linear-gradient(90deg, #00c896, #7ef9d8)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            textAlign: "center",
          }}
        >
          Comece no Commerly.
        </div>

        <div
          style={{
            marginTop: 56,
            opacity: in3,
            transform: `translateY(${(1 - in3) * 12}px) scale(${0.95 + in3 * 0.05})`,
            padding: "20px 44px",
            borderRadius: 999,
            background: "linear-gradient(90deg, #00c896, #00a97e)",
            boxShadow: "0 20px 60px rgba(0,200,150,0.35)",
            fontFamily: "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
            fontWeight: 700,
            fontSize: 34,
            color: "#04140f",
          }}
        >
          commerly.com.br
        </div>
      </div>
    </AbsoluteFill>
  );
};
