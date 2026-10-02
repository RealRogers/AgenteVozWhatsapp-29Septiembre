"use client";

import { useEffect, useState } from "react";
import { Bot, Send } from "lucide-react";
import { motionClasses } from "@/features/ui-kit/motion";
import { cn } from "@/lib/utils";

type DemoMessage =
  | { from: "in" | "ai"; text: string }
  | { from: "human"; text: string; author: string }
  | { from: "system"; text: string };

const SCRIPT: DemoMessage[] = [
  { from: "in", text: "Hola, ¿tienen cita para mañana?" },
  {
    from: "ai",
    text: "¡Hola Ana! Sí — tengo 10:30 y 16:00 disponibles. ¿Cuál te viene mejor?",
  },
  { from: "in", text: "16:00 por favor" },
  {
    from: "ai",
    text: "Listo, agendada mañana a las 16:00. Te mando recordatorio una hora antes.",
  },
  { from: "system", text: "Carlos · Agente humano tomó el control" },
  {
    from: "human",
    author: "Carlos",
    text: "Hola Ana, soy Carlos. ¿Necesitas algo más para tu cita?",
  },
];

const REVEAL_MS = 1100;
const TYPING_MS = 1600;
const RESTART_MS = 4500;
const FADE_MS = 550;

// Flattened playback timeline: agent messages get a "typing" beat before
// their bubble appears; customer/system beats reveal directly.
type Beat = { kind: "typing" } | { kind: "msg"; index: number };
const TIMELINE: Beat[] = SCRIPT.flatMap((m, i) =>
  m.from === "ai" || m.from === "human"
    ? [{ kind: "typing" as const }, { kind: "msg" as const, index: i }]
    : [{ kind: "msg" as const, index: i }],
);

function AgentChip() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded bg-primary/15 px-1 text-[9px] font-semibold uppercase tracking-wide text-primary">
      <Bot className="h-2.5 w-2.5" aria-hidden="true" />
      IA
    </span>
  );
}

function DemoBubble({ message }: { message: DemoMessage }) {
  if (message.from === "system") {
    return (
      <div
        className={cn(
          "self-center rounded-full bg-muted/40 border border-border/40 px-3 py-1",
          "text-[11px] text-muted-foreground",
          motionClasses.fadeIn,
        )}
      >
        {message.text}
      </div>
    );
  }

  const inbound = message.from === "in";
  return (
    <div
      className={cn(
        "max-w-[80%] rounded-2xl px-3.5 py-2 space-y-1",
        inbound
          ? "self-start bg-muted/50 rounded-tl-sm"
          : "self-end bg-primary/10 border border-primary/30 rounded-tr-sm",
        motionClasses.fadeInUp,
      )}
    >
      {message.from === "ai" && <AgentChip />}
      {message.from === "human" && (
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-foreground/15 text-[8px] font-semibold text-foreground">
            {message.author[0]}
          </span>
          {message.author}
        </span>
      )}
      <p className="text-sm text-foreground leading-relaxed">{message.text}</p>
    </div>
  );
}

function TypingBubble() {
  return (
    <div
      className={cn(
        "self-end flex items-center gap-1 rounded-2xl rounded-tr-sm px-3.5 py-2.5",
        "bg-primary/10 border border-primary/30",
        motionClasses.fadeIn,
      )}
      aria-hidden="true"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-primary/70 motion-safe:animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}

/**
 * Scripted, self-playing WhatsApp-style conversation shown next to the auth
 * card on desktop. Loops: customer asks → the AI (lime) books the slot → a
 * human agent takes over → the thread fades out and starts again.
 * Decorative — the whole panel is aria-hidden.
 *
 * Renders the full script statically when the user prefers reduced motion or
 * the viewport is below lg (the panel is hidden there anyway).
 */
export function AuthChatDemo() {
  // step = timeline beats consumed. Starts at the end (static full render);
  // when animation is allowed it resets to 0 and plays the loop.
  const [step, setStep] = useState(TIMELINE.length);
  const [animated, setAnimated] = useState(false);

  // Animate only on lg+ viewports with motion allowed.
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktop = window.matchMedia("(min-width: 1024px)");
    const update = () => setAnimated(!motion.matches && desktop.matches);
    update();
    motion.addEventListener("change", update);
    desktop.addEventListener("change", update);
    return () => {
      motion.removeEventListener("change", update);
      desktop.removeEventListener("change", update);
    };
  }, []);

  // The loop: reveal messages one by one, dwell on the full conversation,
  // fade the thread out, then restart from an empty (still transparent)
  // container so the cut never reads as a reset.
  useEffect(() => {
    if (!animated) return;
    const beat = TIMELINE[step];
    const delay =
      step === TIMELINE.length
        ? RESTART_MS
        : step > TIMELINE.length
          ? FADE_MS
          : beat.kind === "typing"
            ? TYPING_MS
            : REVEAL_MS;
    const t = setTimeout(
      () => setStep((s) => (s > TIMELINE.length ? 0 : s + 1)),
      delay,
    );
    return () => clearTimeout(t);
  }, [animated, step]);

  // Derived from consumed beats — not state, so no cascading renders.
  const shown = TIMELINE.slice(0, step).flatMap((b) =>
    b.kind === "msg" ? [SCRIPT[b.index]] : [],
  );
  const typing = TIMELINE[step]?.kind === "typing";
  // step past the end = fade-out phase (bubbles still rendered).
  const fading = step > TIMELINE.length;

  return (
    <aside className="relative hidden lg:block" aria-hidden="true">
      {/* Lime halo so the panel reads as glass */}
      <div className="pointer-events-none absolute -inset-10 rounded-full bg-primary/8 blur-[110px]" />

      <div className="glass relative overflow-hidden rounded-2xl shadow-2xl shadow-black/40">
        {/* Fake chat header */}
        <div className="flex items-center gap-3 border-b border-border/50 px-5 py-3.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/60 text-xs font-semibold text-foreground/70">
            AG
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              Ana García
            </p>
            <p className="flex items-center gap-1.5 text-xs text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
              En línea
            </p>
          </div>
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
            IA activa
          </span>
        </div>

        {/* Messages — newest stack upward like a real thread */}
        <div
          className={cn(
            "flex h-[380px] flex-col justify-end gap-3 px-5 py-4",
            "motion-safe:transition-opacity motion-safe:duration-500",
            fading && "opacity-0",
          )}
        >
          {shown.map((m, i) => (
            <DemoBubble key={i} message={m} />
          ))}
          {typing && shown.length < SCRIPT.length && <TypingBubble />}
        </div>

        {/* Fake composer */}
        <div className="flex items-center gap-2 border-t border-border/50 px-5 py-3">
          <div className="flex h-9 flex-1 items-center rounded-full bg-muted/40 px-4 text-xs text-muted-foreground/60">
            Escribe un mensaje…
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-primary">
            <Send className="h-4 w-4" />
          </div>
        </div>
      </div>
    </aside>
  );
}
