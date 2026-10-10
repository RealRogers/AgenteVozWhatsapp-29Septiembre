import type { Metadata, Viewport } from "next";
import {
  AgentsSection,
  ContactSection,
  DemoSection,
  FaqSection,
  FeaturesSection,
  HeroSection,
  HowItWorksSection,
  IndustriesSection,
  IntegrationsStrip,
  LandingFooter,
  LandingHeader,
  PricingSection,
  ProblemSection,
  SecuritySection,
  ShowcaseSection,
  StatsStrip,
  TestimonialsSection,
  WhatsAppFloat,
} from "@/features/landing";
import { instrumentSans, montserrat } from "@/features/landing/fonts";
import { createClient } from "@/lib/supabase/server";
import "@/features/landing/landing.css";

export const metadata: Metadata = {
  title: "Agente WhatsApp con IA | Atiende, agenda y vende 24/7",
  description:
    "Un inbox estilo WhatsApp Web donde la IA atiende sola y tu equipo entra cuando quiera. Agenda citas, transcribe notas de voz y guarda leads automáticamente.",
  openGraph: {
    title: "Agente WhatsApp con IA",
    description: "Tu WhatsApp atendido 24/7. Tú entras cuando quieras.",
  },
};

export const viewport: Viewport = {
  themeColor: "#080a0c",
};

/**
 * Landing pública de marketing (port de landing-agente-whatsapp.html).
 * Los usuarios con sesión también la ven (llegan por el logo del app shell):
 * por eso el CTA del header cambia según haya sesión o no.
 */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div
      className={`landing-root ${montserrat.variable} ${instrumentSans.variable}`}
    >
      <LandingHeader loggedIn={!!user} />
      <main id="top">
        <HeroSection />
        <IntegrationsStrip />
        <ProblemSection />
        <StatsStrip />
        <HowItWorksSection />
        <FeaturesSection />
        <ShowcaseSection />
        <AgentsSection />
        <DemoSection />
        <IndustriesSection />
        <PricingSection />
        <TestimonialsSection />
        <SecuritySection />
        <FaqSection />
        <ContactSection />
      </main>
      <LandingFooter />
      <WhatsAppFloat />
    </div>
  );
}
