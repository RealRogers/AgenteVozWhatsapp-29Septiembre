// Human agent sends an image / audio / video / document from the inbox
// composer. The browser uploaded the file straight to whatsapp-media (RLS:
// workspace_member_write_media); this route only signs + dispatches, so no
// file bytes cross the function (Vercel's request-body limit).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { dispatchMedia } from "@/features/inbox/services/dispatch";
import { applyTransition } from "@/features/inbox/services/decision-engine";
import { getActiveAgent } from "@/features/agents/services/active-agent";
import { readJsonBody, requireWorkspaceMember } from "@/lib/auth/workspace-access";
import { WHATSAPP_MEDIA_TYPES } from "@/features/inbox/services/whatsapp-provider";

const UUID =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
// <workspaceId>/<conversationId>/<file> — the shape the composer uploads and
// media-handler writes. Ownership is re-checked against the row below.
const STORAGE_PATH = new RegExp(`^(${UUID})/(${UUID})/[A-Za-z0-9._-]+$`);

const BodySchema = z.object({
  storagePath: z.string().min(1).max(512).regex(STORAGE_PATH),
  mediaType: z.enum(WHATSAPP_MEDIA_TYPES),
  mimeType: z.string().min(3).max(255),
  /** Meta caps captions at 1024 chars. Audio sends none. */
  caption: z.string().max(1024).optional(),
  filename: z.string().min(1).max(255).optional(),
  sizeBytes: z.number().int().positive().max(52_428_800).optional(),
});

/** The MIME prefix must agree with the declared kind — a "document" pointing
 *  at image/png would render as a broken image downstream. */
const MIME_PREFIX: Record<string, string> = {
  image: "image/",
  audio: "audio/",
  video: "video/",
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 1. Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: conversationId } = await params;

  // 2. Validate request body
  const parsed_body = await readJsonBody(req);
  if (!parsed_body.ok) return parsed_body.response;
  const parsed = BodySchema.safeParse(parsed_body.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { storagePath, mediaType, mimeType, caption, filename, sizeBytes } =
    parsed.data;

  const prefix = MIME_PREFIX[mediaType];
  if (prefix && !mimeType.toLowerCase().startsWith(prefix)) {
    return NextResponse.json(
      { error: "El tipo de archivo no coincide con el adjunto" },
      { status: 400 },
    );
  }

  // 3. Load conversation to get workspace_id
  const { data: conv } = await supabase
    .from("conversations")
    .select("workspace_id, ai_enabled")
    .eq("id", conversationId)
    .single();

  if (!conv) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 3b. The path must name THIS workspace and conversation — a member could
  // otherwise point dispatch at a file uploaded under another thread (RLS
  // already stops foreign workspaces, but the check is cheap and explicit).
  const [pathWorkspace, pathConversation] = storagePath.split("/");
  if (
    pathWorkspace !== conv.workspace_id ||
    pathConversation !== conversationId
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 3c. Role gate — same as the text route: dispatch runs as service role.
  const auth = await requireWorkspaceMember(conv.workspace_id as string, {
    minRole: "agent",
  });
  if (!auth.ok) return auth.response;

  // 4. Dispatch via the single exit point
  const result = await dispatchMedia({
    workspaceId: conv.workspace_id,
    conversationId,
    mediaType,
    storagePath,
    mimeType,
    caption,
    filename,
    sizeBytes,
    senderUserId: user.id,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.errorCode },
      { status: 422 },
    );
  }

  // Sleep the bot when a human intervenes — same rule as the text send.
  if (conv.ai_enabled) {
    try {
      const activeAgent = await getActiveAgent(conv.workspace_id);
      const sleepOnManual = activeAgent?.config.sleepOnManualMessage !== false;
      if (sleepOnManual) {
        await applyTransition(conversationId, "human_active", {
          userId: user.id,
          workspaceId: conv.workspace_id as string,
        });
      }
    } catch (e) {
      console.warn(
        "[media] sleep-on-manual skipped:",
        e instanceof Error ? e.message : e,
      );
    }
  }

  return NextResponse.json({ ok: true, wamid: result.wamid });
}
