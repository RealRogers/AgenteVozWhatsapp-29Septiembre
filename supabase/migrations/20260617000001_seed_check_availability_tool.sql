-- ============================================================
-- Migration: 20260617000001_seed_check_availability_tool
-- Agente WhatsApp — seed the missing check_availability tool
--
-- check_availability is implemented and registered in code
-- (src/features/tools/tools/check-availability.ts → registry), but it was never
-- inserted into the public.tools catalog. Since the Settings catalog reads from
-- public.tools and getEnabledTools() only returns registry tools that have an
-- enabled tool_configs row (and tool_configs FKs to tools), the tool could not
-- be shown, toggled, or offered to the agent. Seed it so it shows in the catalog
-- and can be enabled per workspace.
--
-- The schema column is for catalog/display only — the agent builds the LLM tool
-- schema from the code zod definition — but we keep it accurate for consistency.
-- Idempotent via ON CONFLICT, matching the original tools seed.
-- ============================================================

INSERT INTO public.tools (key, name, description, schema, sensitivity) VALUES
  ('check_availability', 'Consultar disponibilidad',
   'Checks real free time slots from the HighLevel calendar for a date range',
   '{"type":"object","properties":{"date_from":{"type":"string"},"date_to":{"type":"string"},"timezone":{"type":"string"},"calendar_id":{"type":"string"}},"required":["date_from","date_to"]}',
   'read')
ON CONFLICT (key) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      schema = EXCLUDED.schema,
      sensitivity = EXCLUDED.sensitivity;

-- ============================================================
-- End of migration: 20260617000001_seed_check_availability_tool
-- ============================================================
