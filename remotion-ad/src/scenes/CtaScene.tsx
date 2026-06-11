import React from "react";
import {
  AbsoluteFill,
  spring,
  useVideoConfig,
  interpolate,
  Easing,
} from "remotion";
import { Logo } from "../Logo";
import { Camera } from "../Camera";
import { MaskedText } from "../MaskedText";
import { LetterReveal } from "../LetterReveal";
import { parallax } from "../motion";

type Props = {
  frame: number;
  start: number;
  end: number;
};

export const CtaScene: React.FC<Props> = ({ frame, start, end }) => {
  const { fps } = useVideoConfig();
  if (frame < start || frame >= end) return null;

  const local = frame - start;
  const duration = end - start;

  const pLogo = parallax(frame, 15);
  const pText = parallax(frame, 25);

  // stagger: logo 0s, url +0.2s, botão +0.4s
  const logoScale = interpolate(local, [0, 10, 18], [0.8, 1.05, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });
  const logoOpacity = interpolate(local, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const logoBlur = interpolate(local, [0, 10], [5, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const btnEnter = spring({
    frame: local - 12,
    fps,
    config: { damping: 16, stiffness: 120 },
  });
  const btnScale = interpolate(btnEnter, [0, 1], [0.8, 1], {
    extrapolateRight: "clamp",
  });

  // pulso contínuo do botão — nada fica parado
  const btnPulse = 1 + 0.015 * Math.sin(local / 9);

  const fadeOut = interpolate(local, [duration - 12, duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: fadeOut }}>
      <Camera frame={local} duration={duration} driftX={10} driftY={-10} rotate={-0.5}>
        <AbsoluteFill
          style={{
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              opacity: logoOpacity,
              transform: `translate(${pLogo.x}px, ${pLogo.y}px) scale(${logoScale})`,
              filter: logoBlur > 0.1 ? `blur(${logoBlur}px)` : undefined,
              willChange: "transform",
            }}
          >
            <Logo size={280} />
          </div>

          <div
            style={{
              transform: `translate(${pText.x}px, ${pText.y}px)`,
              willChange: "transform",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <LetterReveal
              text="commerly.vercel.app"
              frame={local - 6}
              delayPerChar={1.2}
              style={{
                marginTop: 32,
                fontFamily:
                  "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
                color: "#cbd5e1",
                fontWeight: 600,
                fontSize: 60,
                letterSpacing: -0.5,
                textShadow: "0 4px 24px rgba(0,0,0,0.4)",
              }}
            />

            <MaskedText progress={btnEnter} style={{ marginTop: 36 }}>
              <div
                style={{
                  transform: `scale(${btnScale * btnPulse})`,
                  padding: "22px 56px",
                  borderRadius: 999,
                  background:
                    "linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)",
                  boxShadow:
                    "0 16px 48px rgba(37,99,235,0.5), inset 0 1px 0 rgba(255,255,255,0.25)",
                  fontFamily:
                    "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: 40,
                  letterSpacing: -0.5,
                }}
              >
                Comece grátis agora
              </div>
            </MaskedText>
          </div>
        </AbsoluteFill>
      </Camera>
    </AbsoluteFill>
  );
};
