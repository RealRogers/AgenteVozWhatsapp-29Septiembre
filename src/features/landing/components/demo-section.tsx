"use client";

import { useCallback, useRef, useState } from "react";
import { DEMO_START_MINUTES, demoPresets } from "../data/scripts";
import { useChatPlayback } from "../hooks/use-chat-playback";
import { useOnView, useOnViewOnce } from "../hooks/use-on-view";
import { ChatFrame } from "./chat-frame";

export function DemoSection() {
  const { play, pause, resume, ...playback } = useChatPlayback(DEMO_START_MINUTES);
  const [selected, setSelected] = useState<number | null>(null);
  // El autoplay inicial es decorativo (aria-live off); una vez que el
  // usuario elige un preset, sus mensajes sí se anuncian (polite).
  const [userDriven, setUserDriven] = useState(false);
  const chatRef = useRef<HTMLDivElement | null>(null);

  const runPreset = useCallback(
    (i: number, userInitiated = false) => {
      setSelected(i);
      if (userInitiated) setUserDriven(true);
      play(demoPresets[i].script);
    },
    [play],
  );

  useOnViewOnce(chatRef, () => runPreset(0));
  useOnView(chatRef, {
    onEnter: () => resume("viewport"),
    onLeave: () => pause("viewport"),
  });

  return (
    <section id="demo">
      <div className="mx-auto max-w-[1120px] px-[22px] py-[84px]">
        <h2>Pruébalo tú mismo</h2>
        <p className="mt-4 max-w-[56ch] text-[var(--lx-mu)]">
          Elige un mensaje de cliente y mira cómo responde el agente.
        </p>
        <div className="mt-9 grid grid-cols-1 items-start gap-9 min-[821px]:grid-cols-[0.8fr_1.2fr]">
          <div className="flex flex-col gap-2.5">
            {demoPresets.map((p, i) => (
              <button
                key={p.question}
                type="button"
                className="lx-qbtn"
                aria-pressed={i === selected}
                onClick={() => runPreset(i, true)}
              >
                {p.question}
              </button>
            ))}
          </div>
          <ChatFrame
            title="Tienda Norte"
            statusText={playback.status}
            switchLabel={playback.aiActive ? "IA activa" : "Humano al mando"}
            switchOff={!playback.aiActive}
            messages={playback.messages}
            typing={playback.typing}
            groupAriaLabel="Demo: conversación de WhatsApp con el agente"
            chatClassName="lx-chat-demo"
            ariaLive={userDriven ? "polite" : "off"}
            chatRef={chatRef}
          />
        </div>
      </div>
    </section>
  );
}
