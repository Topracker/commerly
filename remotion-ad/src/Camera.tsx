import React from "react";

type Props = {
  // frame local da cena
  frame: number;
  duration: number;
  driftX?: number;
  driftY?: number;
  // rotação leve acumulada ao longo da cena (graus)
  rotate?: number;
  children: React.ReactNode;
};

// Câmera respirando: push-in 1 -> 1.05 contínuo + subida lenta 0 -> -15px
// + micro-oscilação de scale/posição que nunca para + rotação leve 0 -> 0.5°
export const Camera: React.FC<Props> = ({
  frame,
  duration,
  driftX = 0,
  driftY = -15,
  rotate = 0.5,
  children,
}) => {
  const progress = Math.min(Math.max(frame / duration, 0), 1);

  const scale = 1 + 0.05 * progress + 0.004 * Math.sin(frame / 21);
  const x = driftX * progress + 3 * Math.sin(frame / 47);
  const y = driftY * progress + 3 * Math.cos(frame / 59);
  const rot = rotate * progress + 0.06 * Math.sin(frame / 33);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        transform: `scale(${scale}) translate(${x}px, ${y}px) rotate(${rot}deg)`,
        transformOrigin: "center center",
        willChange: "transform",
      }}
    >
      {children}
    </div>
  );
};
