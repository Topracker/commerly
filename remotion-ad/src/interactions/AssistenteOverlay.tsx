import React from "react";
import { interpolate, spring, useVideoConfig } from "remotion";
import { TypeText } from "./ui";

const FONT =
  "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

const QUESTION = "Quanto vendi hoje?";
const ANSWER =
  "Hoje você vendeu R$ 1.250,00 em 18 vendas! 🎉 Seu produto mais vendido foi Coca-Cola 2L.";

const TYPE_START = 24;
const SEND = 66;
const DOTS_START = 74;
const ANSWER_START = 106;

// Assistente IA: usuário digita pergunta -> envia -> IA "pensa" -> responde palavra a palavra
export const AssistenteOverlay: React.FC<{ frame: number }> = ({ frame }) => {
  const { fps } = useVideoConfig();
  const f = frame;

  const userIn = spring({
    frame: f - (SEND + 2),
    fps,
    config: { damping: 15, stiffness: 160 },
  });
  const aiIn = spring({
    frame: f - ANSWER_START,
    fps,
    config: { damping: 15, stiffness: 160 },
  });

  const words = ANSWER.split(" ");
  const wordCount = Math.max(
    0,
    Math.min(words.length, Math.floor((f - ANSWER_START) / 3) + 1),
  );

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 10, fontFamily: FONT }}>
      {/* cobre a área central (sugestões) para virar área de conversa */}
      <div
        style={{
          position: "absolute",
          left: 270,
          top: 64,
          right: 0,
          height: 524,
          background: "#020610",
        }}
      >
        {/* bolha do usuário */}
        {f >= SEND + 2 && (
          <div
            style={{
              position: "absolute",
              top: 60,
              right: 60,
              maxWidth: 420,
              opacity: userIn,
              transform: `translateY(${(1 - userIn) * 16}px)`,
              background: "#2563eb",
              color: "#ffffff",
              fontSize: 17,
              fontWeight: 500,
              padding: "12px 18px",
              borderRadius: "16px 16px 4px 16px",
              boxShadow: "0 8px 24px rgba(37,99,235,0.35)",
            }}
          >
            {QUESTION}
          </div>
        )}

        {/* indicador de digitação da IA */}
        {f >= DOTS_START && f < ANSWER_START && (
          <div
            style={{
              position: "absolute",
              top: 140,
              left: 60,
              background: "#101a2c",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: "16px 16px 16px 4px",
              padding: "14px 18px",
              display: "flex",
              gap: 6,
            }}
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#7c3aed",
                  opacity: 0.4 + 0.6 * Math.abs(Math.sin((f - i * 4) / 6)),
                  transform: `translateY(${-3 * Math.abs(Math.sin((f - i * 4) / 6))}px)`,
                }}
              />
            ))}
          </div>
        )}

        {/* resposta da IA palavra a palavra */}
        {f >= ANSWER_START && (
          <div
            style={{
              position: "absolute",
              top: 140,
              left: 60,
              maxWidth: 560,
              opacity: aiIn,
              transform: `translateY(${(1 - aiIn) * 14}px)`,
              background: "#101a2c",
              border: "1px solid rgba(124,58,237,0.35)",
              color: "#e2e8f0",
              fontSize: 17,
              lineHeight: 1.55,
              padding: "14px 20px",
              borderRadius: "16px 16px 16px 4px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
            }}
          >
            <div
              style={{
                color: "#a78bfa",
                fontWeight: 700,
                fontSize: 13,
                marginBottom: 6,
                letterSpacing: 0.5,
              }}
            >
              ✦ ASSISTENTE IA
            </div>
            {words.slice(0, wordCount).join(" ")}
          </div>
        )}
      </div>

      {/* texto digitado sobre o campo de input original */}
      {f >= TYPE_START && f < SEND && (
        <div
          style={{
            position: "absolute",
            left: 296,
            top: 617,
            height: 26,
            display: "flex",
            alignItems: "center",
            background: "#0b1322",
            paddingRight: 10,
          }}
        >
          <TypeText
            text={QUESTION}
            frame={f - TYPE_START}
            style={{ color: "#f1f5f9", fontSize: 16.5 }}
          />
        </div>
      )}
    </div>
  );
};
