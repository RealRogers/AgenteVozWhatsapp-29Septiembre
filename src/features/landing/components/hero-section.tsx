"use client";

import { useCallback, useRef } from "react";
import { HERO_START_MINUTES, heroScript } from "../data/scripts";
import { useChatPlayback } from "../hooks/use-chat-playback";
import { useOnViewOnce } from "../hooks/use-on-view";
import { ChatFrame } from "./chat-frame";

export function HeroSection() {
  const { play, ...playback } = useChatPlayback(HERO_START_MINUTES);
  const chatRef = useRef<HTMLDivElement | null>(null);

  const run = useCallback(() => play(heroScript), [play]);
  useOnViewOnce(chatRef, run);

  return (
    <section className="lx-hero pt-16 pb-20">
      <div className="mx-auto grid max-w-[1120px] grid-cols-1 items-center gap-12 px-[22px] min-[901px]:grid-cols-[1.05fr_0.95fr] relative z-[1]">
        <div>
          <h1>Tu WhatsApp atendido 24/7. Tú entras cuando quieras.</h1>
          <p className="mt-4 max-w-[56ch] text-[1.15rem] text-[var(--lx-mu)]">
            La IA responde, agenda citas y guarda leads sola. Cuando un cliente
            necesita a una persona, tu equipo toma el chat con un clic.
          </p>
          <div className="mt-[30px] flex flex-wrap gap-3">
            <a className="lx-btn lx-btn-p" href="#contacto">
              Probar gratis
            </a>
            <a className="lx-btn" href="#demo">
              Ver cómo funciona
            </a>
          </div>
          <p className="mt-3.5 text-[0.88rem] text-[var(--lx-mu)]">
            Sin tarjeta. Conecta tu número en minutos.
          </p>
        </div>

        <div className="flex flex-col items-center gap-2.5">
          <ChatFrame
            title="Clínica Dental Sol"
            statusText={playback.status}
            switchLabel={playback.aiActive ? "IA activa" : "Humano al mando"}
            switchOff={!playback.aiActive}
            messages={playback.messages}
            typing={playback.typing}
            groupAriaLabel="Ejemplo de conversación de WhatsApp entre un cliente, la IA y una persona"
            shellClassName="w-full"
            chatRef={chatRef}
          />
          <button
            className="lx-replay"
            type="button"
            onClick={run}
            style={{ visibility: playback.finished ? "visible" : "hidden" }}
          >
            Ver de nuevo
          </button>
        </div>
      </div>
    </section>
  );
}
