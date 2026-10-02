import { createClient as createSbClient } from "@supabase/supabase-js";

// ──────────────────────────────────────────────────────────────────────────────
// Signup gate — one-click-install bootstrap.
//
// Public self-registration is closed. The ONLY account that can self-register
// is the very first one (the agency super admin). Once any user exists, signup
// is closed and new people must be invited from the agency panel.
// ──────────────────────────────────────────────────────────────────────────────

function admin() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Signup is open only while there are zero users (fresh install).
 * Fails closed: any read error reports signup as closed.
 */
export async function isSignupOpen(): Promise<boolean> {
  const { count, error } = await admin()
    .from("users")
    .select("id", { count: "exact", head: true });

  // Fails closed: an error OR a missing count (e.g. no content-range header
  // in the response) both report signup as closed. `count` only means "zero
  // users" when we can positively confirm it — never by defaulting a null.
  if (error || count === null || count === undefined) return false;
  return count === 0;
}

/**
 * Writes the public.users profile for the bootstrap account and flags it as
 * the agency super admin. Returns false when the claim is lost.
 *
 * There is no handle_new_user trigger — profile rows are written explicitly,
 * so this must UPSERT: a bare UPDATE matches zero rows and leaves the account
 * profile-less while the gate stays open for the next registrant.
 *
 * The gate is re-checked before writing. If another profile landed first
 * (e.g. two concurrent bootstraps) — or the write fails for any reason — the
 * freshly created auth user is deleted so it doesn't linger as an orphan.
 */
export async function claimBootstrapProfile(
  userId: string,
  email: string,
): Promise<boolean> {
  const service = admin();

  if (!(await isSignupOpen())) {
    await service.auth.admin.deleteUser(userId);
    return false;
  }

  const { error } = await service.from("users").upsert(
    {
      id: userId,
      email,
      full_name: email.split("@")[0],
      is_super_admin: true,
    },
    { onConflict: "id" },
  );

  if (error) {
    // Fail closed: roll back the orphaned auth user whatever the cause.
    await service.auth.admin.deleteUser(userId);
    return false;
  }
  return true;
}
