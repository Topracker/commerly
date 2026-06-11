import React from "react";

type Props = {
  children: React.ReactNode;
  // 0..1 — quanto o notebook já se aproximou da câmera (anima a sombra)
  approach?: number;
  // 0..1 — progresso do brilho diagonal atravessando a tela (0 = desligado)
  glare?: number;
};

// Dimensions chosen to fit safely in 1920x1080 with room for label below
export const LAPTOP_SCREEN_W = 1280;
export const LAPTOP_SCREEN_H = 720;

export const LaptopMockup: React.FC<Props> = ({
  children,
  approach = 0,
  glare = 0,
}) => {
  const a = Math.min(Math.max(approach, 0), 1);
  const g = Math.min(Math.max(glare, 0), 1);
  // opacidade 0 -> 20% -> 0 enquanto o brilho atravessa
  const glareOpacity = Math.sin(g * Math.PI) * 0.2;
  const screenW = LAPTOP_SCREEN_W;
  const screenH = LAPTOP_SCREEN_H;
  const topBezel = 22;
  const sideBezel = 22;
  const bottomBezel = 56;
  const bodyW = screenW + sideBezel * 2;
  const bodyH = screenH + topBezel + bottomBezel;
  const baseW = bodyW + 180;
  const baseH = 22;

  return (
    <div
      style={{
        perspective: "1900px",
        transformStyle: "preserve-3d",
        position: "relative",
      }}
    >
      {/* sombra de chão elíptica — cresce conforme o notebook se aproxima */}
      <div
        style={{
          position: "absolute",
          bottom: -46 - a * 10,
          left: "50%",
          transform: `translateX(-50%) scale(${1 + a * 0.12})`,
          width: baseW * 1.06,
          height: 90,
          borderRadius: "50%",
          opacity: 0.8 + a * 0.2,
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 70%)",
        }}
      />
      <div
        style={{
          transform: "rotateX(8deg)",
          transformOrigin: "center bottom",
          // um único drop-shadow: três encadeados triplicavam o custo de render
          filter: `drop-shadow(0 ${70 + a * 30}px ${90 + a * 40}px rgba(0,0,0,0.75))`,
        }}
      >
        {/* lid / body */}
        <div
          style={{
            width: bodyW,
            height: bodyH,
            borderRadius: 22,
            background:
              "linear-gradient(180deg, #0b0b12 0%, #16161f 60%, #0a0a12 100%)",
            padding: `${topBezel}px ${sideBezel}px ${bottomBezel}px`,
            boxSizing: "border-box",
            position: "relative",
            boxShadow:
              "inset 0 0 0 1px rgba(255,255,255,0.06), inset 0 2px 0 rgba(255,255,255,0.04)",
          }}
        >
          {/* camera dot */}
          <div
            style={{
              position: "absolute",
              top: 9,
              left: "50%",
              transform: "translateX(-50%)",
              width: 7,
              height: 7,
              borderRadius: 999,
              background: "#05050a",
              boxShadow: "inset 0 0 0 1.5px #2a2a35",
            }}
          />

          {/* screen */}
          <div
            style={{
              width: screenW,
              height: screenH,
              borderRadius: 4,
              overflow: "hidden",
              background: "#ffffff",
              position: "relative",
            }}
          >
            {children}

            {/* brilho diagonal premium atravessando a tela */}
            {glareOpacity > 0.005 && (
              <div
                style={{
                  position: "absolute",
                  top: "-60%",
                  left: `${-70 + g * 220}%`,
                  width: "55%",
                  height: "220%",
                  transform: "rotate(18deg)",
                  background:
                    "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.85) 50%, rgba(255,255,255,0) 100%)",
                  opacity: glareOpacity,
                  pointerEvents: "none",
                  zIndex: 7,
                }}
              />
            )}

            {/* glass reflection overlay */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(115deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 30%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.045) 100%)",
                pointerEvents: "none",
                zIndex: 5,
              }}
            />
            {/* inner border */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)",
                pointerEvents: "none",
                zIndex: 6,
              }}
            />
          </div>

          {/* brand label */}
          <div
            style={{
              position: "absolute",
              bottom: 18,
              left: 0,
              right: 0,
              textAlign: "center",
              color: "rgba(255,255,255,0.2)",
              fontFamily:
                "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 5,
            }}
          >
            COMMERLY
          </div>
        </div>

        {/* hinge / base */}
        <div
          style={{
            width: baseW,
            height: baseH,
            marginLeft: -(baseW - bodyW) / 2,
            background:
              "linear-gradient(180deg, #1a1a22 0%, #0a0a12 60%, #05050a 100%)",
            borderRadius: "0 0 16px 16px",
            boxShadow:
              "0 6px 14px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
            position: "relative",
          }}
        >
          {/* trackpad notch */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: 160,
              height: 5,
              background: "rgba(0,0,0,0.55)",
              borderRadius: 3,
            }}
          />
        </div>
      </div>
    </div>
  );
};
