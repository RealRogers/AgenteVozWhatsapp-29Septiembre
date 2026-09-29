-- KB semantic search RPC.
--
-- searchKb() (src/features/inbox/services/kb-service.ts) calls this function via
-- supabase.rpc("match_kb_chunks", ...). It was missing from the schema, so KB
-- search always failed and fell back to a non-existent execute_sql RPC, making
-- the agent answer "no tengo nada registrado". This restores end-to-end KB.
--
-- Returns the top-N most similar chunks for a workspace by cosine similarity.

create or replace function match_kb_chunks(
  p_workspace_id uuid,
  p_query_embedding vector(1536),
  p_match_count int default 3
)
returns table (
  chunk_content text,
  document_title text,
  document_id uuid,
  similarity double precision
)
language sql
stable
as $$
  select
    kc.content                              as chunk_content,
    kd.title                                as document_title,
    kc.document_id                          as document_id,
    1 - (kc.embedding <=> p_query_embedding) as similarity
  from kb_chunks kc
  join kb_documents kd on kd.id = kc.document_id
  where kc.workspace_id = p_workspace_id
    and kc.embedding is not null
  order by kc.embedding <=> p_query_embedding
  limit greatest(p_match_count, 1);
$$;

-- The runtime calls this with the service role, but allow authenticated callers
-- too (RLS on kb_chunks/kb_documents still scopes rows per workspace).
grant execute on function match_kb_chunks(uuid, vector, int) to authenticated, service_role;
