-- Phase 4: rich WhatsApp templates (header/footer/buttons) + curated library.
--
-- The existing `templates` table only modelled a body. To replicate the ATS
-- visual builder we add header (text-only for now), footer, buttons and the
-- approval timestamps. A separate read-only `template_library` holds curated
-- starter templates that pre-fill the form (mirrors ATS's wa_template_library).

-- ── Rich fields on the workspace templates ────────────────────────────────────
alter table templates
  add column if not exists header_type text not null default 'none'
    check (header_type in ('none', 'text')),
  add column if not exists header_text text,
  add column if not exists footer_text text,
  add column if not exists buttons jsonb not null default '[]'::jsonb,
  add column if not exists submitted_at timestamptz,
  add column if not exists approved_at timestamptz;

-- ── Curated, global template library (read-only catalog) ──────────────────────
create table if not exists template_library (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  use_case text,
  category text not null
    check (category in ('marketing', 'utility', 'authentication')),
  language text not null default 'es',
  header_type text not null default 'none'
    check (header_type in ('none', 'text')),
  header_text text,
  body_template text not null,
  footer_text text,
  buttons jsonb not null default '[]'::jsonb,
  variables jsonb not null default '[]'::jsonb,
  published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (title, language)
);

alter table template_library enable row level security;

drop policy if exists "template_library_read_published" on template_library;
create policy "template_library_read_published"
  on template_library for select
  to authenticated
  using (published = true);

-- ── Seed a few common Spanish starter templates ───────────────────────────────
insert into template_library
  (title, description, use_case, category, language, body_template, footer_text, variables, sort_order)
values
  (
    'Bienvenida',
    'Saludo inicial cuando un cliente escribe por primera vez.',
    'welcome', 'utility', 'es',
    '¡Hola {{1}}! 👋 Gracias por escribir a {{2}}. ¿En qué te puedo ayudar hoy?',
    null,
    '[{"index":1,"example":"Juan"},{"index":2,"example":"Clínica Sonrisa"}]'::jsonb,
    1
  ),
  (
    'Confirmación de cita',
    'Confirma una cita agendada con fecha y hora.',
    'confirmation', 'utility', 'es',
    'Hola {{1}}, tu cita en {{2}} quedó confirmada para el {{3}}. Si necesitas reagendar, respóndenos por aquí.',
    'Gracias por tu preferencia.',
    '[{"index":1,"example":"Juan"},{"index":2,"example":"Clínica Sonrisa"},{"index":3,"example":"martes 18 a las 10:00"}]'::jsonb,
    2
  ),
  (
    'Recordatorio de cita',
    'Recordatorio el día previo a la cita.',
    'reminder', 'utility', 'es',
    'Hola {{1}}, te recordamos tu cita mañana {{2}} a las {{3}}. ¡Te esperamos! 😊',
    null,
    '[{"index":1,"example":"Juan"},{"index":2,"example":"18 de junio"},{"index":3,"example":"10:00"}]'::jsonb,
    3
  ),
  (
    'Seguimiento de interés',
    'Reactiva a un prospecto que mostró interés.',
    'follow_up', 'marketing', 'es',
    'Hola {{1}}, ¿seguimos con tu interés en {{2}}? Con gusto te ayudo a agendar una cita sin compromiso.',
    'Responde STOP para no recibir más mensajes.',
    '[{"index":1,"example":"Juan"},{"index":2,"example":"el tratamiento de blanqueamiento"}]'::jsonb,
    4
  )
on conflict (title, language) do nothing;
