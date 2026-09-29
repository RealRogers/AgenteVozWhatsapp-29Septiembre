-- Fix inbound webhook 500: processInbound upserts messages with
-- ON CONFLICT (workspace_id, wamid), but the dedup index was a PARTIAL unique
-- index (WHERE wamid IS NOT NULL), which Postgres cannot infer from a plain
-- ON CONFLICT without the predicate. Replace it with a full UNIQUE constraint.
-- NULL wamids remain allowed (NULLs are distinct), so outbound messages — which
-- have no wamid until sent — are unaffected.

drop index if exists uq_messages_wamid;

alter table public.messages
  add constraint uq_messages_wamid unique (workspace_id, wamid);
