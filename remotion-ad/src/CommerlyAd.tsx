import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { LogoIntro } from "./scenes/LogoIntro";
import { FeaturesScene, Feature } from "./scenes/FeaturesScene";
import { CtaScene } from "./scenes/CtaScene";
import { BubbleTransition } from "./BubbleTransition";
import { Particles } from "./Particles";
import { parallax } from "./motion";

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

const LOGO_DUR = 70;
const SCENE_DUR = 80;
const CTA_DUR = 120;

const features: Feature[] = [
  { src: "screenshots/dashboard.png", label: "Dashboard inteligente", icon: "📊" },
  { src: "screenshots/vendas.png", label: "Controle de vendas", icon: "🛒" },
  { src: "screenshots/produtos.png", label: "Gestão de produtos", icon: "📦" },
  { src: "screenshots/fiado.png", label: "Vendas no fiado", icon: "🤝" },
  { src: "screenshots/gastos.png", label: "Controle de gastos", icon: "💸" },
  { src: "screenshots/funcionarios.png", label: "Gestão de funcionários", icon: "👥" },
  { src: "screenshots/assistente.png", label: "Assistente com IA", icon: "🤖" },
];

const FEATURES_DUR = features.length * SCENE_DUR;

const featuresStart = LOGO_DUR;
const featuresEnd = featuresStart + FEATURES_DUR;
const ctaStart = featuresEnd;
const ctaEnd = ctaStart + CTA_DUR;

export const TOTAL_FRAMES = ctaEnd;

// frames onde a bolha cobre 100% da tela (cada corte de cena)
const transitionCenters: number[] = [
  LOGO_DUR,
  ...features.slice(1).map((_, i) => featuresStart + (i + 1) * SCENE_DUR),
  ctaStart,
];

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
        sceneDur={SCENE_DUR}
      />

      <CtaScene frame={frame} start={ctaStart} end={ctaEnd} />

      {transitionCenters.map((center) => (
        <BubbleTransition key={center} frame={frame} center={center} />
      ))}
    </AbsoluteFill>
  );
};
