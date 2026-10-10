"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  VOICE_BAR_HEIGHTS,
  VOICE_BAR_MS,
  clientDelay,
  formatStamp,
  isSwitchEvent,
  switchResult,
  typingDelay,
  type ChatEvent,
  type ChatMessage,
} from "../data/scripts";

export interface RenderedMessage extends ChatMessage {
  id: number;
  /** Sello "HH:MM" visible (ausente en system/day). */
  time?: string;
  /** Barras encendidas de la voice note (0..N). */
  voiceLit?: number;
}

export interface TypingIndicator {
  who: string;
  kind: "ia" | "human";
}

export interface PlaybackState {
  messages: RenderedMessage[];
  typing: TypingIndicator | null;
  status: string;
  aiActive: boolean;
  finished: boolean;
}

const IDLE: PlaybackState = {
  messages: [],
  typing: null,
  status: "en línea",
  aiActive: true,
  finished: false,
};

/** Timeout pendiente: la cadena de reproducción es secuencial, así que hay
 * uno solo en vuelo. `remaining` se descuenta al pausar y se rearma al
 * reanudar. */
interface PendingTimer {
  id: number;
  gen: number;
  f: () => void;
  remaining: number;
  startedAt: number;
}

/** Intervalo pendiente (barras de la voice note). `f` conserva el contador
 * `lit` en su closure, así que pausar/rearmar no pierde el progreso. */
