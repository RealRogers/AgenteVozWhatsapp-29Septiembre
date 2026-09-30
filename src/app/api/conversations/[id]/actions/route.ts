// Inbox quick actions: close, reopen, archive, unarchive, flag, unflag,
// assign, unassign — one endpoint instead of eight twin routes.
//
// Authorization mirrors the conversations UPDATE policy via
// requireConversationUpdate (admin/manager, or the assigned member) for every
// action except `assign`: assigning is how work gets distributed, so any
// agent may assign a conversation to THEMSELVES (same reach as take), while
// assigning to someone else is an admin/manager call.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  requireConversationUpdate,
  requireWorkspaceMember,
  readJsonBody,
} from "@/lib/auth/workspace-access";
import {
  applyConversationAction,
  ConversationActionError,
} from "@/features/inbox/services/conversation-actions";

const BodySchema = z.object({
  action: z.enum([
    "close",
    "reopen",
    "archive",
    "unarchive",
    "flag",
    "unflag",
    "assign",
    "unassign",
  ]),
  assigneeId: z.string().uuid().optional(),
});

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
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id: conversationId } = await params;

  const json = await readJsonBody(req);
  if (!json.ok) return json.response;
  const parsed = BodySchema.safeParse(json.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Acción inválida" },
      { status: 400 },
    );
  }
  const { action, assigneeId } = parsed.data;

  // 2. Load through RLS — a non-member sees nothing (404).
  const { data: conv, error: convError } = await supabase
    .from("conversations")
    .select("state, workspace_id, assigned_to, archived, priority")
    .eq("id", conversationId)
    .single();

  if (convError || !conv) {
    return NextResponse.json(
      { error: "Conversación no encontrada" },
      { status: 404 },
    );
  }

  const workspaceId = conv.workspace_id as string;

  // 3. Authorize.
  if (action === "assign") {
    const auth = await requireWorkspaceMember(workspaceId, {
      minRole: "agent",
    });
    if (!auth.ok) return auth.response;

    const assigningOther = assigneeId !== auth.userId;
    if (
      assigningOther &&
      auth.role !== "admin" &&
      auth.role !== "manager"
    ) {
      return NextResponse.json(
        { error: "Solo admin o manager pueden asignar a otra persona" },
        { status: 403 },
      );
    }
  } else {
    const auth = await requireConversationUpdate({
      workspace_id: workspaceId,
      assigned_to: conv.assigned_to,
    });
    if (!auth.ok) return auth.response;
  }

  // 4. Apply.
  try {
    await applyConversationAction(
      { conversationId, workspaceId, actorId: user.id },
      action,
      assigneeId,
    );

    return NextResponse.json({ ok: true, action });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/conversations/[id]/actions]:", message);

    if (
      message.startsWith("Invalid transition:") ||
      err instanceof ConversationActionError
    ) {
      return NextResponse.json({ error: message }, { status: 422 });
    }

    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
