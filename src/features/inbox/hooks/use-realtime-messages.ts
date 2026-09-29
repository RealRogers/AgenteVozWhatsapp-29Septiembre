"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { MessageRow } from "@/features/inbox/types";

export function useRealtimeMessages(
  conversationId: string,
  initial: MessageRow[],
): MessageRow[] {
  const [messages, setMessages] = useState<MessageRow[]>(initial);
  const seenIds = useRef(new Set(initial.map((m) => m.id)));

  useEffect(() => {
    seenIds.current = new Set(initial.map((m) => m.id));
    // Sync messages when server re-fetches initial data
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages(initial);
  }, [initial]);

  useEffect(() => {
    const supabase = createClient();

    const channel: RealtimeChannel = supabase
      .channel(`inbox:conversation:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as MessageRow;
          if (seenIds.current.has(row.id)) return;
          seenIds.current.add(row.id);
          setMessages((prev) =>
            [...prev, row].sort(
              (a, b) =>
                new Date(a.created_at).getTime() -
                new Date(b.created_at).getTime(),
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          // Media downloads patch messages.meta (storage_path) and status
          // updates land here — without this the attachment stays on
          // "Descargando archivo…" until a manual reload.
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as MessageRow;
          setMessages((prev) =>
            prev.map((m) => (m.id === row.id ? { ...m, ...row } : m)),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  return messages;
}
