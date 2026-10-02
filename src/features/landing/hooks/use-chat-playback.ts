"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  VOICE_BAR_HEIGHTS,
  VOICE_BAR_MS,
  clientDelay,
  formatStamp,
  isSwitchEvent,
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
 */
export function useChatPlayback(startMinutes: number) {
  const [state, setState] = useState<PlaybackState>(IDLE);
  const timersRef = useRef<number[]>([]);
  const intervalsRef = useRef<number[]>([]);
  const msgIdRef = useRef(0);
  const genRef = useRef(0);

  const clearAll = useCallback(() => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    intervalsRef.current.forEach((i) => window.clearInterval(i));
    timersRef.current = [];
    intervalsRef.current = [];
  }, []);

  useEffect(() => clearAll, [clearAll]);

  const play = useCallback(
    (script: ChatEvent[], onDone?: () => void) => {
      clearAll();
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
        const id = window.setTimeout(() => {
          if (genRef.current === gen) f();
        }, ms);
        timersRef.current.push(id);
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
              const iv = window.setInterval(() => {
                if (genRef.current !== gen) {
                  window.clearInterval(iv);
                  return;
                }
                lit += 1;
                if (lit >= VOICE_BAR_HEIGHTS.length) {
                  setVoiceLit(id, VOICE_BAR_HEIGHTS.length);
                  window.clearInterval(iv);
                  later(400, next);
                } else {
                  setVoiceLit(id, lit);
                }
              }, VOICE_BAR_MS);
              intervalsRef.current.push(iv);
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
    [startMinutes, clearAll],
  );

  return { ...state, play };
}
