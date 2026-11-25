import React from "react";
import { AbsoluteFill, Img, staticFile, interpolate, Easing } from "remotion";

type Shot = { src: string; label: string };

// Prints reais tirados direto do app num viewport de celular (430x932) —
// os antigos em screenshots/ são capturas de desktop e ficavam cortados
// dentro da moldura vertical.
const SHOTS: Shot[] = [
  { src: "screenshots_mobile/dashboard.jpg", label: "Tudo da loja num painel só" },
  { src: "screenshots_mobile/vendas.jpg", label: "Venda em segundos" },
  { src: "screenshots_mobile/assistente.jpg", label: "Com IA do seu lado" },
];

type Props = {
  frame: number; // frame local da cena
  dur: number;
  holdPerShot: number; // frames que cada print fica em tela
};

// Moldura de celular feita do zero para esse vídeo (mais simples que o
// PhoneMockup do anúncio antigo: só o que esse corte vertical precisa).
export const PhoneShowcase: React.FC<Props> = ({ frame, dur, holdPerShot }) => {
  const entrance = interpolate(frame, [0, 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const exit = interpolate(frame, [dur - 14, dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const shotIndex = Math.min(
    SHOTS.length - 1,
    Math.floor(frame / holdPerShot),
  );
  const shot = SHOTS[shotIndex];
  const localInShot = frame - shotIndex * holdPerShot;
  const shotFade = interpolate(localInShot, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const screenW = 560;
  const screenH = 1180;
  const bezel = 20;

  return (
    <AbsoluteFill
      style={{
        background: "radial-gradient(ellipse at 50% 30%, #0e1a16 0%, #0a0f1a 60%, #050709 100%)",
        opacity: 1 - exit,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          opacity: entrance,
          transform: `translateY(${(1 - entrance) * 40}px) scale(${0.92 + entrance * 0.08})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: screenW + bezel * 2,
            height: screenH + bezel * 2,
            borderRadius: 64,
            padding: bezel,
            boxSizing: "border-box",
            background: "linear-gradient(155deg, #10201b 0%, #0a0f1a 60%, #050709 100%)",
            boxShadow:
              "0 0 0 1.5px rgba(0,200,150,0.35), 0 40px 100px rgba(0,0,0,0.55), 0 0 90px rgba(0,200,150,0.18)",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 16,
              left: "50%",
              transform: "translateX(-50%)",
              width: 100,
              height: 26,
              borderRadius: 999,
              background: "#000",
              zIndex: 3,
            }}
          />
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: 46,
              overflow: "hidden",
              position: "relative",
              background: "#0a0f1a",
            }}
          >
            <Img
              key={shot.src}
              src={staticFile(shot.src)}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "top center",
                opacity: shotFade,
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 46,
                boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,0.08)",
                pointerEvents: "none",
              }}
            />
          </div>
        </div>

        <div
          key={`label-${shotIndex}`}
          style={{
            marginTop: 34,
            opacity: shotFade,
            fontFamily: "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
            fontWeight: 600,
            fontSize: 30,
            color: "#e6fff6",
            textAlign: "center",
            textShadow: "0 0 24px rgba(0,200,150,0.3)",
          }}
        >
          {shot.label}
        </div>
      </div>
    </AbsoluteFill>
  );
};
