import React from "react";
import { AbsoluteFill } from "remotion";

const W = 1920;
const H = 1080;
const COUNT = 26;

// pseudo-random determinístico por índice (estável entre frames)
const rand = (i: number, salt: number) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const PARTICLES = new Array(COUNT).fill(0).map((_, i) => ({
  x: rand(i, 1) * W,
  baseY: rand(i, 2) * H,
  size: 2 + rand(i, 3) * 3.5,
  speed: 0.15 + rand(i, 4) * 0.35, // px/frame subindo
  opacity: 0.04 + rand(i, 5) * 0.09,
  swayAmp: 8 + rand(i, 6) * 14,
  swayFreq: 70 + rand(i, 7) * 90,
  blue: rand(i, 8) > 0.5,
}));

// Partículas extremamente discretas flutuando para cima (estilo Stripe)
export const Particles: React.FC<{ frame: number }> = ({ frame }) => {
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {PARTICLES.map((p, i) => {
        const y = ((p.baseY - frame * p.speed) % (H + 80) + (H + 80)) % (H + 80) - 40;
        const x = p.x + Math.sin(frame / p.swayFreq + i) * p.swayAmp;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: p.size,
              height: p.size,
              borderRadius: "50%",
              background: p.blue ? "#60a5fa" : "#e2e8f0",
              opacity: p.opacity,
              filter: "blur(1px)",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
