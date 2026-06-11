import React from "react";
import { interpolate, spring, useVideoConfig } from "remotion";

const FONT =
  "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

// ——— digitação com caret ———
export const TypeText: React.FC<{
  text: string;
  // frame local da digitação (0 = primeira letra)
  frame: number;
  framesPerChar?: number;
  style?: React.CSSProperties;
  caret?: boolean;
}> = ({ text, frame, framesPerChar = 2, style, caret = true }) => {
  const count = Math.max(0, Math.min(text.length, Math.floor(frame / framesPerChar)));
  const typing = frame >= 0 && count < text.length;
  const caretOn = caret && frame >= 0 && (typing || frame % 16 < 8);
  return (
    <span style={{ fontFamily: FONT, ...style }}>
      {text.slice(0, count)}
      <span
        style={{
          display: "inline-block",
          width: 2,
          height: "1.05em",
          verticalAlign: "text-bottom",
          background: "#60a5fa",
          marginLeft: 2,
          opacity: caretOn ? 1 : 0,
        }}
      />
    </span>
  );
};

// ——— modal escuro no estilo do app ———
export const Modal: React.FC<{
  // frame local desde a abertura
  frame: number;
  closeAt?: number;
  title: string;
  width?: number;
  children: React.ReactNode;
}> = ({ frame, closeAt, title, width = 480, children }) => {
  const { fps } = useVideoConfig();
  if (frame < 0) return null;

  const enter = spring({ frame, fps, config: { damping: 16, stiffness: 160 } });
  let scale = 0.92 + 0.08 * enter;
  let opacity = interpolate(frame, [0, 5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (closeAt !== undefined && frame >= closeAt) {
    const t = (frame - closeAt) / 8;
    if (t >= 1) return null;
    scale = 1 - 0.06 * t;
    opacity = 1 - t;
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `rgba(2,6,16,${0.55 * opacity})`,
        zIndex: 20,
      }}
    >
      <div
        style={{
          width,
          transform: `scale(${scale}) translateY(${(1 - enter) * 14}px)`,
          opacity,
          background: "#0f172a",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 14,
          boxShadow: "0 30px 80px rgba(0,0,0,0.7)",
          padding: "22px 24px",
          fontFamily: FONT,
        }}
      >
        <div
          style={{
            color: "#f1f5f9",
            fontWeight: 700,
            fontSize: 21,
            marginBottom: 16,
          }}
        >
          {title}
        </div>
        {children}
      </div>
    </div>
  );
};

// ——— campo de formulário ———
export const Field: React.FC<{
  label: string;
  active?: boolean;
  children: React.ReactNode;
}> = ({ label, active, children }) => (
  <div style={{ marginBottom: 14, fontFamily: FONT }}>
    <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 6 }}>{label}</div>
    <div
      style={{
        background: "#1e293b",
        border: active
          ? "1.5px solid #3b82f6"
          : "1.5px solid rgba(255,255,255,0.07)",
        borderRadius: 9,
        padding: "10px 13px",
        fontSize: 16,
        color: "#f1f5f9",
        minHeight: 22,
        boxShadow: active ? "0 0 0 3px rgba(59,130,246,0.18)" : undefined,
      }}
    >
      {children}
    </div>
  </div>
);

// ——— botão primário do modal ———
export const PrimaryButton: React.FC<{
  label: string;
  pressedAt?: number;
  frame: number;
}> = ({ label, pressedAt, frame }) => {
  let scale = 1;
  if (pressedAt !== undefined && frame >= pressedAt && frame <= pressedAt + 6) {
    scale = interpolate(frame, [pressedAt, pressedAt + 2, pressedAt + 6], [1, 0.94, 1], {
      extrapolateRight: "clamp",
    });
  }
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
      <div
        style={{
          fontFamily: FONT,
          background: "#2563eb",
          color: "#ffffff",
          fontWeight: 600,
          fontSize: 15.5,
          padding: "10px 26px",
          borderRadius: 9,
          transform: `scale(${scale})`,
          boxShadow: "0 6px 18px rgba(37,99,235,0.4)",
        }}
      >
        {label}
      </div>
    </div>
  );
};

// ——— toast de sucesso ———
export const Toast: React.FC<{
  // frame local desde o aparecimento
  frame: number;
  text: string;
  duration?: number;
}> = ({ frame, text, duration = 30 }) => {
  if (frame < 0 || frame > duration) return null;
  const inOp = interpolate(frame, [0, 6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const outOp = interpolate(frame, [duration - 8, duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame, [0, 6], [-14, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        top: 18,
        right: 22,
        transform: `translateY(${y}px)`,
        opacity: Math.min(inOp, outOp),
        background: "#052e1b",
        border: "1px solid rgba(34,197,94,0.45)",
        color: "#4ade80",
        fontFamily: FONT,
        fontWeight: 600,
        fontSize: 15,
        padding: "10px 18px",
        borderRadius: 10,
        boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
        zIndex: 25,
      }}
    >
      ✓ {text}
    </div>
  );
};
