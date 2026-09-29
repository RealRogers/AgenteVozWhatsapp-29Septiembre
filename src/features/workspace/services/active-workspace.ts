import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

export const ACTIVE_WORKSPACE_COOKIE = "active_workspace_id";

export type MembershipRow = { workspace_id: string; role: string };
export type ActiveWorkspace = { workspace_id: string; role: string };

/**
 * Resolves the user's active workspace context.
 *
 * Picks the cookie-selected workspace when the user is an active member of it,
 * otherwise falls back to the first active membership. Returns null when the
 * user has no active membership (caller decides where to send them).
 *
 * Drop-in replacement for the old `.limit(1).single()` membership gate.
 */
export async function getActiveWorkspace(
  supabase: SupabaseClient,
  userId: string,
): Promise<ActiveWorkspace | null> {
  const { data: memberships } = await supabase
    .from("memberships")
    .select("workspace_id, role")
    .eq("user_id", userId)
    .eq("is_active", true);

  const rows = (memberships ?? []) as MembershipRow[];
  if (rows.length === 0) return null;

  const selected = (await cookies()).get(ACTIVE_WORKSPACE_COOKIE)?.value;
  const match = selected
    ? rows.find((m) => m.workspace_id === selected)
    : undefined;

  const chosen = match ?? rows[0];
  return { workspace_id: chosen.workspace_id, role: chosen.role };
}

/** Lists the user's active memberships with workspace names — for the switcher. */
export async function listMemberships(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ workspace_id: string; role: string; name: string }[]> {
  const { data } = await supabase
    .from("memberships")
    .select("workspace_id, role, workspaces(name)")
    .eq("user_id", userId)
    .eq("is_active", true);

  return ((data ?? []) as unknown[]).map((row) => {
    const r = row as {
      workspace_id: string;
      role: string;
      workspaces: { name?: string } | null;
    };
    return {
      workspace_id: r.workspace_id,
      role: r.role,
      name: r.workspaces?.name ?? "Workspace",
    };
  });
}
