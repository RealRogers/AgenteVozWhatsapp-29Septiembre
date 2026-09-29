import { createClient as svcClient } from "@supabase/supabase-js";
import type {
  ActiveAgent,
  AgentConfig,
  AgentType,
} from "@/features/agents/types";

/**
 * Returns the workspace's single active agent (model + prompt source of truth),
 * or null when none is active. Uses the service role — called from the runtime
 * (server-side, no user context). Fully back-compatible: callers fall back to
 * integrations.config.model + the global prompt when this returns null.
 */
export async function getActiveAgent(
  workspaceId: string,
): Promise<ActiveAgent | null> {
  try {
    const db = svcClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data } = await db
      .from("agents")
      .select("id, type, name, avatar_key, model, prompt_id, config")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .maybeSingle();

    if (!data) return null;

    return {
      id: data.id as string,
      type: data.type as AgentType,
      name: data.name as string,
      avatarKey: (data.avatar_key as string) ?? "default",
      model: (data.model as string | null) ?? null,
      promptId: (data.prompt_id as string | null) ?? null,
      config: (data.config ?? {}) as AgentConfig,
    };
  } catch {
    return null;
  }
}
