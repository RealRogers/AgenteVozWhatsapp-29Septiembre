-- ============================================================
-- Migration: 20260609000001_super_admin
-- Agente WhatsApp — Super admin flag + onboarding policies
-- ============================================================

-- Add is_super_admin flag to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Helper function: check if current user is super admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT is_super_admin FROM public.users WHERE id = auth.uid()),
    FALSE
  );
$$;

-- Super admins can see ALL workspaces (bypass the normal membership filter)
DROP POLICY IF EXISTS "workspaces_select_members" ON public.workspaces;
CREATE POLICY "workspaces_select_members" ON public.workspaces
  FOR SELECT USING (
    id IN (SELECT auth_workspace_ids())
    OR public.is_super_admin()
  );

-- Super admins can see ALL memberships
DROP POLICY IF EXISTS "memberships_select_members" ON public.memberships;
CREATE POLICY "memberships_select_members" ON public.memberships
  FOR SELECT USING (
    workspace_id IN (SELECT auth_workspace_ids())
    OR public.is_super_admin()
  );

-- Super admins can INSERT new workspaces (for creating client workspaces)
CREATE POLICY "super_admin_insert_workspaces" ON public.workspaces
  FOR INSERT WITH CHECK (public.is_super_admin());

-- Super admins or workspace admins can INSERT memberships
CREATE POLICY "super_admin_insert_memberships" ON public.memberships
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR auth_has_role(workspace_id, ARRAY['admin']::workspace_role[])
  );

-- REVOKE anon from new function
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM anon;

-- ============================================================
-- End of migration: 20260609000001_super_admin
-- ============================================================