interface PendingInterval {
  id: number;
  ms: number;
  f: () => void;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Motor de reproducción de las conversaciones de la landing.
 * Port del play()/add()/typing()/bars() del HTML a estado React:
 * `play(script)` encadena setTimeout (usa 0ms si el usuario pidió
 * reduced-motion y en ese caso renderiza el guion completo de inmediato).
 *
 * `pause(reason)` / `resume(reason)` congelan la cadena: las razones se
 * acumulan en un Set y la reproducción solo continúa cuando todas se
 * retiran (p.ej. fuera de viewport Y pestaña oculta a la vez). El hook ya
 * pausa solo con `document.hidden`; los consumidores pausan por viewport.
 */
export function useChatPlayback(startMinutes: number) {
  const [state, setState] = useState<PlaybackState>(IDLE);
  const pendingTimerRef = useRef<PendingTimer | null>(null);
  const pendingIntervalRef = useRef<PendingInterval | null>(null);
  const pauseReasonsRef = useRef<Set<string>>(new Set());
  const msgIdRef = useRef(0);
  const genRef = useRef(0);

  const armTimer = useCallback((t: PendingTimer) => {
    t.startedAt = Date.now();
    t.id = window.setTimeout(() => {
      if (pendingTimerRef.current === t) pendingTimerRef.current = null;
      if (genRef.current === t.gen) t.f();
    }, Math.max(0, t.remaining));
  }, []);

  const pause = useCallback((reason: string) => {
    const reasons = pauseReasonsRef.current;
    if (reasons.has(reason)) return;
    reasons.add(reason);
    if (reasons.size > 1) return; // ya estaba pausado por otro motivo
    const t = pendingTimerRef.current;
    if (t) {
      window.clearTimeout(t.id);
      t.remaining -= Date.now() - t.startedAt;
    }
    const iv = pendingIntervalRef.current;
    if (iv) window.clearInterval(iv.id);
  }, []);

  const resume = useCallback(
    (reason: string) => {
      const reasons = pauseReasonsRef.current;
      if (!reasons.delete(reason) || reasons.size > 0) return;
      const t = pendingTimerRef.current;
      if (t) armTimer(t);
      const iv = pendingIntervalRef.current;
      if (iv) iv.id = window.setInterval(iv.f, iv.ms);
    },
    [armTimer],
  );

  const clearAll = useCallback(() => {
    const t = pendingTimerRef.current;
    if (t) window.clearTimeout(t.id);
    const iv = pendingIntervalRef.current;
    if (iv) window.clearInterval(iv.id);
    pendingTimerRef.current = null;
    pendingIntervalRef.current = null;
  }, []);

  useEffect(() => clearAll, [clearAll]);

  // La cadena no corre con la pestaña oculta.
  useEffect(() => {
    const onVisibility = () =>
      document.hidden ? pause("hidden") : resume("hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [pause, resume]);

  /** Pausa/reanuda la reproducción como lo haría el handoff real: cuando el
   * humano toma el chat la IA deja de responder (la cadena se congela), y al
   * reactivarla continúa donde quedó. Deja la nota system en el hilo. */
  const setAiActive = useCallback(
    (next: boolean) => {
      if (next) resume("switch");
      else pause("switch");
      setState((s) => {
        if (s.aiActive === next) return s;
        const { notice } = switchResult(s.aiActive ? "ia" : "human");
        return {
          ...s,
          aiActive: next,
          // Si el humano toma el chat a media escritura, la IA deja de teclear
          // de inmediato — no dejamos un "escribiendo…" congelado.
          ...(next ? {} : { typing: null, status: "en línea" }),
          messages: [
            ...s.messages,
            { id: ++msgIdRef.current, kind: "system", text: notice },
          ],
        };
      });
    },
    [pause, resume],
  );

  const play = useCallback(
    (script: ChatEvent[], onDone?: () => void) => {
      clearAll();
      // Una corrida nueva arranca con la IA al mando: una pausa por switch de
      // la corrida anterior no debe congelar esta.
      pauseReasonsRef.current.delete("switch");
      const gen = ++genRef.current;
      let clock = startMinutes;
      const nextId = () => ++msgIdRef.current;

      const pushMsg = (m: ChatMessage): number => {
        const id = nextId();
        const time =
          m.kind === "system" || m.kind === "day"
            ? undefined
            : formatStamp(clock++);
        setState((s) => ({ ...s, messages: [...s.messages, { ...m, id, time }] }));
        return id;
      };

      const setVoiceLit = (id: number, lit: number) =>
        setState((s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m.id === id ? { ...m, voiceLit: lit } : m,
          ),
        }));

      if (prefersReducedMotion()) {
        // Sin animaciones: estado final completo, al instante.
        let aiActive = true;
        const messages: RenderedMessage[] = [
          { id: nextId(), kind: "day", text: "Hoy" },
        ];
        for (const e of script) {
          if (isSwitchEvent(e)) {
            aiActive = e.switch === "on";
            continue;
          }
          messages.push({
            ...e,
            id: nextId(),
            time:
              e.kind === "system" || e.kind === "day"
                ? undefined
                : formatStamp(clock++),
            voiceLit: e.voice ? VOICE_BAR_HEIGHTS.length : undefined,
          });
        }
        setState({ messages, typing: null, status: "en línea", aiActive, finished: true });
        onDone?.();
        return;
      }

      setState({
        messages: [{ id: nextId(), kind: "day", text: "Hoy" }],
        typing: null,
        status: "en línea",
        aiActive: true,
        finished: false,
      });

      const later = (ms: number, f: () => void) => {
        const prev = pendingTimerRef.current;
        if (prev) window.clearTimeout(prev.id);
        const t: PendingTimer = { id: 0, gen, f, remaining: ms, startedAt: 0 };
        pendingTimerRef.current = t;
        // Si está pausado el timer queda registrado pero sin armar;
        // resume() lo activa con el `remaining` intacto.
        if (pauseReasonsRef.current.size === 0) armTimer(t);
      };

      const stopInterval = () => {
        const slot = pendingIntervalRef.current;
        if (slot) window.clearInterval(slot.id);
        pendingIntervalRef.current = null;
      };

      const startInterval = (ms: number, f: () => void) => {
        const slot: PendingInterval = { id: 0, ms, f };
        pendingIntervalRef.current = slot;
        if (pauseReasonsRef.current.size === 0) {
          slot.id = window.setInterval(f, ms);
        }
      };

      let i = 0;
      const next = (): void => {
        if (i >= script.length) {
          setState((s) => ({ ...s, status: "en línea", finished: true }));
          onDone?.();
          return;
        }
        const event = script[i++];

        if (isSwitchEvent(event)) {
          setState((s) => ({ ...s, aiActive: event.switch === "on" }));
          later(500, next);
          return;
        }

        if (event.kind === "system" || event.kind === "day") {
          if (event.transcribe) {
            const tid = pushMsg({ kind: "system", text: "Transcribiendo…" });
            later(900, () => {
              setState((s) => ({
                ...s,
                messages: s.messages.map((m) =>
                  m.id === tid ? { ...m, text: event.text } : m,
                ),
              }));
              later(600, next);
            });
          } else {
            pushMsg(event);
            later(600, next);
          }
          return;
        }

        if (event.kind === "client") {
          setState((s) => ({ ...s, status: "escribiendo…" }));
          later(clientDelay(event), () => {
            setState((s) => ({ ...s, status: "en línea" }));
            const id = pushMsg(event);
            if (event.voice) {
              let lit = 0;
              startInterval(VOICE_BAR_MS, () => {
                if (genRef.current !== gen) {
                  stopInterval();
                  return;
                }
                lit += 1;
                if (lit >= VOICE_BAR_HEIGHTS.length) {
                  setVoiceLit(id, VOICE_BAR_HEIGHTS.length);
                  stopInterval();
                  later(400, next);
                } else {
                  setVoiceLit(id, lit);
                }
              });
            } else {
              later(600, next);
            }
          });
          return;
        }

        // ia / human: indicador "escribiendo" antes de la burbuja.
        if (event.kind !== "ia" && event.kind !== "human") return; // exhaustivo
        const typing: TypingIndicator = { who: event.who ?? "IA", kind: event.kind };
        setState((s) => ({ ...s, typing }));
        later(typingDelay(event), () => {
          setState((s) => ({ ...s, typing: null }));
          pushMsg(event);
          later(700, next);
        });
      };
      next();
    },
    [startMinutes, clearAll, armTimer],
  );

  return { ...state, play, pause, resume, setAiActive };
}
