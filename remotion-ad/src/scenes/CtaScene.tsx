import React from "react";
import {
  AbsoluteFill,
  spring,
  useVideoConfig,
  interpolate,
} from "remotion";
import { Camera } from "../Camera";
import { MaskedText } from "../MaskedText";
import { LetterReveal } from "../LetterReveal";
import { parallax } from "../motion";

const FONT =
  "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

type Props = {
  frame: number;
  start: number;
  end: number;
};

// Oferta de lançamento — stagger: título 0, "Primeiros 100" +8,
// preço +14, "2 primeiros meses" +20, botão +26
export const CtaScene: React.FC<Props> = ({ frame, start, end }) => {
  const { fps } = useVideoConfig();
  if (frame < start || frame >= end) return null;

  const local = frame - start;
  const duration = end - start;

  const pTitle = parallax(frame, 15);
  const pText = parallax(frame, 25);

  const sub1Enter = spring({
    frame: local - 8,
    fps,
    config: { damping: 18, stiffness: 110 },
  });
  const priceEnter = spring({
    frame: local - 14,
    fps,
    config: { damping: 15, stiffness: 120 },
  });
  const sub2Enter = spring({
    frame: local - 20,
    fps,
    config: { damping: 18, stiffness: 110 },
  });
  const btnEnter = spring({
    frame: local - 26,
    fps,
    config: { damping: 16, stiffness: 120 },
  });
  const btnScale = interpolate(btnEnter, [0, 1], [0.8, 1], {
    extrapolateRight: "clamp",
  });

  // pulso contínuo do botão
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
              transform: `translate(${pTitle.x}px, ${pTitle.y}px)`,
              willChange: "transform",
            }}
          >
            <LetterReveal
              text="Lançamento Commerly"
              frame={local}
              delayPerChar={1.4}
              style={{
                fontFamily: FONT,
                fontWeight: 900,
                fontSize: 104,
                lineHeight: 1,
                letterSpacing: -3,
                color: "#ffffff",
                textShadow: "0 6px 30px rgba(96,165,250,0.25)",
              }}
            />
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
            <MaskedText progress={sub1Enter} style={{ marginTop: 34 }}>
              <div
                style={{
                  fontFamily: FONT,
                  color: "#94a3b8",
                  fontSize: 40,
                  fontWeight: 600,
                  letterSpacing: 0.5,
                }}
              >
                Primeiros 100 usuários
              </div>
            </MaskedText>

            <MaskedText progress={priceEnter} style={{ marginTop: 10 }}>
              <div
                style={{
                  fontFamily: FONT,
                  fontWeight: 900,
                  fontSize: 120,
                  lineHeight: 1.05,
                  letterSpacing: -3,
                  background:
                    "linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                R$ 29,90/mês
              </div>
            </MaskedText>

            <MaskedText progress={sub2Enter} style={{ marginTop: 14 }}>
              <div
                style={{
                  fontFamily: FONT,
                  fontSize: 34,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <span
                  style={{
                    color: "#4ade80",
                    background: "rgba(34,197,94,0.12)",
                    border: "1px solid rgba(34,197,94,0.35)",
                    borderRadius: 999,
                    padding: "6px 20px",
                    fontWeight: 800,
                  }}
                >
                  Economize R$ 50
                </span>
                <span style={{ color: "#94a3b8" }}>nos 2 primeiros meses</span>
              </div>
            </MaskedText>

            <MaskedText progress={btnEnter} style={{ marginTop: 40 }}>
              <div
                style={{
                  transform: `scale(${btnScale * btnPulse})`,
                  padding: "22px 52px",
                  borderRadius: 999,
                  background:
                    "linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)",
                  boxShadow:
                    "0 16px 48px rgba(37,99,235,0.5), inset 0 1px 0 rgba(255,255,255,0.25)",
                  fontFamily: FONT,
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: 38,
                  letterSpacing: -0.5,
                }}
              >
                Garanta sua vaga → commerly.vercel.app
              </div>
            </MaskedText>
          </div>
        </AbsoluteFill>
      </Camera>
    </AbsoluteFill>
  );
};
