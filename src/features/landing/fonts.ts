import { Montserrat, Instrument_Sans } from "next/font/google";

/**
 * Fuentes de la landing (fidelidad con el HTML original).
 * Solo se importan desde `src/app/page.tsx` → next/font las code-splitea
 * y no se cargan en el resto de la app, que sigue con Geist/Space Grotesk.
 */
export const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-montserrat",
  display: "swap",
});

export const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-instrument",
  display: "swap",
});
