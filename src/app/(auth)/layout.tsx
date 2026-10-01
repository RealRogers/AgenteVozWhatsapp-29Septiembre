import type { ReactNode } from "react";
import Link from "next/link";
import { MessageSquareText } from "lucide-react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center bg-background px-4 py-12 overflow-hidden selection:bg-primary/20 selection:text-primary">
      {/* 1. Malla de fondo técnica con máscara radial */}
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,oklch(var(--border)/0.2)_1px,transparent_1px),linear-gradient(to_bottom,oklch(var(--border)/0.2)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-40"
        aria-hidden="true"
      />

      {/* 2. Resplandores ambientales estratégicos (Glow Lime & Deep Blue) */}
      <div
        className="pointer-events-none absolute top-1/4 -left-32 h-96 w-96 rounded-full bg-primary/10 blur-[128px]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute bottom-1/4 -right-32 h-96 w-96 rounded-full bg-info/10 blur-[128px]"
        aria-hidden="true"
      />

      {/* 3. Contenedor principal */}
      <main className="relative z-10 w-full max-w-md flex flex-col items-center">
        {/* Logo / Badge de la plataforma */}
        <Link
          href="/"
          className="group mb-8 inline-flex items-center gap-2.5 rounded-full border border-border/60 bg-card/40 px-4 py-1.5 backdrop-blur-md transition-colors hover:border-primary/40 hover:bg-card/60"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary">
            <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
          </div>
          <span className="font-display text-sm font-medium tracking-tight text-foreground">
            Agente <span className="text-primary font-semibold">WhatsApp</span>
          </span>
        </Link>

        {children}

        {/* Footer legal discreto */}
        <p className="mt-8 text-center text-xs text-muted-foreground/80 font-body">
          Plataforma Inbox Conversacional con IA · Cumplimiento Meta 24h
        </p>
      </main>
    </div>
  );
}
