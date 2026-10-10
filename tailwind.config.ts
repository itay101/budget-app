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
        // Category Target statuses (#148/#171): a solid for bars and icons,
        // a soft chip background, and chip text that passes 4.5:1 on it.
        // From design.md's status palette; the dark values recorded in #148
        // wait for an app-wide dark mode.
        target: {
          funded: { DEFAULT: "#22A06B", bg: "#DCFFF1", fg: "#216E4E" },
          overfunded: { DEFAULT: "#1868DB", bg: "#E9F2FF", fg: "#0055CC" },
          ontrack: { DEFAULT: "#1D7F8C", bg: "#E7F9FF", fg: "#206A83" },
          underfunded: { DEFAULT: "#B38600", bg: "#FFF7D6", fg: "#7F5F01" },
          overspent: { DEFAULT: "#CA3521", bg: "#FFECEB", fg: "#AE2E24" },
          snoozed: { DEFAULT: "#6E5DC6", bg: "#F3F0FF", fg: "#5E4DB2" },
          none: { DEFAULT: "#8590A2", bg: "#F1F2F4", fg: "#44546F" },
          track: "#EBECF0",
        },
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
        // Height of MobileNavShell's top bar (p-200 + an h3 line + its
        // 1px border), so sticky page toolbars sit just under it.
        "mobile-nav": "57px",
      },
      // The budget table's columns (#171), shared by its header row and
      // each category row: Category · Budgeted · Activity · Available from
      // sm (the target on its own line), with the Target column from lg.
      gridTemplateColumns: {
        budget: "1fr 120px 120px 120px",
        "budget-targets": "minmax(9rem, 1fr) minmax(0, 2fr) 128px 100px 112px",
      },
      keyframes: {
        "mutation-bar": {
          "0%": { transform: "translateX(-100%)" },
          "50%": { transform: "translateX(50%)" },
          "100%": { transform: "translateX(200%)" },
        },
      },
      animation: {
        "mutation-bar": "mutation-bar 1.1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
