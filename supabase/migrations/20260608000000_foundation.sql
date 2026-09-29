-- ============================================================
-- Migration: 20260608000000_foundation
-- Agente WhatsApp — Full schema foundation (F0-A2)
-- ============================================================

-- ============================================
-- Extensions
-- ============================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================
-- Trigger function: update_updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Enums
-- ============================================

DO $$ BEGIN
  CREATE TYPE conversation_state AS ENUM (
    'ai_active',
    'human_active',
    'handoff_pending',
    'waiting_reply',
    'paused',
    'closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE conversation_channel AS ENUM ('whatsapp');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE message_direction AS ENUM ('in', 'out');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE message_type AS ENUM (
    'text', 'audio', 'image', 'document', 'video', 'sticker', 'location', 'template', 'system'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE message_status AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE batch_status AS ENUM ('buffering', 'flushed', 'processed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE template_status AS ENUM ('draft', 'submitted', 'approved', 'rejected', 'paused');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE prompt_version_state AS ENUM ('draft', 'published');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE prompt_scope AS ENUM ('global', 'number', 'campaign', 'segment', 'mode');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE workspace_role AS ENUM ('admin', 'manager', 'agent', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE contact_stage AS ENUM ('new', 'engaged', 'qualified', 'customer', 'lost');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE integration_provider AS ENUM ('highlevel', 'openrouter', 'ycloud', 'caldotcom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================
-- Table: workspaces (tenant root — must exist before memberships)
-- ============================================
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  settings JSONB DEFAULT '{
    "timezone": "America/Mexico_City",
    "language": "es"
  }'::jsonb NOT NULL,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workspaces_slug ON workspaces(slug);

-- ============================================
-- Table: users (profile linked to auth.users)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================
-- Table: memberships (user <-> workspace N:M)
-- ============================================
CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role workspace_role NOT NULL DEFAULT 'agent',
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_workspace ON memberships(workspace_id, is_active);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id, is_active);

-- ============================================
-- RLS helper functions (depend on memberships)
-- ============================================
CREATE OR REPLACE FUNCTION auth_workspace_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT m.workspace_id
  FROM memberships m
  WHERE m.user_id = auth.uid() AND m.is_active = TRUE;
$$;

CREATE OR REPLACE FUNCTION auth_has_role(p_workspace UUID, p_roles workspace_role[])
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.user_id = auth.uid()
      AND m.workspace_id = p_workspace
      AND m.is_active = TRUE
      AND m.role = ANY(p_roles)
  );
$$;

-- ============================================
-- Table: permissions (fine-grained capability overrides)
-- ============================================
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  granted BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (workspace_id, user_id, capability)
);
CREATE INDEX IF NOT EXISTS idx_permissions_lookup ON permissions(workspace_id, user_id);

