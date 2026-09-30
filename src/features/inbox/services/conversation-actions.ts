// Inbox quick actions: close / reopen / archive / flag / assign.
//
// State changes (close, reopen) go through applyTransition — the single
// choke point — so the state machine and its event log keep working. The
// field updates (archived, priority, assigned_to) bypass the conversations
// UPDATE RLS policy with the service-role client on purpose: the API route
// already gates on workspace membership + role, and the plain UPDATE policy
// would reject e.g. an agent archiving a conversation not assigned to them.

import { createClient as createSbClient } from "@supabase/supabase-js";
import { applyTransition } from "./decision-engine";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export type ConversationAction =
  | "close"
  | "reopen"
  | "archive"
  | "unarchive"
  | "flag"
  | "unflag"
  | "assign"
  | "unassign";

export class ConversationActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConversationActionError";
  }
}

interface ActionContext {
  conversationId: string;
  workspaceId: string;
  actorId: string;
}

async function updateField(
  ctx: ActionContext,
  action: ConversationAction,
  fields: Record<string, unknown>,
  eventPayload: Record<string, unknown>,
) {
  const supabase = svc();
  const { error } = await supabase
    .from("conversations")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", ctx.conversationId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) {
    throw new Error(`[conversation-actions] update failed: ${error.message}`);
  }

  await supabase.from("events").insert({
    type: "conversation_action",
    level: "info",
    workspace_id: ctx.workspaceId,
    conversation_id: ctx.conversationId,
    payload: { action, actor: ctx.actorId, ...eventPayload },
  });
}

export async function applyConversationAction(
  ctx: ActionContext,
  action: ConversationAction,
  assigneeId?: string,
): Promise<void> {
  switch (action) {
    case "close":
      // applyTransition throws TransitionError when already closed.
      await applyTransition(ctx.conversationId, "closed", {
        userId: ctx.actorId,
        workspaceId: ctx.workspaceId,
        trigger: "operator_close",
      });
      return;

    case "reopen":
      // Reopen lands on human_active with the actor assigned — a human who
      // reopens owns the thread. From there "Devolver a IA" hands it back.
      await applyTransition(ctx.conversationId, "human_active", {
        userId: ctx.actorId,
        workspaceId: ctx.workspaceId,
        trigger: "operator_reopen",
      });
      return;

    case "archive":
      await updateField(ctx, action, { archived: true }, {});
      return;

    case "unarchive":
      await updateField(ctx, action, { archived: false }, {});
      return;

    case "flag":
      await updateField(ctx, action, { priority: "high" }, {});
      return;

    case "unflag":
      await updateField(ctx, action, { priority: "normal" }, {});
      return;

    case "assign": {
      if (!assigneeId) {
        throw new ConversationActionError("assigneeId requerido");
      }
      // The assignee must be an active member of this workspace — otherwise
      // an operator could park a conversation on a user who can't see it.
      const supabase = svc();
      const { data: member } = await supabase
        .from("memberships")
        .select("user_id")
        .eq("workspace_id", ctx.workspaceId)
        .eq("user_id", assigneeId)
        .eq("is_active", true)
        .maybeSingle();

      if (!member) {
        throw new ConversationActionError(
          "El usuario no es miembro activo del workspace",
        );
      }

      await updateField(ctx, action, { assigned_to: assigneeId }, {
        assignee: assigneeId,
      });
      return;
    }

    case "unassign":
      await updateField(ctx, action, { assigned_to: null }, {});
      return;
  }
}
