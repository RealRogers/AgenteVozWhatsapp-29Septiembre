import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Space_Grotesk } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { Agentation } from "agentation";
import { brandStyleOverride } from "@/lib/branding";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Agente WhatsApp",
  description: "Plataforma de inbox conversacional para WhatsApp con IA",
  // Tell the Dark Reader browser extension to leave this page alone: its DOM
  // injections (data-darkreader-inline-* attrs) break React hydration.
  other: { "darkreader-lock": "true" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const brand = brandStyleOverride();

  return (
    <html lang="es" suppressHydrationWarning>
      {brand && (
        <head>
          {/* Inline so the brand tint lands on first paint, before hydration. */}
          <style dangerouslySetInnerHTML={{ __html: brand }} />
        </head>
      )}
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} ${spaceGrotesk.variable} font-body antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
          {/* Opt-in: "Block page interactions" queda activo y captura los
              clicks de la página (menús y formularios "no responden").
              Actívala con NEXT_PUBLIC_AGENTATION=1 solo cuando anotes UI. */}
          {process.env.NODE_ENV === "development" &&
            process.env.NEXT_PUBLIC_AGENTATION === "1" && <Agentation />}
        </ThemeProvider>
      </body>
    </html>
  );
}