-- ============================================
-- Table: contacts (CRM)
-- ============================================
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT,
  email TEXT,
  source TEXT,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  stage contact_stage DEFAULT 'new' NOT NULL,
  tags TEXT[] DEFAULT '{}'::text[] NOT NULL,
  custom_fields JSONB DEFAULT '{}'::jsonb NOT NULL,
  opt_in BOOLEAN DEFAULT FALSE NOT NULL,
  opt_in_at TIMESTAMPTZ,
  hl_contact_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT uq_contacts_workspace_phone UNIQUE (workspace_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_contacts_workspace         ON contacts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_contacts_owner             ON contacts(workspace_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_contacts_stage             ON contacts(workspace_id, stage);
CREATE INDEX IF NOT EXISTS idx_contacts_hl                ON contacts(workspace_id, hl_contact_id) WHERE hl_contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_tags_gin          ON contacts USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_contacts_custom_fields_gin ON contacts USING GIN (custom_fields jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm         ON contacts USING GIN (name gin_trgm_ops);

DROP TRIGGER IF EXISTS trg_contacts_updated_at ON contacts;
CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Table: conversations (state machine + 24h window)
-- ============================================
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel conversation_channel DEFAULT 'whatsapp' NOT NULL,
  state conversation_state DEFAULT 'ai_active' NOT NULL,
  ai_enabled BOOLEAN DEFAULT TRUE NOT NULL,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ,
  window_expires_at TIMESTAMPTZ,
  unread_count INT DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT uq_conversations_contact UNIQUE (workspace_id, contact_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_conversations_inbox     ON conversations(workspace_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_state     ON conversations(workspace_id, state);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned  ON conversations(workspace_id, assigned_to);

DROP TRIGGER IF EXISTS trg_conversations_updated_at ON conversations;
CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Table: message_batches (smart buffer, module 2)
-- ============================================
CREATE TABLE IF NOT EXISTS message_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  status batch_status DEFAULT 'buffering' NOT NULL,
  silence_ms INT NOT NULL DEFAULT 30000,
  flush_at TIMESTAMPTZ,
  message_count INT DEFAULT 0 NOT NULL,
  merged_text TEXT,
  meta JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_batches_conversation ON message_batches(conversation_id, status);
CREATE INDEX IF NOT EXISTS idx_batches_flush        ON message_batches(status, flush_at) WHERE status = 'buffering';

DROP TRIGGER IF EXISTS trg_batches_updated_at ON message_batches;
CREATE TRIGGER trg_batches_updated_at
  BEFORE UPDATE ON message_batches FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Table: messages (in/out, media, wamid, batch)
-- templates FK added after templates table
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction message_direction NOT NULL,
  type message_type NOT NULL DEFAULT 'text',
  body TEXT,
  media JSONB,
  wamid TEXT,
  batch_id UUID REFERENCES message_batches(id) ON DELETE SET NULL,
  template_id UUID,
  status message_status,
  error_message TEXT,
  sender_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  meta JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_wamid
  ON messages(workspace_id, wamid)
  WHERE wamid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_workspace    ON messages(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_batch        ON messages(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_meta_gin     ON messages USING GIN (meta jsonb_path_ops);

-- ============================================
-- Table: business_info (module 5)
-- ============================================
CREATE TABLE IF NOT EXISTS business_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  structured JSONB DEFAULT '{}'::jsonb NOT NULL,
  free_text TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (workspace_id)
);
CREATE INDEX IF NOT EXISTS idx_business_info_structured_gin ON business_info USING GIN (structured jsonb_path_ops);

DROP TRIGGER IF EXISTS trg_business_info_updated_at ON business_info;
CREATE TRIGGER trg_business_info_updated_at
  BEFORE UPDATE ON business_info FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Table: prompts (module 6)
-- ============================================
CREATE TABLE IF NOT EXISTS prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  scope prompt_scope NOT NULL,
  scope_ref TEXT,
  name TEXT NOT NULL,
  active_version_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (workspace_id, scope, scope_ref)
);
CREATE INDEX IF NOT EXISTS idx_prompts_workspace_scope ON prompts(workspace_id, scope, scope_ref);

-- ============================================
-- Table: prompt_versions (draft/published)
-- ============================================
CREATE TABLE IF NOT EXISTS prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  prompt_id UUID NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  version INT NOT NULL,
  state prompt_version_state DEFAULT 'draft' NOT NULL,
  body TEXT NOT NULL,
  variables JSONB DEFAULT '[]'::jsonb NOT NULL,
  model_overrides JSONB DEFAULT '{}'::jsonb NOT NULL,
  guardrails JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (prompt_id, version)
);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_prompt ON prompt_versions(prompt_id, state);

-- Back-patch FK: prompts.active_version_id -> prompt_versions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_prompts_active_version'
      AND table_name = 'prompts'
  ) THEN
    ALTER TABLE prompts
      ADD CONSTRAINT fk_prompts_active_version
      FOREIGN KEY (active_version_id) REFERENCES prompt_versions(id) ON DELETE SET NULL;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_prompts_updated_at ON prompts;
CREATE TRIGGER trg_prompts_updated_at
  BEFORE UPDATE ON prompts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Table: templates (Meta compliance — module 10)
-- ============================================
CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'es',
  category TEXT NOT NULL CHECK (category IN ('marketing', 'utility', 'authentication')),
  status template_status NOT NULL DEFAULT 'draft',
  body_template TEXT NOT NULL,
  components JSONB DEFAULT '{}'::jsonb NOT NULL,
  variables JSONB DEFAULT '[]'::jsonb NOT NULL,
  provider_template_id TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (workspace_id, name, language)
);
CREATE INDEX IF NOT EXISTS idx_templates_workspace_status ON templates(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_templates_components_gin    ON templates USING GIN (components jsonb_path_ops);

DROP TRIGGER IF EXISTS trg_templates_updated_at ON templates;
CREATE TRIGGER trg_templates_updated_at
  BEFORE UPDATE ON templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Back-patch FK: messages.template_id -> templates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_messages_template'
      AND table_name = 'messages'
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT fk_messages_template
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================
-- Table: tools (global catalog — module 7, read-only for clients)
-- ============================================
CREATE TABLE IF NOT EXISTS tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  schema JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================
-- Table: tool_configs (activation + credentials per workspace)
-- ============================================
CREATE TABLE IF NOT EXISTS tool_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT FALSE NOT NULL,
  credentials JSONB DEFAULT '{}'::jsonb NOT NULL,
  config JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (workspace_id, tool_id)
);
CREATE INDEX IF NOT EXISTS idx_tool_configs_workspace ON tool_configs(workspace_id, enabled);

DROP TRIGGER IF EXISTS trg_tool_configs_updated_at ON tool_configs;
CREATE TRIGGER trg_tool_configs_updated_at
  BEFORE UPDATE ON tool_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Table: integrations (HighLevel, OpenRouter, YCloud — modules 11/13)
-- ============================================
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider integration_provider NOT NULL,
  enabled BOOLEAN DEFAULT FALSE NOT NULL,
  credentials JSONB DEFAULT '{}'::jsonb NOT NULL,
  oauth_tokens JSONB DEFAULT '{}'::jsonb NOT NULL,
  config JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (workspace_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_integrations_workspace ON integrations(workspace_id, provider);

DROP TRIGGER IF EXISTS trg_integrations_updated_at ON integrations;
CREATE TRIGGER trg_integrations_updated_at
  BEFORE UPDATE ON integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Table: kb_documents (module 12 — Knowledge Base)
-- ============================================
CREATE TABLE IF NOT EXISTS kb_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'doc' CHECK (source_type IN ('doc', 'faq', 'url', 'snippet')),
  source_url TEXT,
  content TEXT,
  meta JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kb_documents_workspace ON kb_documents(workspace_id);

DROP TRIGGER IF EXISTS trg_kb_documents_updated_at ON kb_documents;
CREATE TRIGGER trg_kb_documents_updated_at
  BEFORE UPDATE ON kb_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Table: kb_chunks (pgvector embeddings)
-- ============================================
CREATE TABLE IF NOT EXISTS kb_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  meta JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (document_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_workspace ON kb_chunks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_document  ON kb_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_embedding_hnsw
  ON kb_chunks USING hnsw (embedding vector_cosine_ops);

-- ============================================
-- Table: setter_configs (module 8: knockout + scoring)
-- ============================================
CREATE TABLE IF NOT EXISTS setter_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  enabled BOOLEAN DEFAULT FALSE NOT NULL,
  questions JSONB DEFAULT '[]'::jsonb NOT NULL,
  knockout_rules JSONB DEFAULT '[]'::jsonb NOT NULL,
  scoring JSONB DEFAULT '{}'::jsonb NOT NULL,
  post_action JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (workspace_id, name)
);
CREATE INDEX IF NOT EXISTS idx_setter_configs_workspace ON setter_configs(workspace_id, enabled);

DROP TRIGGER IF EXISTS trg_setter_configs_updated_at ON setter_configs;
CREATE TRIGGER trg_setter_configs_updated_at
  BEFORE UPDATE ON setter_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Table: schedules (module 9 — scheduling config)
-- ============================================
CREATE TABLE IF NOT EXISTS schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'external_link' CHECK (mode IN ('external_link', 'highlevel')),
  config JSONB DEFAULT '{}'::jsonb NOT NULL,
  enabled BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_schedules_workspace ON schedules(workspace_id, enabled);

DROP TRIGGER IF EXISTS trg_schedules_updated_at ON schedules;
CREATE TRIGGER trg_schedules_updated_at
  BEFORE UPDATE ON schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Table: appointments (booked appointments)
-- ============================================
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  schedule_id UUID REFERENCES schedules(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'confirmed', 'cancelled', 'completed', 'no_show')),
  hl_appointment_id TEXT,
  meta JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_appointments_workspace ON appointments(workspace_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointments_contact   ON appointments(contact_id);

DROP TRIGGER IF EXISTS trg_appointments_updated_at ON appointments;
CREATE TRIGGER trg_appointments_updated_at
  BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Table: events (observability / audit log — module 17)
-- ============================================
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('debug', 'info', 'warn', 'error')),
  payload JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_workspace    ON events(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_conversation ON events(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_type         ON events(workspace_id, type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_payload_gin  ON events USING GIN (payload jsonb_path_ops);

-- ============================================
-- Realtime: messages + conversations
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER TABLE messages REPLICA IDENTITY FULL;
ALTER TABLE conversations REPLICA IDENTITY FULL;

-- ============================================================
-- RLS — Row Level Security
-- All tenant-scoped tables use workspace_id for isolation.
-- service_role bypasses RLS (used by webhook handlers).
-- ============================================================

-- ---- workspaces ----
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspaces_select_members"
  ON workspaces FOR SELECT
  USING (id IN (SELECT auth_workspace_ids()));

CREATE POLICY "workspaces_update_admins"
  ON workspaces FOR UPDATE
  USING (auth_has_role(id, ARRAY['admin']::workspace_role[]))
  WITH CHECK (auth_has_role(id, ARRAY['admin']::workspace_role[]));

CREATE POLICY "workspaces_delete_admins"
  ON workspaces FOR DELETE
  USING (auth_has_role(id, ARRAY['admin']::workspace_role[]));

-- ---- users ----
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_authenticated"
  ON users FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "users_update_own"
  ON users FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ---- memberships ----
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "memberships_select_members"
  ON memberships FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "memberships_insert_admins"
  ON memberships FOR INSERT
  WITH CHECK (auth_has_role(workspace_id, ARRAY['admin']::workspace_role[]));

CREATE POLICY "memberships_update_admins"
  ON memberships FOR UPDATE
  USING (auth_has_role(workspace_id, ARRAY['admin']::workspace_role[]))
  WITH CHECK (auth_has_role(workspace_id, ARRAY['admin']::workspace_role[]));

CREATE POLICY "memberships_delete_admins"
  ON memberships FOR DELETE
  USING (auth_has_role(workspace_id, ARRAY['admin']::workspace_role[]));

-- ---- permissions ----
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "permissions_select_admins"
  ON permissions FOR SELECT
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin']::workspace_role[])
  );

CREATE POLICY "permissions_insert_admins"
  ON permissions FOR INSERT
  WITH CHECK (auth_has_role(workspace_id, ARRAY['admin']::workspace_role[]));

CREATE POLICY "permissions_update_admins"
  ON permissions FOR UPDATE
  USING (auth_has_role(workspace_id, ARRAY['admin']::workspace_role[]))
  WITH CHECK (auth_has_role(workspace_id, ARRAY['admin']::workspace_role[]));

CREATE POLICY "permissions_delete_admins"
  ON permissions FOR DELETE
  USING (auth_has_role(workspace_id, ARRAY['admin']::workspace_role[]));

-- ---- contacts (from §3.10) ----
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read contacts"
  ON contacts FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "ws operators write contacts"
  ON contacts FOR ALL
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[])
  )
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[])
  );

