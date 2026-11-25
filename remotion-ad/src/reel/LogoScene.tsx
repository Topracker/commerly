import React from "react";
import { AbsoluteFill, interpolate, Easing } from "remotion";
import { SwirlReveal } from "./SwirlReveal";

type Props = {
  frame: number; // frame local da cena (já começa em 0)
  dur: number;
};

export const LogoScene: React.FC<Props> = ({ frame, dur }) => {
  // logo entra suave logo depois do pico dos traços de luz
  const logoIn = interpolate(frame, [20, 34], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const tagIn = interpolate(frame, [30, 44], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // saída: tudo escurece/funde pra cena do app
  const exit = interpolate(frame, [dur - 14, dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: "radial-gradient(ellipse at 50% 45%, #0e1a16 0%, #0a0f1a 55%, #050709 100%)",
        opacity: 1 - exit,
      }}
    >
      <SwirlReveal frame={frame} />

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            opacity: logoIn,
            transform: `scale(${0.85 + logoIn * 0.15}) translateY(${(1 - logoIn) * 18}px)`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              fontFamily:
                "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
              fontWeight: 800,
              fontSize: 112,
              letterSpacing: -112 * 0.03,
              color: "#ffffff",
              textShadow: "0 0 60px rgba(0,200,150,0.45), 0 0 140px rgba(0,200,150,0.25)",
            }}
          >
            Commerly
          </div>
          <div
            style={{
              marginTop: 18,
              opacity: tagIn,
              fontFamily: "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
              fontSize: 30,
              fontWeight: 500,
              letterSpacing: 0.5,
              color: "#8fb8ab",
              textAlign: "center",
            }}
          >
            O sistema operacional do seu comércio
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
