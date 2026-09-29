import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentConfig, AgentDto, AgentType } from "@/features/agents/types";
import type { PromptGuardrails } from "@/features/inbox/services/prompt-builder";

function firstOrSelf<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

type RawVersion = { body?: string; guardrails?: PromptGuardrails | null };

interface RawAgentRow {
  id: string;
  type: string;
  name: string;
  avatar_key: string;
  model: string | null;
  is_active: boolean;
  prompt_id: string | null;
  config: Record<string, unknown> | null;
  prompt?:
    | { active_version?: RawVersion | RawVersion[] | null }
    | { active_version?: RawVersion | RawVersion[] | null }[]
    | null;
}

/**
 * Lists a workspace's agents with their currently published prompt body.
 * Pass the user-context client (RLS-scoped) or the service client.
 */
export async function listAgents(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<AgentDto[]> {
  const { data, error } = await supabase
    .from("agents")
    .select(
      `id, type, name, avatar_key, model, is_active, prompt_id, config,
       prompt:prompts!prompt_id (
         active_version:prompt_versions!active_version_id ( body, guardrails )
       )`,
    )
    .eq("workspace_id", workspaceId)
    .order("type", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as unknown as RawAgentRow[]).map((row) => {
    const prompt = firstOrSelf(row.prompt);
    const version = firstOrSelf(prompt?.active_version);
    return {
      id: row.id,
      type: row.type as AgentType,
      name: row.name,
      avatarKey: row.avatar_key,
      model: row.model,
      isActive: row.is_active,
      promptId: row.prompt_id,
      promptBody: version?.body ?? "",
      promptGuardrails: version?.guardrails ?? null,
      config: (row.config ?? {}) as AgentConfig,
    };
  });
}