-- ---- conversations (from §3.10) ----
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read conversations"
  ON conversations FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "ws agents update conversations"
  ON conversations FOR UPDATE
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND (
      auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
      OR assigned_to = auth.uid()
    )
  )
  WITH CHECK (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "ws operators insert conversations"
  ON conversations FOR INSERT
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[])
  );

CREATE POLICY "ws admins delete conversations"
  ON conversations FOR DELETE
  USING (auth_has_role(workspace_id, ARRAY['admin']::workspace_role[]));

-- ---- messages (from §3.10) ----
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read messages"
  ON messages FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "ws agents send messages"
  ON messages FOR INSERT
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND direction = 'out'
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[])
  );

-- ---- message_batches ----
ALTER TABLE message_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "message_batches_select"
  ON message_batches FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "message_batches_write"
  ON message_batches FOR ALL
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[])
  )
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[])
  );

-- ---- business_info ----
ALTER TABLE business_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_info_select"
  ON business_info FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "business_info_write"
  ON business_info FOR ALL
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  )
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  );

-- ---- prompts ----
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prompts_select"
  ON prompts FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "prompts_write"
  ON prompts FOR ALL
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  )
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  );

-- ---- prompt_versions ----
ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prompt_versions_select"
  ON prompt_versions FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "prompt_versions_write"
  ON prompt_versions FOR ALL
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  )
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  );

