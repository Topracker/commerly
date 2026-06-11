import React from "react";
import { Cursor } from "./Cursor";
import { Modal, Field, TypeText } from "./ui";

// Coordenadas no espaço da tela do laptop (1280x720)
const BTN = { x: 1114, y: 72 };

// Funcionários: cursor -> "+ Adicionar" -> modal abre e é preenchido
export const FuncionariosOverlay: React.FC<{ frame: number }> = ({ frame }) => {
  const f = frame;
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 10 }}>
      <Modal frame={f - 44} title="Novo Funcionário" width={460}>
        <Field label="Nome" active={f >= 50 && f < 78}>
          <TypeText text="Maria Souza" frame={f - 52} caret={f < 78} />
        </Field>
        <Field label="Cargo" active={f >= 78}>
          <TypeText text="Atendente" frame={f - 80} caret={f >= 78} />
        </Field>
      </Modal>

      <Cursor
        frame={f}
        visibleFrom={14}
        path={[
          { frame: 14, x: 1120, y: 580 },
          { frame: 34, x: BTN.x, y: BTN.y },
          { frame: 46, x: BTN.x, y: BTN.y },
          { frame: 60, x: 720, y: 350 },
        ]}
        clicks={[38]}
      />
    </div>
  );
};
