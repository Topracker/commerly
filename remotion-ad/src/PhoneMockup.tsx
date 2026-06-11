import React from "react";
import { Img, staticFile } from "remotion";

type Props = {
  src: string;
  tilt?: number;
  scale?: number;
};

export const PhoneMockup: React.FC<Props> = ({ src, tilt = -10, scale = 1 }) => {
  const screenW = 460;
  const screenH = 940;
  const bezel = 18;
  const bodyW = screenW + bezel * 2;
  const bodyH = screenH + bezel * 2;
  const radiusBody = 72;
  const radiusScreen = radiusBody - bezel;

  return (
    <div
      style={{
        transform: `rotate(${tilt}deg) scale(${scale})`,
        transformOrigin: "center center",
        filter: "drop-shadow(0 50px 80px rgba(15,23,42,0.28))",
      }}
    >
      <div
        style={{
          width: bodyW,
          height: bodyH,
          borderRadius: radiusBody,
          background:
            "linear-gradient(150deg, #0f172a 0%, #1e293b 45%, #020617 100%)",
          padding: bezel,
          boxSizing: "border-box",
          position: "relative",
        }}
      >
        {/* side button */}
        <div
          style={{
            position: "absolute",
            right: -3,
            top: 220,
            width: 5,
            height: 90,
            borderRadius: 4,
            background: "#1e293b",
          }}
        />
        {/* volume buttons */}
        <div
          style={{
            position: "absolute",
            left: -3,
            top: 180,
            width: 5,
            height: 60,
            borderRadius: 4,
            background: "#1e293b",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: -3,
            top: 260,
            width: 5,
            height: 60,
            borderRadius: 4,
            background: "#1e293b",
          }}
        />

        {/* screen */}
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: radiusScreen,
            overflow: "hidden",
            background: "#ffffff",
            position: "relative",
          }}
        >
          <Img
            src={staticFile(src)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "top center",
              display: "block",
            }}
          />

          {/* dynamic island */}
          <div
            style={{
              position: "absolute",
              top: 14,
              left: "50%",
              transform: "translateX(-50%)",
              width: 110,
              height: 30,
              borderRadius: 999,
              background: "#000",
              zIndex: 3,
            }}
          />

          {/* glass reflection */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: radiusScreen,
              background:
                "linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 35%, rgba(255,255,255,0) 65%, rgba(255,255,255,0.08) 100%)",
              pointerEvents: "none",
              zIndex: 4,
            }}
          />

          {/* subtle inner border highlight */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: radiusScreen,
              boxShadow:
                "inset 0 0 0 1.5px rgba(255,255,255,0.08), inset 0 0 30px rgba(0,0,0,0.15)",
              pointerEvents: "none",
              zIndex: 5,
            }}
          />
        </div>
      </div>
    </div>
  );
};
