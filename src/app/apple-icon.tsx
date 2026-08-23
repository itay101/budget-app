import { ImageResponse } from "next/og";

// Route segment config — generates /apple-icon for iOS home-screen icons.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
          color: "#FFFFFF",
          fontSize: 108,
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
