import React from "react";

type Props = {
  size?: number;
};

export const Logo: React.FC<Props> = ({ size = 220 }) => {
  return (
    <div
      style={{
        fontFamily:
          "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        fontWeight: 900,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: -size * 0.04,
        color: "#ffffff",
        textShadow: "0 6px 30px rgba(96,165,250,0.25)",
      }}
    >
      Commerly
    </div>
  );
};
