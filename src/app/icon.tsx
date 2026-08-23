import { ImageResponse } from "next/og";

// Route segment config — generates /icon as the app's favicon.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1868DB", // brand.700, see tailwind.config.ts
          borderRadius: 7,
          color: "#FFFFFF",
          fontSize: 21,
          fontWeight: 700,
          fontFamily: "sans-serif",
        }}
      >
        $
      </div>
    ),
    { ...size },
  );
}
