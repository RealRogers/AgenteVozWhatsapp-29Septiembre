-- Optional AI conversation summary (v1.5 backlog). Written by the auto-tagging
-- service when the active agent has config.summarize enabled.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS summary TEXT;
