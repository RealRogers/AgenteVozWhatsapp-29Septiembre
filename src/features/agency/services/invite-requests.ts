import { createClient as svcClient } from "@supabase/supabase-js";

// ──────────────────────────────────────────────────────────────────────────────
// Invite requests — service-role reads/writes for the agency panel.
// The table has RLS with no policies; only these service-role calls touch it.
// ──────────────────────────────────────────────────────────────────────────────

function svc() {
  return svcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface InviteRequest {
  id: string;
  name: string;
  email: string;
  note: string | null;
  status: "pending" | "approved" | "dismissed";
  handled_at: string | null;
  created_at: string;
}

/** Pending first, newest first — the review order the super admin expects. */
export async function listInviteRequests(): Promise<{
  requests?: InviteRequest[];
  error?: string;
}> {
  const { data, error } = await svc()
    .from("invite_requests")
    .select("id, name, email, note, status, handled_at, created_at")
    .order("status", { ascending: false }) // 'pending' > 'dismissed' > 'approved'
    .order("created_at", { ascending: false });

  if (error) return { error: error.message };
  return { requests: (data ?? []) as InviteRequest[] };
}

export async function updateInviteRequestStatus(
  id: string,
  status: "approved" | "dismissed",
): Promise<{ error?: string; conflict?: boolean }> {
  const { data, error } = await svc()
    .from("invite_requests")
    .update({
      status,
      handled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending") // never re-open or re-handle a closed request
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return {
      error: "La solicitud ya fue procesada o no existe",
      conflict: true,
    };
  }
  return {};
}
