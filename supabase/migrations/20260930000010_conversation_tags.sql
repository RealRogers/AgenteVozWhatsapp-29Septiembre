-- Conversation tags — same shape as contacts.tags (free-form text[] with a
-- GIN index), so operators can label threads and filter the inbox by them.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_conversations_tags_gin
  ON conversations USING GIN (tags);