-- ---- templates ----
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "templates_select"
  ON templates FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "templates_write"
  ON templates FOR ALL
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  )
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  );

-- ---- tools (global catalog — SELECT only for authenticated clients) ----
ALTER TABLE tools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tools_select_authenticated"
  ON tools FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- No INSERT/UPDATE/DELETE from client; managed by service_role only.

-- ---- tool_configs (credentials must not be readable by non-admins from client) ----
ALTER TABLE tool_configs ENABLE ROW LEVEL SECURITY;

-- Admins/managers see the full row (credentials read server-side only via service_role)
CREATE POLICY "tool_configs_select_admins"
  ON tool_configs FOR SELECT
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  );

CREATE POLICY "tool_configs_write_admins"
  ON tool_configs FOR ALL
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin']::workspace_role[])
  )
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin']::workspace_role[])
  );

-- ---- integrations (credentials/oauth_tokens — server-side only via service_role) ----
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

-- Admins/managers can see integrations metadata (credentials decrypted server-side only)
CREATE POLICY "integrations_select_admins"
  ON integrations FOR SELECT
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  );

CREATE POLICY "integrations_write_admins"
  ON integrations FOR ALL
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin']::workspace_role[])
  )
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin']::workspace_role[])
  );

-- ---- kb_documents ----
ALTER TABLE kb_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kb_documents_select"
  ON kb_documents FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "kb_documents_write"
  ON kb_documents FOR ALL
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  )
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  );

