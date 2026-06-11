import React from "react";
import { AbsoluteFill, spring, useVideoConfig } from "remotion";
import { Camera } from "../Camera";
import { MaskedText } from "../MaskedText";
import { LetterReveal } from "../LetterReveal";
import { parallax } from "../motion";

type Props = {
  frame: number;
  start: number;
  end: number;
};

export const LogoIntro: React.FC<Props> = ({ frame, start, end }) => {
  const { fps } = useVideoConfig();
  if (frame < start || frame >= end) return null;

  const local = frame - start;
  const duration = end - start;

  const pLogo = parallax(frame, 15);
  const pText = parallax(frame, 25);

  // stagger: logo 0s, tagline +0.2s, chips +0.4s
  const taglineEnter = spring({
    frame: local - 6,
    fps,
    config: { damping: 18, stiffness: 110 },
  });
  const chipsEnter = spring({
    frame: local - 12,
    fps,
    config: { damping: 18, stiffness: 110 },
  });

  return (
    <AbsoluteFill>
      <Camera frame={local} duration={duration} driftX={-12} driftY={-8}>
        <AbsoluteFill
          style={{
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              transform: `translate(${pLogo.x}px, ${pLogo.y}px)`,
              willChange: "transform",
            }}
          >
            <LetterReveal
              text="Commerly"
              frame={local}
              delayPerChar={2}
              style={{
                fontFamily:
                  "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
                fontWeight: 900,
                fontSize: 240,
                lineHeight: 1,
                letterSpacing: -240 * 0.04,
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
            <MaskedText progress={taglineEnter} style={{ marginTop: 24 }}>
              <div
                style={{
                  fontFamily:
                    "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
                  color: "#94a3b8",
                  fontSize: 38,
                  fontWeight: 500,
                  letterSpacing: 0.5,
                  textAlign: "center",
                }}
              >
                Gestão completa para o seu comércio
              </div>
            </MaskedText>

            <MaskedText progress={chipsEnter} style={{ marginTop: 18 }}>
              <div
                style={{
                  fontFamily:
                    "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
                  color: "#64748b",
                  fontSize: 28,
                  fontWeight: 600,
                  letterSpacing: 1.5,
                  textAlign: "center",
                }}
              >
                Vendas · Estoque · Fiado · Equipe · IA
              </div>
            </MaskedText>
          </div>
        </AbsoluteFill>
      </Camera>
    </AbsoluteFill>
  );
};
