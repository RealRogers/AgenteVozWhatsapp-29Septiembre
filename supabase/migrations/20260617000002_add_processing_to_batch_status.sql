-- ============================================================
-- Migration: 20260617000002_add_processing_to_batch_status
-- Agente WhatsApp — add the missing 'processing' value to batch_status
--
-- batch_status was created as ('buffering','flushed','processed','cancelled'),
-- but claim_next_batch() and cancel_batch() set and match status = 'processing'.
-- plpgsql casts the enum literal at RUNTIME, so the original migration applied
-- cleanly, yet every claim_next_batch() call threw:
--   invalid input value for enum batch_status: "processing"
-- processNextBatch() swallowed that as a failed claim and returned
-- {processed:false}, so the cron drained nothing — buffered inbound messages
-- were never processed and the AI never replied.
--
-- Add the missing value. (ADD VALUE appends to the end; enum position does not
-- affect the equality/IN comparisons claim_next_batch uses.)
-- ============================================================

ALTER TYPE public.batch_status ADD VALUE IF NOT EXISTS 'processing';

-- ============================================================
-- End of migration: 20260617000002_add_processing_to_batch_status
-- ============================================================
