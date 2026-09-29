-- Add sensitivity column to tools catalog (SEC-01)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='tools' AND column_name='sensitivity') THEN
    ALTER TABLE public.tools ADD COLUMN sensitivity TEXT NOT NULL DEFAULT 'read'
      CHECK (sensitivity IN ('read', 'write', 'sensitive'));
  END IF;
END $$;

-- Seed built-in tools
INSERT INTO public.tools (key, name, description, schema, sensitivity) VALUES
  ('echo',             'Echo',                'Test tool — echoes back a message',
   '{"type":"object","properties":{"msg":{"type":"string"}},"required":["msg"]}', 'read'),
  ('schedule_link',    'Agendamiento (link)', 'Returns a scheduling link for the contact to book an appointment',
   '{"type":"object","properties":{"contact_name":{"type":"string"}},"required":[]}', 'read'),
  ('schedule_highlevel','Agendar en HighLevel','Creates an appointment directly in HighLevel CRM',
   '{"type":"object","properties":{"contact_name":{"type":"string"},"datetime_iso":{"type":"string"},"calendar_id":{"type":"string"}},"required":["datetime_iso"]}', 'write'),
  ('custom_webhook',   'Webhook personalizado','Calls a custom HTTPS webhook URL with a JSON payload',
   '{"type":"object","properties":{"payload":{"type":"object"}},"required":["payload"]}', 'sensitive')
ON CONFLICT (key) DO UPDATE SET sensitivity=EXCLUDED.sensitivity, name=EXCLUDED.name;
