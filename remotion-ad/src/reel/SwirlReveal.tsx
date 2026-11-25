import React from "react";
import { interpolate, Easing } from "remotion";

// Traços de luz feitos do zero pra esse vídeo: cada "fio" é um arco SVG com
// gradiente + blur, desenhado com stroke-dasharray/offset (nasce como um
// risco de luz correndo pelo próprio caminho, não um path estático que só
// pisca). Cor no verde da marca (--color-acento, #00c896), não a paleta
// vermelha do vídeo de referência — mesma técnica, identidade da Commerly.
type Fio = {
  d: string;
  delay: number; // frames de atraso antes de começar a desenhar
  dur: number; // frames pra desenhar o traço inteiro
  width: number;
  color: string;
  blur: number;
  fadeOutAt: number; // frame local em que começa a sumir
};

// Centro do palco: (540, 960) — meio exato de um quadro 1080x1920.
const FIOS: Fio[] = [
  { d: "M -100,960 C 150,840 280,1120 540,960 S 900,720 1180,960", delay: 0, dur: 26, width: 5, color: "#00c896", blur: 10, fadeOutAt: 46 },
  { d: "M -50,1060 C 200,960 380,1200 540,1060 S 950,900 1130,1100", delay: 4, dur: 24, width: 3, color: "#5eead4", blur: 6, fadeOutAt: 44 },
  { d: "M 1180,860 C 950,960 760,780 540,860 S 150,1020 -100,840", delay: 7, dur: 26, width: 4, color: "#00a97e", blur: 8, fadeOutAt: 48 },
  { d: "M 540,560 C 440,720 640,840 540,960", delay: 10, dur: 18, width: 3, color: "#7ef9d8", blur: 7, fadeOutAt: 42 },
  { d: "M 540,1360 C 640,1200 440,1080 540,960", delay: 12, dur: 18, width: 3, color: "#00c896", blur: 7, fadeOutAt: 42 },
];

const PATH_LEN = 1400; // comprimento aproximado suficiente p/ todos os arcos acima

export const SwirlReveal: React.FC<{ frame: number }> = ({ frame }) => {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 1080 1920"
      style={{ position: "absolute", top: 0, left: 0, overflow: "visible" }}
    >
      <defs>
        <filter id="swirlGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {FIOS.map((f, i) => {
        const local = frame - f.delay;
        // 0 -> 1: o traço "cresce" ao longo do caminho
        const draw = interpolate(local, [0, f.dur], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        });
        const opacity = interpolate(
          frame,
          [f.delay, f.delay + 4, f.fadeOutAt, f.fadeOutAt + 14],
          [0, 1, 1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        if (opacity <= 0.002) return null;
        const dash = PATH_LEN;
        const offset = dash * (1 - draw);
        return (
          <path
            key={i}
            d={f.d}
            fill="none"
            stroke={f.color}
            strokeWidth={f.width}
            strokeLinecap="round"
            opacity={opacity}
            filter={`blur(${f.blur}px)`}
            style={{ filter: `url(#swirlGlow) blur(${f.blur}px)` }}
            strokeDasharray={dash}
            strokeDashoffset={offset}
          />
        );
      })}
    </svg>
  );
};
