"use client";

import { useEffect, useRef, useState } from "react";
import {
  conversations,
  lastMessagePreview,
  renderConversationMessages,
  responderMeta,
  switchLabel,
  switchResult,
  type Conversation,
} from "../data/scripts";
import type { RenderedMessage } from "../hooks/use-chat-playback";
import { ChatFrame } from "./chat-frame";

function ConversationRow({
  convo,
  onOpen,
  rowRef,
}: {
  convo: Conversation;
  onOpen: () => void;
  rowRef: (el: HTMLButtonElement | null) => void;
}) {
  const meta = responderMeta[convo.responder];
  const aria = `${convo.name}. ${
    convo.unread ? `${convo.unread} sin leer. ` : ""
  }Responde: ${meta.label}. Abrir conversación`;
  return (
    <button
      ref={rowRef}
      type="button"
      className="lx-row"
      aria-label={aria}
      onClick={onOpen}
    >
      <span className="lx-avatar" aria-hidden="true">
        {convo.name.charAt(0)}
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-[0.95rem] font-semibold">
          {convo.name}
        </strong>
        <small className="block overflow-hidden text-ellipsis whitespace-nowrap text-[var(--lx-mu)]">
          {lastMessagePreview(convo)}
        </small>
      </span>
      <span className="flex flex-none flex-col items-end gap-1.5">
        <time className="text-[0.72rem] text-[var(--lx-mu)]">{convo.time}</time>
        <span className="flex items-center gap-1.5">
          {convo.unread > 0 && (
            <span className="lx-unread" aria-hidden="true">
              {convo.unread}
            </span>
          )}
          <span className={meta.className}>{meta.label}</span>
        </span>
      </span>
    </button>
  );
}

export function ShowcaseSection() {
  const [convos, setConvos] = useState(conversations);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const backRef = useRef<HTMLButtonElement | null>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const prevOpenRef = useRef<number | null>(null);

  const openConvo = (i: number) => {
    setConvos((cs) => cs.map((c, j) => (j === i ? { ...c, unread: 0 } : c)));
    setOpenIdx(i);
  };

  // Manejo de foco como en el HTML original: al abrir → botón "volver";
  // al cerrar → la fila de la conversación (post-render, el listado ya existe).
  useEffect(() => {
    if (openIdx !== null) {
      backRef.current?.focus();
    } else if (prevOpenRef.current !== null) {
      rowRefs.current[prevOpenRef.current]?.focus();
    }
    prevOpenRef.current = openIdx;
  }, [openIdx]);

  const closeConvo = () => setOpenIdx(null);

  const toggleSwitch = () => {
    if (openIdx === null) return;
    setConvos((cs) =>
      cs.map((c, j) => {
        if (j !== openIdx) return c;
        const { to, notice } = switchResult(c.responder);
        return {
          ...c,
          responder: to,
          messages: [...c.messages, { kind: "system", text: notice }],
        };
      }),
    );
  };

  const openConvoData = openIdx !== null ? convos[openIdx] : null;
  const openMessages: RenderedMessage[] = openConvoData
    ? renderConversationMessages(openConvoData)
    : [];

  return (
    <section className="pb-[84px]">
      <div className="mx-auto grid max-w-[1120px] items-center gap-14 px-[22px] min-[861px]:grid-cols-[0.95fr_1.05fr]">
        <div className="max-[860px]:order-2">
          {openConvoData === null ? (
            <div className="lx-phone min-h-[430px]">
              <div className="lx-ibh">Conversaciones</div>
              <div>
                {convos.map((c, i) => (
                  <ConversationRow
                    key={c.name}
                    convo={c}
                    onOpen={() => openConvo(i)}
                    rowRef={(el) => {
                      rowRefs.current[i] = el;
                    }}
                  />
                ))}
              </div>
            </div>
          ) : (
            <ChatFrame
              title={openConvoData.name}
              statusText="en línea"
              switchLabel={switchLabel[openConvoData.responder]}
              switchOff={openConvoData.responder !== "ia"}
              onToggleSwitch={toggleSwitch}
              onBack={closeConvo}
              backRef={backRef}
              messages={openMessages}
              groupAriaLabel={`Conversación con ${openConvoData.name}`}
              chatClassName="lx-chat-inbox"
              shellClassName="min-h-[430px]"
            />
          )}
        </div>

        <div className="max-[860px]:order-1">
          <h2>Tú decides quién responde</h2>
          <p className="mt-4 max-w-[56ch] text-[var(--lx-mu)]">
            Mira todas las conversaciones en una lista y cambia entre IA y
            persona cuando quieras. Prueba: haz clic en una conversación.
          </p>
          <ul className="mt-[22px] list-none p-0">
            <li className="border-t border-[var(--lx-ln)] py-3.5 text-[var(--lx-mu)]">
              <b className="font-semibold text-[var(--lx-tx)]">
                Prende o apaga la IA
              </b>{" "}
              por conversación, sin afectar a las demás.
            </li>
            <li className="border-t border-[var(--lx-ln)] py-3.5 text-[var(--lx-mu)]">
              <b className="font-semibold text-[var(--lx-tx)]">
                Recibe un aviso
              </b>{" "}
              cuando un cliente pide hablar con una persona.
            </li>
            <li className="border-t border-[var(--lx-ln)] py-3.5 text-[var(--lx-mu)]">
              <b className="font-semibold text-[var(--lx-tx)]">
                Un solo historial:
              </b>{" "}
              lo que dijo la IA y lo que dijo tu equipo, en el mismo chat.
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
