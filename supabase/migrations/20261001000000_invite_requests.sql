-- ============================================================
-- Migration: 20261001000000_invite_requests
-- Agente WhatsApp — public "request access" intake for the agency panel
--
-- Public self-registration is closed after the bootstrap super admin exists.
-- This table gives locked-out visitors a real channel instead of a dead link:
-- POST /api/invite-request writes here with the service role, and the super
-- admin reviews/approves from the agency panel (approving reuses the existing
-- workspace team invite, which hands out credentials manually — no SMTP).
--
-- RLS is enabled with NO policies: anon/authenticated roles can neither read
-- nor write. Only the service role (API routes) touches this table, so
-- requester emails are never exposed to clients.
-- ============================================================

CREATE TABLE public.invite_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  email       text NOT NULL,
  note        text,
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'approved', 'dismissed')),
  handled_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Dedupe safety net: a second pending request for the same email can't land.
-- The endpoint resolves it with a SELECT-then-UPDATE anyway (partial indexes
-- don't play well with upsert onConflict); this index only guards races.
CREATE UNIQUE INDEX invite_requests_pending_email
  ON public.invite_requests (lower(email))
  WHERE status = 'pending';

ALTER TABLE public.invite_requests ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- End of migration: 20261001000000_invite_requests
-- ============================================================
