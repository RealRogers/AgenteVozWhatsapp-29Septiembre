-- ============================================================
-- Migration: 20260615000003_enable_pg_cron_pg_net
-- Agente WhatsApp — Enable pg_cron + pg_net for the buffer-flush scheduler
--
-- The inbox "intelligent buffer" batches inbound WhatsApp messages; a worker must
-- drain them ~every minute so the agent replies as one coherent turn. Vercel Cron
-- only runs per-minute on the Pro plan (Hobby is capped at 1x/day and would fail to
-- deploy), so this distribution schedules the flush INSIDE Postgres: pg_cron fires
-- every minute and pg_net calls the app's /api/cron/buffer-flush endpoint, which runs
-- the LLM + WhatsApp send in Node (that logic cannot run inside Postgres).
--
-- This migration only ENABLES the extensions (idempotent, no secrets). Both are on
-- Supabase's allowlist and work on the free tier. The job itself is registered
-- post-deploy with the real prod URL + CRON_SECRET — see
-- supabase/cron/schedule-buffer-flush.sql.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================
-- End of migration: 20260615000003_enable_pg_cron_pg_net
-- ============================================================
