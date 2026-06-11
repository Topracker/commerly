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
  dur: number;
  overlay?: React.FC<{ frame: number }>;
};

export type FeatureTransition = "zoom" | "swipe";

type Props = {
  frame: number;
  start: number;
  end: number;
  features: Feature[];
  // transição entre cada par de features (length = features.length - 1)
  transitions: FeatureTransition[];
};

// janela da transição (frames de saída e de entrada)
const T = 12;
// origem do zoom = centro da tela do notebook
const ZOOM_ORIGIN = "50% 42%";

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
  transitions,
}) => {
  if (frame < start || frame >= end) return null;

  const local = frame - start;

  // encontra a feature ativa pelas durações acumuladas
  let idx = 0;
  let offset = 0;
  for (let i = 0; i < features.length; i++) {
    if (local < offset + features[i].dur || i === features.length - 1) {
      idx = i;
      break;
    }
    offset += features[i].dur;
  }
  const feature = features[idx];
  const fi = local - offset;
  const dur = feature.dur;
  const [driftX, driftY] = DRIFTS[idx % DRIFTS.length];

  const transIn = idx > 0 ? transitions[idx - 1] : null;
  const transOut = idx < features.length - 1 ? transitions[idx] : null;

  // ——— transformação de transição (cena inteira) ———
  let transScale = 1;
  let transX = 0;
  let transBlur = 0;
  let origin = "center center";

  if (transOut && fi >= dur - T) {
    const p = interpolate(fi, [dur - T, dur], [0, 1], {
      extrapolateRight: "clamp",
      easing: Easing.in(Easing.cubic),
    });
    if (transOut === "zoom") {
      transScale = 1 + p * 1.6;
      transBlur = p * 10;
      origin = ZOOM_ORIGIN;
    } else {
      transX = -p * 1500;
      transBlur = p * 8;
    }
  } else if (transIn && fi < T) {
    const q = interpolate(fi, [0, T], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });
    if (transIn === "zoom") {
      transScale = 1 + (1 - q) * 1.6;
      transBlur = (1 - q) * 10;
      origin = ZOOM_ORIGIN;
    } else {
      transX = (1 - q) * 1500;
      transBlur = (1 - q) * 8;
    }
  }

  // ——— parallax / aproximação contínua ———
  const pNotebook = parallax(frame, 15);
  const pText = parallax(frame, 25);
  const approach = interpolate(fi / dur, [0, 1], [0, 1], {
    easing: Easing.out(Easing.quad),
  });

  // entrada com personalidade só na primeira feature (vem do logo)
  const isFirst = idx === 0;
  const entY = isFirst
    ? interpolate(fi, [0, 18], [50, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      })
    : 0;
  const entScale = isFirst
    ? interpolate(fi, [0, 12, 20], [0.9, 1.05, 1.0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.quad),
      })
    : 1;
  const entRot = isFirst
    ? interpolate(fi, [0, 18], [-2, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      })
    : 0;
  const notebookScale = entScale * (1 + approach * 0.05);

  // label/ícone entram depois da transição assentar
  const labelDelay = isFirst ? 6 : T + 2;
  const iconScale = interpolate(
    fi,
    [labelDelay, labelDelay + 9, labelDelay + 16],
    [0.8, 1.05, 1.0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.quad),
    },
  );
  const iconOpacity = interpolate(fi, [labelDelay, labelDelay + 7], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const Overlay = feature.overlay;

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translateX(${transX}px) scale(${transScale})`,
          transformOrigin: origin,
          filter: transBlur > 0.1 ? `blur(${transBlur}px)` : undefined,
          willChange: "transform",
        }}
      >
        <Camera
          frame={fi}
          duration={dur}
          driftX={driftX}
          driftY={driftY}
          rotate={idx % 2 === 0 ? 0.5 : -0.5}
        >
          <AbsoluteFill
            style={{
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* glow azul vivo atrás do notebook */}
            <div
              style={{
                position: "absolute",
                width: 1820,
                height: 1080,
                borderRadius: "50%",
                background:
                  "radial-gradient(ellipse at center, rgba(37,99,235,0.5) 0%, rgba(124,58,237,0.16) 45%, rgba(0,0,0,0) 70%)",
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
              {/* notebook — parallax + aproximação contínua */}
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
                  {Overlay ? <Overlay frame={fi} /> : null}
                </LaptopMockup>
              </div>

              {/* label com ícone — parallax 25px */}
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
                  frame={fi - labelDelay}
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
      </div>
    </AbsoluteFill>
  );
};
