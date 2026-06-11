import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  Easing,
  staticFile,
} from "remotion";
import { LaptopMockup } from "../LaptopMockup";
import { Camera } from "../Camera";
import { LetterReveal } from "../LetterReveal";
import { parallax } from "../motion";

export type Feature = {
  src: string;
  label: string;
  icon: string;
};

type Props = {
  frame: number;
  start: number;
  end: number;
  features: Feature[];
  sceneDur: number;
};

// drift alternado por sub-cena para variar o movimento de câmera
const DRIFTS: Array<[number, number]> = [
  [-16, -8],
  [14, -10],
  [-12, 10],
  [16, 6],
  [-14, -12],
  [12, 12],
  [-16, 8],
];

export const FeaturesScene: React.FC<Props> = ({
  frame,
  start,
  end,
  features,
  sceneDur,
}) => {
  if (frame < start || frame >= end) return null;

  const local = frame - start;
  const idx = Math.min(Math.floor(local / sceneDur), features.length - 1);
  const subLocal = local - idx * sceneDur;
  const subProgress = Math.min(subLocal / sceneDur, 1);
  const feature = features[idx];
  const [driftX, driftY] = DRIFTS[idx % DRIFTS.length];

  // parallax: notebook 15px, texto 25px (mesma direção, fundo move 5px no root)
  const pNotebook = parallax(frame, 15);
  const pText = parallax(frame, 25);

  // notebook aproximando devagar durante a cena inteira
  const approach = interpolate(subProgress, [0, 1], [0, 1], {
    easing: Easing.out(Easing.quad),
  });

  // entrada com personalidade: Y 50 -> 0, scale 0.9 -> 1.05 -> 1, rot -2° -> 0°
  const entY = interpolate(subLocal, [0, 18], [50, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const entScale = interpolate(subLocal, [0, 12, 20], [0.9, 1.05, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });
  const entRot = interpolate(subLocal, [0, 18], [-2, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const notebookScale = entScale * (1 + approach * 0.07);

  // motion blur leve: chegada da troca + saída para a próxima bolha
  const inBlur = interpolate(subLocal, [0, 9], [3, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const outBlur = interpolate(subLocal, [sceneDur - 8, sceneDur], [0, 2.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const sceneBlur = Math.max(inBlur, outBlur);

  // stagger de entradas: ícone 0s, label +0.2s (6 frames)
  const iconScale = interpolate(subLocal, [0, 9, 16], [0.8, 1.05, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });
  const iconOpacity = interpolate(subLocal, [0, 7], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <Camera
        frame={subLocal}
        duration={sceneDur}
        driftX={driftX}
        driftY={driftY}
        rotate={idx % 2 === 0 ? 0.5 : -0.5}
      >
        <AbsoluteFill
          style={{
            alignItems: "center",
            justifyContent: "center",
            filter: sceneBlur > 0.1 ? `blur(${sceneBlur}px)` : undefined,
          }}
        >
          {/* glow azul vivo atrás do notebook — pulsa continuamente */}
          <div
            style={{
              position: "absolute",
              width: 1820,
              height: 1080,
              borderRadius: "50%",
              background:
                "radial-gradient(ellipse at center, rgba(37,99,235,0.5) 0%, rgba(124,58,237,0.16) 45%, rgba(0,0,0,0) 70%)",
              // sem filter blur: o gradiente radial já é suave e blur(40px)
              // em 1820x1080 era um dos maiores custos por frame
              transform: `scale(${1 + 0.04 * Math.sin(frame / 28)})`,
              opacity: 0.85 + 0.15 * Math.sin(frame / 23),
            }}
          />

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {/* camada do notebook — parallax 15px + entrada + aproximação contínua */}
            <div
              style={{
                transform: `translate(${pNotebook.x}px, ${pNotebook.y + entY}px) rotate(${entRot}deg) scale(${notebookScale})`,
                transformOrigin: "center center",
                willChange: "transform",
              }}
            >
              <LaptopMockup approach={approach}>
                <Img
                  src={staticFile(feature.src)}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "top center",
                  }}
                />
              </LaptopMockup>
            </div>

            {/* camada de texto — parallax 25px */}
            <div
              style={{
                marginTop: 52,
                height: 100,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 28,
                transform: `translate(${pText.x}px, ${pText.y}px)`,
                willChange: "transform",
              }}
            >
              <div
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: 24,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 46,
                  background:
                    "linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)",
                  boxShadow:
                    "0 12px 36px rgba(37,99,235,0.45), inset 0 1px 0 rgba(255,255,255,0.25)",
                  transform: `scale(${iconScale})`,
                  opacity: iconOpacity,
                }}
              >
                {feature.icon}
              </div>

              <LetterReveal
                text={feature.label}
                frame={subLocal - 6}
                delayPerChar={1.2}
                style={{
                  fontFamily:
                    "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
                  fontWeight: 700,
                  fontSize: 64,
                  color: "#ffffff",
                  letterSpacing: -1,
                  textShadow: "0 4px 24px rgba(0,0,0,0.4)",
                }}
              />
            </div>
          </div>
        </AbsoluteFill>
      </Camera>
    </AbsoluteFill>
  );
};
