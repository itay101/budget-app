import type { Config } from "tailwindcss";

// Color/type tokens from design.md (Atlassian Design System) applied as our
// design system, since this is a personal app built for one user's own use.
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          700: "#1868DB", // primary actions, links, focus states
          800: "#0055CC", // hover states
          900: "#09326C", // active/pressed states
        },
        neutral: {
          0: "#FFFFFF",
          100: "#F7F8F9",
          200: "#DCDFE4",
          600: "#44546F",
          800: "#172B4D",
        },
        success: "#22A06B",
        warning: "#B38600",
        danger: "#CA3521",
        discovery: "#6E5DC6",
        info: "#1D7F8C",
      },
      fontSize: {
        display: ["35px", { lineHeight: "40px", fontWeight: "500" }],
        h1: ["29px", { lineHeight: "32px", fontWeight: "600" }],
        h2: ["24px", { lineHeight: "28px", fontWeight: "500" }],
        h3: ["20px", { lineHeight: "24px", fontWeight: "500" }],
        body: ["14px", { lineHeight: "20px", fontWeight: "400" }],
        small: ["12px", { lineHeight: "16px", fontWeight: "400" }],
      },
      spacing: {
        100: "8px",
        200: "16px",
        300: "24px",
        400: "32px",
      },
    },
  },
  plugins: [],
};

export default config;
