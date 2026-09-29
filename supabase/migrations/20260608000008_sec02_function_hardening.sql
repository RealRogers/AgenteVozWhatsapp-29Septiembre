-- SEC-02 cierre: harden SECURITY DEFINER functions
-- Fixes: function_search_path_mutable + anon_security_definer_function_executable

-- Fix function_search_path_mutable warnings
ALTER FUNCTION public.update_updated_at() SET search_path = '';
ALTER FUNCTION public.auth_workspace_ids() SET search_path = '';
ALTER FUNCTION public.auth_has_role(uuid, public.workspace_role[]) SET search_path = '';

-- Revoke anon+authenticated execute from internal worker functions
-- (these are called server-side via service_role only — never by end users)
REVOKE EXECUTE ON FUNCTION public.cancel_batch(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_next_batch() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_outbound_24h_window() FROM anon;
-- NOTE: there is no handle_new_user() function/trigger in this schema —
-- public.users rows are created explicitly (seed + agency actions), not by a
-- signup trigger. The previous REVOKE on it errored a clean db push; removed.

-- Revoke anon from RLS helpers
-- (authenticated users still invoke them implicitly via RLS policy evaluation)
REVOKE EXECUTE ON FUNCTION public.auth_workspace_ids() FROM anon;
REVOKE EXECUTE ON FUNCTION public.auth_has_role(uuid, public.workspace_role[]) FROM anon;
