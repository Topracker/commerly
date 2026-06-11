import React from "react";
import { interpolate } from "remotion";
import { Cursor } from "./Cursor";
import { Modal, Field, PrimaryButton, Toast, TypeText } from "./ui";

// Coordenadas no espaço da tela do laptop (1280x720)
const BTN = { x: 1134, y: 87 };
const SALVAR = { x: 838, y: 448 };

// Fiado: cursor -> "+ Adicionar" -> modal -> João Silva / R$ 150 -> salvar ->
// total pendente atualiza na tela + toast
export const FiadoOverlay: React.FC<{ frame: number }> = ({ frame }) => {
  const f = frame;

  // total atualizado aparece com um pop depois do salvar
  const totalPop =
    f >= 126
      ? interpolate(f, [126, 132, 138], [0.8, 1.08, 1], {
          extrapolateRight: "clamp",
        })
      : 0;

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 10 }}>
      {/* patch sobre o "Total pendente R$ 0.00" com o valor novo */}
      {f >= 126 && (
        <div
          style={{
            position: "absolute",
            left: 495,
            top: 142,
            width: 260,
            height: 42,
            background: "#0d1726",
            display: "flex",
            alignItems: "center",
          }}
        >
          <div
            style={{
              fontFamily:
                "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
              color: "#f87171",
              fontWeight: 800,
              fontSize: 27,
              transform: `scale(${totalPop})`,
              transformOrigin: "left center",
            }}
          >
            R$ 150,00
          </div>
        </div>
      )}

      <Modal frame={f - 48} closeAt={68} title="Novo Fiado" width={460}>
        <Field label="Cliente" active={f >= 54 && f < 80}>
          <TypeText text="João Silva" frame={f - 56} caret={f < 80} />
        </Field>
        <Field label="Valor" active={f >= 80 && f < 104}>
          <TypeText text="R$ 150,00" frame={f - 82} caret={f >= 80} />
        </Field>
        <PrimaryButton label="Salvar" frame={f} pressedAt={112} />
      </Modal>

      <Toast frame={f - 126} text="Fiado registrado" />

      <Cursor
        frame={f}
        visibleFrom={16}
        path={[
          { frame: 16, x: 1160, y: 590 },
          { frame: 38, x: BTN.x, y: BTN.y },
          { frame: 50, x: BTN.x, y: BTN.y },
          { frame: 66, x: 720, y: 355 },
          { frame: 100, x: 740, y: 395 },
          { frame: 110, x: SALVAR.x, y: SALVAR.y },
        ]}
        clicks={[42, 112]}
      />
    </div>
  );
};
