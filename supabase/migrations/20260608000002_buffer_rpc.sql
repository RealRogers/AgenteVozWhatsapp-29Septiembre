-- ============================================================
-- Migration: 20260608000002_buffer_rpc
-- Agente WhatsApp — Buffer RPCs (F2-T1)
--
-- Creates two SECURITY DEFINER functions for atomic batch processing:
--   1. claim_next_batch()  — claims ONE ready batch, prevents double-processing
--   2. cancel_batch()      — marks a batch as dead-letter after max retries
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- RPC 1: claim_next_batch
-- Atomically claims one batch for processing.
--
-- Eligible batches:
--   a) status = 'buffering' AND flush_at < NOW()  (ready)
--   b) status = 'processing' AND updated_at < NOW() - 5min (stale/stuck worker)
--
-- Uses FOR UPDATE SKIP LOCKED — the ONLY correct way to prevent
-- two cron workers from claiming the same batch (SCALE-01).
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION claim_next_batch()
RETURNS SETOF public.message_batches
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT id FROM public.message_batches
    WHERE status IN ('buffering', 'processing')
      AND (
        -- Ready buffering batches whose silence window has elapsed
        (status = 'buffering' AND flush_at < NOW())
        OR
        -- Reclaim stale processing batches (lease > 5 min = stuck worker)
        (status = 'processing' AND updated_at < NOW() - INTERVAL '5 minutes')
      )
    ORDER BY flush_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.message_batches
    SET status = 'processing',
        updated_at = NOW()
  FROM candidate
  WHERE public.message_batches.id = candidate.id
  RETURNING public.message_batches.*;
END;
$$;

-- ──────────────────────────────────────────────────────────
-- RPC 2: cancel_batch
-- Marks a batch as dead-letter (cancelled) after too many failures.
-- Only transitions from 'processing' to prevent accidental cancellation
-- of batches that were already processed or re-claimed.
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cancel_batch(p_batch_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.message_batches
  SET status = 'cancelled',
      updated_at = NOW(),
      meta = meta || jsonb_build_object('cancelled_reason', 'max_retries_exceeded')
  WHERE id = p_batch_id AND status = 'processing';
END;
$$;
