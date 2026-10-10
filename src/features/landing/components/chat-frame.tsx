"use client";

import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import { VOICE_BAR_HEIGHTS } from "../data/scripts";
import type { RenderedMessage, TypingIndicator } from "../hooks/use-chat-playback";

function Ticks() {
  return (
    <svg
      className="lx-ticks"
      viewBox="0 0 16 11"
      width="16"
      height="11"
      aria-hidden="true"
    >
      <path
        d="M1 5.5l3 3L10.5 2M6 8.5l1 1L13.5 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function VoiceNote({ duration, lit }: { duration: string; lit: number }) {
  return (
    <div className="lx-voice" role="img" aria-label={`Nota de voz de ${duration}`}>
      <span className="lx-vplay" aria-hidden="true">
        <svg viewBox="0 0 10 12" width="10" height="12">
          <path d="M1 1l8 5-8 5z" fill="currentColor" />
        </svg>
      </span>
      <span className="lx-wave" aria-hidden="true">
        {VOICE_BAR_HEIGHTS.map((h, i) => (
          <b
            key={i}
            style={{ height: `${h}%` }}
            className={i < lit ? "on" : undefined}
          />
        ))}
      </span>
      <span className="lx-dur">{duration}</span>
    </div>
  );
}

function MessageBubble({ m }: { m: RenderedMessage }) {
  if (m.kind === "system") {
    return <div className="lx-msg lx-msg-sys">{m.text}</div>;
  }
  if (m.kind === "day") {
    return <div className="lx-msg lx-msg-day">{m.text}</div>;
  }
  return (
    <div className={`lx-msg lx-msg-${m.kind}`}>
      {m.who && <em className="lx-msg-who">{m.who}</em>}
      {m.voice ? <VoiceNote duration={m.text} lit={m.voiceLit ?? 0} /> : m.text}
      <span className="lx-meta">
        {m.time}
        {m.kind !== "client" && <Ticks />}
      </span>
    </div>
  );
}

export interface ChatFrameProps {
  title: string;
  statusText: string;
  switchLabel: string;
  /** true = switch en posición "apagado" (IA inactiva). */
  switchOff: boolean;
  /** Si se pasa, el switch es un botón role="switch" interactivo. */
  onToggleSwitch?: () => void;
  /** Botón de volver (inbox); enfocado al abrir la conversación. */
  onBack?: () => void;
  backRef?: RefObject<HTMLButtonElement | null>;
  messages: RenderedMessage[];
  typing?: TypingIndicator | null;
  groupAriaLabel: string;
  /** Clase extra del área de chat: altura demo (340px) / inbox (300px). */
  chatClassName?: string;
  /** Clase extra del shell (p.ej. min-height del inbox). */
  shellClassName?: string;
  ariaLive?: "off" | "polite";
  /** Ref externa (IntersectionObserver de autostart). */
  chatRef?: RefObject<HTMLDivElement | null>;
}

export function ChatFrame({
  title,
  statusText,
  switchLabel,
  switchOff,
  onToggleSwitch,
  onBack,
  backRef,
  messages,
  typing = null,
  groupAriaLabel,
  chatClassName,
  shellClassName,
  ariaLive = "off",
  chatRef,
}: ChatFrameProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const didScrollRef = useRef(false);

  // El chat siempre muestra lo último, como el scrollTop del HTML original.
  // El primer render baja de golpe (abrir conversación); los mensajes que
  // llegan después bajan con scroll suave. Con reduced-motion el motor
  // renderiza todo de una vez, así que siempre cae en el caso instantáneo.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const instant =
      !didScrollRef.current ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: instant ? "instant" : "smooth",
    });
    didScrollRef.current = true;
  }, [messages, typing]);

  return (
    <div
      className={shellClassName ? `lx-phone ${shellClassName}` : "lx-phone"}
      role="group"
      aria-label={groupAriaLabel}
    >
      <div className="lx-ph">
        <div className={onBack ? "flex items-center gap-2" : undefined}>
          {onBack && (
            <button
              ref={backRef}
              type="button"
              className="lx-back"
              aria-label="Volver a conversaciones"
              onClick={onBack}
            >
              ←
            </button>
          )}
          <div>
            <b>{title}</b>
            <small>{statusText}</small>
          </div>
        </div>
        {onToggleSwitch ? (
          <button
            type="button"
            className="lx-switch"
            role="switch"
            aria-checked={!switchOff}
            aria-label={switchLabel}
            data-off={switchOff || undefined}
            onClick={onToggleSwitch}
          >
            <span></span>
            <i className="lx-switch-label">{switchLabel}</i>
          </button>
        ) : (
          <div className="lx-switch" data-off={switchOff || undefined}>
            <span></span>
            <i className="lx-switch-label">{switchLabel}</i>
          </div>
        )}
      </div>

      <div
        className={chatClassName ? `lx-chat ${chatClassName}` : "lx-chat"}
        aria-live={ariaLive}
        ref={(el) => {
          scrollRef.current = el;
          if (chatRef) chatRef.current = el;
        }}
      >
        {messages.map((m) => (
          <MessageBubble key={m.id} m={m} />
        ))}
        {typing && (
          <div
            className={`lx-msg lx-msg-${typing.kind} lx-typing`}
            aria-hidden="true"
          >
            <em>{typing.who} escribiendo</em>
            <i />
            <i />
            <i />
          </div>
        )}
      </div>

      <div className="lx-composer" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9.5h.01M15 9.5h.01" />
        </svg>
        <span className="lx-composer-input">Escribe un mensaje</span>
        <span className="lx-composer-mic">
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0014 0M12 18v3" />
          </svg>
        </span>
      </div>
    </div>
  );
}
