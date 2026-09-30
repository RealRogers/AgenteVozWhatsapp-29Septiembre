-- Inbox quick actions: priority flag + archive.
--
-- `priority` is a small enum ('normal' | 'high') rather than a boolean so a
-- future 'urgent' level needs no schema change. `archived` is a flag, not a
-- conversation state: archiving must not disturb the ai/human/closed state
-- machine (a closed+archived conversation reopens as closed, etc.).

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('normal', 'high')),
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;

-- The inbox list orders by last_message_at per workspace and will filter on
-- archived; cover both in one index.
CREATE INDEX IF NOT EXISTS idx_conversations_inbox_visible
  ON conversations (workspace_id, archived, last_message_at DESC);
