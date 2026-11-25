import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { LogoScene } from "./LogoScene";
import { PhoneShowcase } from "./PhoneShowcase";
import { CtaReelScene } from "./CtaScene";

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

// Duração de cada bloco em frames (30fps). Marcado em frames E segundos pra
// ficar fácil de reencaixar quando a música chegar — cada cena é um corte
// limpo, dá pra esticar/encurtar uma sem mexer nas outras.
export const LOGO_DUR = 70; // 2.33s — traços de luz + logo
export const PHONE_HOLD = 46; // 1.53s por print (3 prints)
export const PHONE_DUR = PHONE_HOLD * 3; // 4.6s — passeio pelo app
export const CTA_DUR = 70; // 2.33s — frase + CTA final

const logoStart = 0;
const logoEnd = logoStart + LOGO_DUR;
const phoneStart = logoEnd;
const phoneEnd = phoneStart + PHONE_DUR;
const ctaStart = phoneEnd;
const ctaEnd = ctaStart + CTA_DUR;

export const TOTAL_FRAMES = ctaEnd; // ~9.7s no total

export const CommerlyReel: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ background: "#050709" }}>
      {frame >= logoStart && frame < logoEnd && (
        <LogoScene frame={frame - logoStart} dur={LOGO_DUR} />
      )}
      {frame >= phoneStart && frame < phoneEnd && (
        <PhoneShowcase
          frame={frame - phoneStart}
          dur={PHONE_DUR}
          holdPerShot={PHONE_HOLD}
        />
      )}
      {frame >= ctaStart && frame < ctaEnd && (
        <CtaReelScene frame={frame - ctaStart} dur={CTA_DUR} />
      )}
    </AbsoluteFill>
  );
};
