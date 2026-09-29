-- Extra indexes for CRM dedupe and HL sync
-- Most indexes were created in F0. These add hl_contact_id lookup.
CREATE INDEX IF NOT EXISTS idx_contacts_hl_contact_id
  ON public.contacts(workspace_id, hl_contact_id)
  WHERE hl_contact_id IS NOT NULL;

-- Partial index for opt-out contacts (fast guard check)
CREATE INDEX IF NOT EXISTS idx_contacts_opt_out
  ON public.contacts(workspace_id, phone)
  WHERE opt_in = FALSE;