-- ---- kb_chunks ----
ALTER TABLE kb_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kb_chunks_select"
  ON kb_chunks FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "kb_chunks_write"
  ON kb_chunks FOR ALL
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  )
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  );

-- ---- setter_configs ----
ALTER TABLE setter_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "setter_configs_select"
  ON setter_configs FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "setter_configs_write"
  ON setter_configs FOR ALL
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  )
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  );

-- ---- schedules ----
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedules_select"
  ON schedules FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "schedules_write"
  ON schedules FOR ALL
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  )
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  );

-- ---- appointments ----
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "appointments_select"
  ON appointments FOR SELECT
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "appointments_write"
  ON appointments FOR ALL
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[])
  )
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[])
  );

-- ---- events (observability — append-only from app, read for admins/managers) ----
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_select"
  ON events FOR SELECT
  USING (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager']::workspace_role[])
  );

CREATE POLICY "events_insert"
  ON events FOR INSERT
  WITH CHECK (
    workspace_id IN (SELECT auth_workspace_ids())
    AND auth_has_role(workspace_id, ARRAY['admin','manager','agent']::workspace_role[])
  );

-- ============================================================
-- End of migration: 20260608000000_foundation
-- 20 tables, 12 enums, RLS on all tables, Realtime on messages+conversations
-- ============================================================
