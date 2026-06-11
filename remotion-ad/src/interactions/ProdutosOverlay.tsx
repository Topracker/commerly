import React from "react";
import { Cursor } from "./Cursor";
import { Modal, Field, PrimaryButton, Toast, TypeText } from "./ui";

// Coordenadas no espaço da tela do laptop (1280x720)
const BTN = { x: 1085, y: 73 };
const SALVAR = { x: 838, y: 452 };

// Produtos: cursor -> "+ Adicionar" -> modal -> digita nome/preço -> salvar -> toast
export const ProdutosOverlay: React.FC<{ frame: number }> = ({ frame }) => {
  const f = frame;
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 10 }}>
      <Modal frame={f - 50} closeAt={70} title="Novo Produto" width={460}>
        <Field label="Nome do produto" active={f >= 56 && f < 86}>
          <TypeText text="Coca-Cola 2L" frame={f - 58} caret={f < 86} />
        </Field>
        <Field label="Preço de venda" active={f >= 86 && f < 108}>
          <TypeText text="R$ 12,00" frame={f - 88} caret={f >= 86} />
        </Field>
        <PrimaryButton label="Salvar" frame={f} pressedAt={116} />
      </Modal>

      <Toast frame={f - 130} text="Produto adicionado" />

      <Cursor
        frame={f}
        visibleFrom={18}
        path={[
          { frame: 18, x: 1180, y: 600 },
          { frame: 40, x: BTN.x, y: BTN.y },
          { frame: 52, x: BTN.x, y: BTN.y },
          { frame: 70, x: 720, y: 360 },
          { frame: 104, x: 740, y: 400 },
          { frame: 114, x: SALVAR.x, y: SALVAR.y },
        ]}
        clicks={[44, 116]}
      />
    </div>
  );
};
