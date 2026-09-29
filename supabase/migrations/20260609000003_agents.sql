-- ============================================================================
-- Agentes: named, avatar'd agents with a per-agent model + prompt.
-- 3 types per workspace (setter/soporte/agendamiento); exactly ONE active.
-- The agent's prompt reuses prompts/prompt_versions with scope='mode',
-- scope_ref=<type>; agents.prompt_id is the source of truth (no circular lookup).
-- Fully back-compatible: when no active agent / null model, runtime falls back
-- to integrations.config.model + the global prompt.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE agent_type AS ENUM ('setter', 'soporte', 'agendamiento');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS agents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type          agent_type NOT NULL,
  name          TEXT NOT NULL,
  avatar_key    TEXT NOT NULL DEFAULT 'default',  -- key into the curated gallery (NOT a URL)
  model         TEXT,                             -- OpenRouter id; NULL => fall back to integrations
  is_active     BOOLEAN NOT NULL DEFAULT FALSE,
  prompt_id     UUID REFERENCES prompts(id) ON DELETE SET NULL,
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, type)
);
CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents(workspace_id);

-- Mutual exclusion: at most ONE active agent per workspace (DB-enforced).
CREATE UNIQUE INDEX IF NOT EXISTS uq_agents_one_active
  ON agents(workspace_id) WHERE is_active;

DROP TRIGGER IF EXISTS trg_agents_updated_at ON agents;
CREATE TRIGGER trg_agents_updated_at
  BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---- RLS (mirror prompts: members read, admin/manager write) ----
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agents_select"
  ON agents FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "agents_write"
  ON agents FOR ALL
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  )
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  );

-- ---- Atomic single-active toggle (the naive UPDATE order would violate the
--      partial unique index). Called only from the server with the service role
--      AFTER the route has verified the caller is admin/manager. ----
CREATE OR REPLACE FUNCTION set_active_agent(p_workspace UUID, p_agent UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  UPDATE public.agents SET is_active = FALSE
    WHERE workspace_id = p_workspace AND is_active = TRUE AND id <> p_agent;
  UPDATE public.agents SET is_active = TRUE
    WHERE workspace_id = p_workspace AND id = p_agent;
END;
$$;

REVOKE ALL ON FUNCTION set_active_agent(UUID, UUID) FROM PUBLIC;
-- Supabase grants EXECUTE to anon/authenticated by default; this fn is server-only.
REVOKE EXECUTE ON FUNCTION set_active_agent(UUID, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION set_active_agent(UUID, UUID) TO service_role;

-- ============================================================================
-- Backfill: one set of 3 agents per existing workspace.
-- The setter is active and inherits the workspace's current global prompt
-- (preserving any customization) + the openrouter model. The other two get
-- inline Spanish starter prompts. Onboarding `useCase` is not persisted, so the
-- active type defaults to 'setter' (editable in the UI).
-- ============================================================================
DO $$
DECLARE
  w               RECORD;
  t               agent_type;
  v_model         TEXT;
  v_prompt        UUID;
  v_ver           UUID;
  v_body          TEXT;
  v_global_body   TEXT;
  default_names   JSONB := '{"setter":"Carlos","soporte":"Sofía","agendamiento":"Andrés"}'::jsonb;
  starters        JSONB := jsonb_build_object(
    'setter',       'Eres {{agent_name}}, agente de ventas de {{business_name}}. Tu objetivo es calificar leads y agendar citas. Sé amable, profesional y directo. Responde en mensajes cortos, como en WhatsApp.',
    'soporte',      'Eres {{agent_name}}, agente de soporte de {{business_name}}. Responde dudas con precisión y empatía. Si no puedes resolver algo, ofrece escalar con un humano. Responde en mensajes cortos.',
    'agendamiento', 'Eres {{agent_name}}, asistente de agendamiento de {{business_name}}. Ayuda a reservar citas, confirma disponibilidad y datos de contacto. Responde en mensajes cortos.'
  );
BEGIN
  FOR w IN SELECT id FROM public.workspaces LOOP
    SELECT config->>'model' INTO v_model FROM public.integrations
      WHERE workspace_id = w.id AND provider = 'openrouter' LIMIT 1;

    SELECT pv.body INTO v_global_body
      FROM public.prompts p
      JOIN public.prompt_versions pv ON pv.id = p.active_version_id
      WHERE p.workspace_id = w.id AND p.scope = 'global' LIMIT 1;

    FOREACH t IN ARRAY ARRAY['setter','soporte','agendamiento']::agent_type[] LOOP
      IF EXISTS (SELECT 1 FROM public.agents WHERE workspace_id = w.id AND type = t) THEN
        CONTINUE;
      END IF;

      v_body := COALESCE(
        CASE WHEN t = 'setter' THEN v_global_body ELSE NULL END,
        starters->>(t::text)
      );

      INSERT INTO public.prompts (workspace_id, scope, scope_ref, name)
        VALUES (w.id, 'mode', t::text, 'Agente ' || t::text)
        ON CONFLICT (workspace_id, scope, scope_ref) DO NOTHING
        RETURNING id INTO v_prompt;
      IF v_prompt IS NULL THEN
        SELECT id INTO v_prompt FROM public.prompts
          WHERE workspace_id = w.id AND scope = 'mode' AND scope_ref = t::text;
      END IF;

      INSERT INTO public.prompt_versions (workspace_id, prompt_id, version, state, body, published_at)
        VALUES (w.id, v_prompt, 1, 'published', v_body, NOW())
        ON CONFLICT (prompt_id, version) DO NOTHING
        RETURNING id INTO v_ver;
      IF v_ver IS NOT NULL THEN
        UPDATE public.prompts SET active_version_id = v_ver WHERE id = v_prompt;
      END IF;

      INSERT INTO public.agents (workspace_id, type, name, avatar_key, model, is_active, prompt_id)
        VALUES (
          w.id, t,
          default_names->>(t::text),
          t::text,                                    -- per-type default avatar
          CASE WHEN t = 'setter' THEN v_model ELSE NULL END,
          (t = 'setter'),
          v_prompt
        );
    END LOOP;
  END LOOP;
END $$;
