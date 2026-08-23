import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Sidebar } from "@/components/Sidebar";
import { MutationIndicator } from "@/components/MutationIndicator";
import { MobileNavShell } from "@/components/MobileNavShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Budget App",
  description: "A personal YNAB-style budgeting app",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* Material Symbols (fonts.google.com/icons) — every icon in the
            app is one of these glyphs, rendered via the Icon component.
            This root layout wraps every page (it's the App Router's whole-
            app shell, not a single-page custom font), so the icon font
            loads once for the app rather than per page. `display=block`
            (not the usually-recommended `swap`/`optional`) is deliberate:
            this is a ligature font — the element's text content is the
            icon *name* ("check", "edit", …), swapped visually to the
            glyph once the font loads. `swap`/`optional` would let that
            raw name flash or stick as plain text if the font is slow;
            `block` hides it briefly instead. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font, @next/next/google-font-display */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
          rel="stylesheet"
        />
      </head>
      <body>
        <MutationIndicator />
        <MobileNavShell sidebar={<Sidebar />}>{children}</MobileNavShell>
        <Analytics />
      </body>
    </html>
  );
}
