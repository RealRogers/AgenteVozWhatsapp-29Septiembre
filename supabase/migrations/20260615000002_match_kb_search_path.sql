-- Harden match_kb_chunks: pin search_path (Supabase linter 0011).
-- Consistent with 20260608000008_sec02_function_hardening. The function only
-- touches public tables, so an explicit, immutable search_path is enough.

alter function match_kb_chunks(uuid, vector, int) set search_path = public, pg_temp;
