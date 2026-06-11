import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { LogoIntro } from "./scenes/LogoIntro";
import {
  FeaturesScene,
  Feature,
  FeatureTransition,
} from "./scenes/FeaturesScene";
import { CtaScene } from "./scenes/CtaScene";
import { BubbleTransition } from "./BubbleTransition";
import { Particles } from "./Particles";
import { parallax } from "./motion";
import { ProdutosOverlay } from "./interactions/ProdutosOverlay";
import { FiadoOverlay } from "./interactions/FiadoOverlay";
import { FuncionariosOverlay } from "./interactions/FuncionariosOverlay";
import { AssistenteOverlay } from "./interactions/AssistenteOverlay";

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

const LOGO_DUR = 70;
const CTA_DUR = 170;

const features: Feature[] = [
  { src: "screenshots/dashboard.png", label: "Dashboard inteligente", icon: "📊", dur: 75 },
  { src: "screenshots/vendas.png", label: "Controle de vendas", icon: "🛒", dur: 70 },
  { src: "screenshots/produtos.png", label: "Gestão de produtos", icon: "📦", dur: 165, overlay: ProdutosOverlay },
  { src: "screenshots/fiado.png", label: "Vendas no fiado", icon: "🤝", dur: 160, overlay: FiadoOverlay },
  { src: "screenshots/gastos.png", label: "Controle de gastos", icon: "💸", dur: 65 },
  { src: "screenshots/funcionarios.png", label: "Gestão de funcionários", icon: "👥", dur: 130, overlay: FuncionariosOverlay },
  { src: "screenshots/assistente.png", label: "Assistente com IA", icon: "🤖", dur: 200, overlay: AssistenteOverlay },
];

// variação de transições: maioria zoom no notebook, 2 swipes laterais,
// bolha azul só na chegada da oferta final
const transitions: FeatureTransition[] = [
  "zoom", // dashboard -> vendas
  "swipe", // vendas -> produtos
  "zoom", // produtos -> fiado
  "swipe", // fiado -> gastos
  "zoom", // gastos -> funcionários
  "zoom", // funcionários -> assistente
];

const FEATURES_DUR = features.reduce((acc, f) => acc + f.dur, 0);

const featuresStart = LOGO_DUR;
const featuresEnd = featuresStart + FEATURES_DUR;
const ctaStart = featuresEnd;
const ctaEnd = ctaStart + CTA_DUR;

export const TOTAL_FRAMES = ctaEnd;

export const CommerlyAd: React.FC = () => {
  const frame = useCurrentFrame();
  const pBg = parallax(frame, 5);

  return (
    <AbsoluteFill style={{ background: "#02030a" }}>
      {/* fundo com parallax 5px — sempre em movimento */}
      <div
        style={{
          position: "absolute",
          inset: -60,
          transform: `translate(${pBg.x}px, ${pBg.y}px)`,
          willChange: "transform",
          background:
            "radial-gradient(ellipse at 50% 40%, #14223f 0%, #0a1124 40%, #050811 80%, #02030a 100%)",
        }}
      />

      {/* partículas discretas estilo Stripe */}
      <Particles frame={frame} />

      <LogoIntro frame={frame} start={0} end={LOGO_DUR} />

      <FeaturesScene
        frame={frame}
        start={featuresStart}
        end={featuresEnd}
        features={features}
        transitions={transitions}
      />

      <CtaScene frame={frame} start={ctaStart} end={ctaEnd} />

      {/* bolha azul reservada para o momento mais importante: a oferta */}
      <BubbleTransition frame={frame} center={ctaStart} />
    </AbsoluteFill>
  );
};
