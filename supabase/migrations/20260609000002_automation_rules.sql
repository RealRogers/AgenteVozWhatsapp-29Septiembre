-- ============================================================
-- Migration: 20260609000002_automation_rules
-- Agente WhatsApp — G3 Automation Triggers table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'first_message',      -- when contact writes for first time
    'inactivity_24h',     -- no response for 24h
    'window_closing',     -- 2h before 24h window closes
    'handoff_requested',  -- AI requests handoff
    'lead_qualified',     -- setter marks as qualified
    'keyword_match'       -- message contains a keyword
  )),
  trigger_config JSONB NOT NULL DEFAULT '{}',  -- { keywords: [], hours: 24 }
  action_type TEXT NOT NULL CHECK (action_type IN (
    'send_template',      -- send a WhatsApp template
    'assign_agent',       -- assign to specific agent
    'add_tag',            -- add a tag to conversation
    'close_conversation', -- close conversation
    'handoff_human'       -- trigger handoff to human
  )),
  action_config JSONB NOT NULL DEFAULT '{}',   -- { template_name, agent_id, tag }
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_rules_workspace ON public.automation_rules(workspace_id, enabled);

CREATE TRIGGER trg_automation_rules_updated_at
  BEFORE UPDATE ON public.automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read automations" ON public.automation_rules
  FOR SELECT USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "ws admins manage automations" ON public.automation_rules
  FOR ALL USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  ) WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  );
