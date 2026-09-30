# Estructura del proyecto — Agente WhatsApp

> Documento generado el 2026-09-29 y verificado/actualizado el mismo día.
> Describe la estructura del codebase tal como existe en esa fecha; si el
> proyecto cambia, este archivo puede quedar desactualizado.

Plataforma **multi-tenant** de inbox de WhatsApp con agente de IA operable por
humano: inbox tipo WhatsApp Web, CRM, motor de agente con handoff, agendamiento
y cumplimiento de la ventana de 24h de Meta. Cada **workspace** es un cliente.

## Stack

| Capa      | Tecnología                                   |
| --------- | -------------------------------------------- |
| Framework | Next.js 16 + React 19 + TypeScript           |
| Estilos   | Tailwind CSS + shadcn/ui (Glass + Electric Lime) |
| Backend   | Supabase (Auth + PostgreSQL + RLS + Storage + pgvector + pg_cron/pg_net) |
| IA        | OpenRouter (LLM gateway, vía Vercel AI SDK)  |
| WhatsApp  | YCloud o Kapso, elegido por workspace        |
| CRM       | HighLevel (sync de contactos + calendario)   |
| Hosting   | Vercel                                       |

## Convención arquitectónica

**Feature-First**: el código vive en `src/features/<feature>/` con subcapas
`components/`, `hooks/`, `services/`, `store/`, `types/`, `lib/` según aplique.
`src/features/.template/` es el scaffolding de referencia para nuevas features.

Reglas de dependencia observadas:

- El client de **service-role** de Supabase solo se crea dentro de `services/`
  (nunca en routes ni componentes).
- **`dispatch.ts` es el único punto de salida** de mensajes a WhatsApp
  (SEC-04): inserta el row como `queued` antes de llamar al proveedor, para
  que el trigger de ventana 24h rechace antes de enviar.
- Credenciales de integraciones cifradas con **AES-256-GCM** ligadas a
  `<workspace_id>:<provider>` (AAD) — `src/shared/lib/crypto.ts` +
  `integration-secrets.ts`.
- RLS por `workspace_id` en Postgres; `src/lib/auth/workspace-access.ts`
  centraliza el check de membresía/rol en routes y server actions.

## Árbol de directorios

```
├── .claude/
│   └── settings.json            # Permisos pre-aprobados para el instalador (Claude Code)
├── .devin/
│   ├── mcp_config.json          # Config MCP para Devin (context7)
│   └── skills/context7-mcp/SKILL.md   # Skill: fetch de docs de librerías vía Context7
├── .env.local.example           # Template de variables de entorno (se commitea a propósito)
├── .gitignore
├── .mcp.json                    # Servidores MCP (16): supabase, playwright, next-devtools,
│                                #   shadcn, chrome-devtools, github, stripe, sentry, resend,
│                                #   perplexity, brave-search, firecrawl, n8n, insforge
│                                #   (deshabilitado), sequential-thinking, svgmaker
├── AGENTS.md                    # Regla always-on: usar Context7 MCP para docs de librerías
├── COMPONENT_RULES.md           # Design system: Glass + Electric Lime, tokens, motion, 4 estados
├── Documentos-Planeacion/       # Documentos de planeación del producto
│   └── documentos-planeacion/   #   BLUEPRINT, SECURITY-AUDIT, USER-STORIES (agente-whatsapp)
├── Estructura.md                # Este documento — mapa anotado del codebase
├── INSTALAR.md                  # Guía de instalación one-click para agentes (~700 líneas)
├── LICENSE                      # MIT
├── README.md
├── components.json              # Config de shadcn/ui
├── eslint.config.mjs
├── middleware.ts                # Sesión Supabase SSR; protege todo menos las rutas de auth
├── next-env.d.ts
├── next.config.ts               # CSP/HSTS/headers de seguridad, rewrite de favicon
├── node-test.d.ts               # Tipos para node --test
├── package.json / package-lock.json
├── postcss.config.js
├── tailwind.config.ts           # Tokens del design system (OKLch, fuentes, .glass)
├── tsconfig.json
│
├── public/
│   └── avatars/                 # Avatares predefinidos para agentes
│                                #   (agendamiento, ana, mateo, setter, soporte, valeria)
│
├── scripts/
│   ├── setup.mjs                # Orquestador de instalación: env, db-push, cron, vercel, doctor…
│   ├── seed-admin.mjs           # Crea el super admin
│   ├── encrypt-credentials.mjs  # Migra credenciales en texto plano → AES-256-GCM
│   └── register-alias-hook.mjs / resolve-alias-hook.mjs / mock-module-compat.mjs
│                                # Hooks para que node --test resuelva @/ y mockee módulos
│
├── supabase/
│   ├── config.toml              # project_id para supabase link / db push
│   ├── cron/
│   │   └── schedule-buffer-flush.sql   # pg_cron + pg_net → GET /api/cron/buffer-flush cada minuto
│   ├── migrations/              # 41 migraciones (ver sección "Base de datos")
│   └── tests/
│       └── security.test.sql    # Tests de RLS con pgTAP (supabase test db)
│
└── src/
    ├── middleware (raíz: ../middleware.ts)
    ├── app/                     # Next.js App Router
    │   ├── layout.tsx           # Root layout (fuentes Geist/Space Grotesk, theme provider)
    │   ├── page.tsx             # Landing / redirect
    │   ├── (auth)/              # Rutas públicas de autenticación
    │   │   ├── layout.tsx
    │   │   ├── login/ · signup/ · forgot-password/ · reset-password/
    │   ├── (main)/              # App autenticada (layout con sidebar/workspace switcher)
    │   │   ├── layout.tsx
    │   │   ├── inbox/           # Inbox + inbox/[id] (conversación)
    │   │   ├── dashboard/       # Métricas
    │   │   ├── onboarding/      # Wizard inicial del workspace
    │   │   └── settings/        # Settings (tabs: integraciones, KB, templates, tools…)
    │   ├── (agency)/
    │   │   ├── layout.tsx
    │   │   └── workspaces/      # Panel del super admin / agencia
    │   ├── ui/                  # Showcase del design system (solo dev) + server actions de feedback
    │   └── api/                 # Route handlers
    │       ├── webhooks/
    │       │   ├── ycloud/      # POST ?wsid=… — firma HMAC + timestamp (anti-replay 300s)
    │       │   ├── kapso/       # POST ?wsid=… — HMAC-SHA256 del body crudo (X-Webhook-Signature)
    │       │   └── highlevel/   # POST ?wsid=…&token=… — sync de contactos desde HL
    │       ├── cron/buffer-flush/         # Drena batches del buffer (auth: CRON_SECRET)
    │       ├── internal/buffer/process/   # Procesamiento interno (auth: BUFFER_PROCESS_SECRET)
    │       ├── conversations/[id]/
    │       │   ├── messages/ · notes/ · events/    # Mensajes, notas internas, log de eventos
    │       │   ├── handoff/ · take/ · toggle-ai/   # Controles del operador humano
    │       ├── contacts/[id]/             # CRM básico
    │       ├── inbox/media-url/           # URLs firmadas para media del bucket whatsapp-media
    │       ├── integrations/{ycloud,kapso}/test/  # "Probar conexión" por proveedor
    │       ├── tools/[workspaceId]/       # Catálogo de tools del workspace
    │       ├── agency/workspaces/         # Creación/gestión de workspaces (agencia)
    │       └── workspace/[id]/
    │           ├── agents/ (+ [agentId]/test-chat)   # Agentes IA y playground
    │           ├── automations/ · business-info/ · jev/ (+ preview) · kb/
    │           ├── integrations/ (+ test, highlevel/*) # Guardar/probar integraciones cifradas
    │           ├── n8n-tools/ (+ [toolId])           # Tools dinámicos vía webhook n8n
    │           ├── prompts/ · setter/ · team/
    │           └── templates/ (+ generate, library, submit, sync) # Templates de Meta
    │
    ├── features/
    │   ├── .template/           # Scaffolding de feature (README + components/hooks/services/store/types)
    │   ├── auth/                # Formularios, server actions, signup-gate
    │   ├── agency/              # workspaces-table, create-workspace-sheet, members-sheet;
    │   │                    #   agency-actions (server: crear workspace, miembros, resets)
    │   ├── workspace/           # Workspace switcher, active-workspace
    │   ├── onboarding/          # Wizard + prompts semilla por caso de uso
    │   ├── dashboard/           # Métricas del workspace
    │   ├── settings/            # Tabs de settings: settings-shell, integrations (provider picker,
    │   │                    #   whatsapp-preview), kb-tab, templates (templates-tab,
    │   │                    #   template-form-sheet, ai-template-generator), automations
    │   │                    #   (automations-tab + rule-form), n8n-tools (+ form), team-tab,
    │   │                    #   business-info-form, tools-catalog + tool-config-panel,
    │   │                    #   cost-calculator; services: automation-actions; lib: template-form
    │   ├── ui-kit/              # Showcase components, motion system (durations/easing), feedback panel
    │   │
    │   ├── inbox/               # ★ Motor del producto
    │   │   ├── components/      # inbox-layout, chat-thread, chat-message, message-attachment,
    │   │   │                    #   conversation-item, crm-panel, observability-panel,
    │   │   │                    #   template-picker, window-banner, ai-toggle-button,
    │   │   │                    #   state-badge, status-icon, role-gate
    │   │   ├── hooks/           # use-realtime-conversations/messages (Supabase Realtime →
    │   │   │                    #   router.refresh debounced), use-ai-toggle, use-handoff-alerts,
    │   │   │                    #   use-role, handoff-alert
    │   │   ├── services/        # Lógica de servidor (todas usan service-role):
    │   │   │   # Inbound
    │   │   │   ├── ycloud-webhook-handler.ts / kapso-webhook-handler.ts
    │   │   │   │                #   Verificación de firma + parseo a NormalizedInbound
    │   │   │   ├── normalizer.ts            # processInbound: upsert contacto/conversación,
    │   │   │   │                            #   insert mensaje dedup por wamid
    │   │   │   ├── inbound-content.ts       # Botones/listas/Flows/órdenes/ubicación → texto (puro)
    │   │   │   ├── media-handler.ts         # Descarga media (host allowlist SEC-08) → Storage
    │   │   │   ├── media-understanding.ts   # Audio→transcripción / imagen→descripción (Gemini Flash)
    │   │   │   ├── phone.ts / country-code.ts # Normalización E.164
    │   │   │   # Buffer + motor de turno
    │   │   │   ├── buffer.ts                # upsertBatch (RPC atómica), processNextBatch
    │   │   │   │                            #   (claim serializado, checkpoints en meta,
    │   │   │   │                            #   retries transitorio/determinístico, dead-letter)
    │   │   │   ├── state-machine.ts         # Estados: ai_active · human_active · handoff_pending ·
    │   │   │   │                            #   waiting_reply · paused · closed; frases de handoff
    │   │   │   ├── decision-engine.ts       # respond / handoff / abstain / rate_limited
    │   │   │   ├── conversation-history.ts  # Historial de turnos para el contexto
    │   │   │   # Prompting
    │   │   │   ├── prompt-builder.ts        # Ensamblado canónico del system prompt
    │   │   │   ├── prompt-resolver.ts       # Jerarquía: mode > segment > campaign > number > global
    │   │   │   ├── business-info.ts         # Contexto del negocio + "now"
    │   │   │   ├── kb-service.ts            # KB: chunking + embeddings + búsqueda pgvector
    │   │   │   ├── setter.ts                # Modo setter: evaluación estructurada (score/knockout)
    │   │   │   ├── url-scraper.ts           # Scraping de URLs citadas en prompts
    │   │   │   # LLM
    │   │   │   ├── openrouter.ts            # generateWithTools, retries de errores transitorios,
    │   │   │   │                            #   timeouts, key por workspace con fallback a env
    │   │   │   ├── cost-tracker.ts          # 20 turnos LLM/contacto/hora (reserveLlmTurn)
    │   │   │   ├── cost-enforcer.ts         # Presupuesto diario: ≥800k degrada, ≥1M corta (SEC-06)
    │   │   │   ├── llm-call-guard.ts        # Límites/hora para template_generate y test_chat
    │   │   │   ├── model-policy.ts          # Modelo fuera de catálogo solo con key propia
    │   │   │   # Outbound
    │   │   │   ├── dispatch.ts              # SEC-04 único punto de salida (queued → send → update)
    │   │   │   ├── whatsapp-sender.ts       # Interfaz provider-neutral sendText/sendTemplate
    │   │   │   ├── whatsapp-provider.ts     # Proveedor activo por workspace; settings portables
    │   │   │   ├── ycloud-client.ts / kapso-client.ts
    │   │   │   ├── whatsapp-errors.ts       # Parseo de errores del proveedor → reason codes
    │   │   │   ├── text-formatter.ts        # Markdown → formato WhatsApp (*bold*, _it_)
    │   │   │   ├── message-status.ts        # Reconciliación de estados (sent/delivered/read)
    │   │   │   # Handoff + equipo
    │   │   │   ├── handoff-notifier.ts      # ACK al cliente por WhatsApp + dedupe por ventana
    │   │   │   ├── team-notifier.ts         # Email al equipo vía Resend (opt-in, 10/hora)
    │   │   │   # CRM / agendamiento
    │   │   │   ├── highlevel-client.ts      # Sync contacto ↔ HL, oportunidades
    │   │   │   ├── scheduling-timezone.ts   # Zona horaria del workspace para citas
    │   │   │   ├── contact-actions.ts       # Acciones de contacto desde el inbox
    │   │   │   # Templates de Meta
    │   │   │   ├── templates.ts · template-actions.ts · template-sync.ts · ycloud-templates.ts
    │   │   │   # Observabilidad
    │   │   │   ├── observability.ts         # Métricas por conversación (tokens, costo, tool calls)
    │   │   │   └── daily-events.ts          # emitEventOncePerDay (alertas deduplicadas)
    │   │   └── types/           # ConversationRow, MessageRow, ContactRow, handoff types
    │   │
    │   ├── agents/              # Multi-agente por workspace
    │   │   ├── components/      # agents-tab, agent-card, agent-avatar, agent-config-sheet,
    │   │   │                    #   guided-prompt-editor, setter-advanced-config, model-picker,
    │   │   │                    #   provider-logos, test-chat-panel, avatar-gallery-picker
    │   │   ├── services/        # active-agent (agente activo del workspace),
    │   │   │                    #   auto-tagging (tags + summary post-respuesta), agent-queries
    │   │   ├── lib/             # model-catalog (catálogo permitido en la key de plataforma),
    │   │   │                    #   agent-meta, playground-history
    │   │   └── types/
    │   │
    │   ├── tools/               # Herramientas que el LLM puede invocar
    │   │   ├── core/tool.ts     # Interfaz Tool (schema zod, sensitivity, timeout)
    │   │   ├── registry.ts      # Ejecutor: timeout, sanitizeArgs (redacción de secretos),
    │   │   │                    #   logging a events, confirmación de writes
    │   │   ├── tools/           # Nativos: check-availability, schedule-highlevel,
    │   │   │                    #   reschedule/cancel/list-highlevel, schedule-link,
    │   │   │                    #   handoff-human, echo
    │   │   ├── lib/             # n8n-tool-runner/schema/params/secrets (tools dinámicos
    │   │   │                    #   por webhook), slots, calendar-id, hl-appointment,
    │   │   │                    #   tool-config, beta-tools (tools marcadas beta)
    │   │   └── services/        # tool-configs (enabled por workspace), ssrf-guard
    │   │                        #   (validación de URL + redirects pinned para n8n)
    │   │
    │   └── jev-judge/           # Jev — juez TypeSafe opcional por workspace
    │       ├── judge.ts         # callJev: action, intent, auto-reply prob, opt-out prob
    │       ├── apply.ts         # Aplica el veredicto al batch (JevBatchEffect)
    │       ├── components/jev-panel.tsx   # UI de settings: on/off, stage, preview
    │       └── schema.ts · prompts.ts · map-judgment.ts · rate-limit.ts · cost.ts ·
    │           samples.ts · observe.ts · preview.ts · usage.ts · uses.ts
    │
    ├── lib/
    │   ├── supabase/client.ts · server.ts   # Clients browser (anon) / server (cookies SSR)
    │   ├── auth/provision-user.ts           # Alta de usuarios sin SMTP (password generado)
    │   ├── auth/workspace-access.ts         # requireWorkspaceMember / checkWorkspaceMember
    │   ├── branding.ts · utils.ts
    │
    ├── shared/
    │   ├── README.md                        # Convenciones del código compartido
    │   ├── lib/crypto.ts                    # AES-256-GCM encrypt/decrypt con AAD
    │   ├── lib/integration-secrets.ts       # encrypt/decryptCredentials por workspace+provider
    │   ├── lib/db-errors.ts                 # Detección de RPC faltante (PGRST202) + reporte 1 vez
    │   ├── lib/timezone.ts
    │   └── assets/ components/ constants/ hooks/ stores/ types/ utils/  # Reservados (.gitkeep)
    │
    └── components/
        ├── theme-provider.tsx · theme-toggle.tsx
        └── ui/                  # shadcn/ui: alert, avatar, badge, button, card, checkbox,
                                 #   command, dialog, dropdown-menu, input, label, popover,
                                 #   progress, scroll-area, select, separator, sheet, skeleton,
                                 #   sonner, switch, table, tabs, textarea, tooltip
```

## Flujo de datos principal

### Mensaje entrante → respuesta del agente

```
Proveedor (YCloud/Kapso)
  │  POST /api/webhooks/{ycloud|kapso}?wsid=<workspace>
  ▼
webhook-handler ── verifica firma (HMAC; YCloud +anti-replay 300s)
  │  parsea a NormalizedInbound
  ▼
normalizer.processInbound ── upsert contact → upsert conversation
  │                        → insert message (dedup por wamid)
  ▼
media-handler / media-understanding ── media → Storage; audio/imagen → texto
  │
  ▼
buffer.upsertBatch ── RPC upsert_batch_and_link_message (atómica)
  │  message_batches con ventana de silencio (~30s)
  ▼
pg_cron + pg_net (cada minuto) ── GET /api/cron/buffer-flush (CRON_SECRET)
  ▼
buffer.processNextBatch ── claim serializado del batch
  │
  ├─ decision-engine.decide
  │    1. state ≠ ai_active → abstain
  │    2. frase de handoff → handoff_pending (+ notify)
  │    3. carga tools habilitadas
  │    4. reserveLlmTurn → rate_limited si excede
  │
  ├─ cost-enforcer / model-policy ── presupuesto diario + catálogo de modelos
  │
  ├─ prompt ── prompt-resolver → prompt-builder
  │    (now → summary → business info → KB pgvector → estilo → base →
  │     formato WhatsApp → media → guardrails → honestidad de tools)
  │
  ├─ openrouter.generateWithTools ── hasta 5 steps; tools del registry
  │    (nativas HL/n8n; writes con confirmación; timeout 120s)
  │
  ├─ jev-judge (si habilitado) ── veredicto aplicado al batch
  │
  ├─ dispatchText/dispatchTemplate ── insert 'queued' → trigger 24h →
  │    sendText del proveedor activo → update con wamid
  │
  └─ post ── estado, handoff si aplica, auto-tagging/summary,
             setter evaluation, eventos de observabilidad
```

### Flujo humano (operador en el inbox)

- `POST /api/conversations/[id]/take` — el humano toma la conversación
  (`ai_active` → `human_active`).
- `POST /api/conversations/[id]/handoff` — handoff manual.
- `POST /api/conversations/[id]/toggle-ai` — pausa/reactiva la IA.
- Los mensajes del operador salen por `dispatchText` con `senderUserId`
  (mismo camino y mismo guard de 24h que la IA).
- Kapso **coexistence**: respuestas hechas desde la app de WhatsApp Business
  en el celular se registran y mueven la conversación a `human_active`.

## Base de datos (Supabase / Postgres)

Tablas principales (`supabase/migrations/20260608000000_foundation.sql` +
migraciones posteriores):

| Tabla | Propósito |
| --- | --- |
| `workspaces` | Tenants (un workspace = un cliente) |
| `users` / `memberships` / `permissions` | Usuarios, roles por workspace (admin/manager/agent/viewer), super admin |
| `contacts` | Contactos CRM por workspace (índice único con HighLevel) |
| `conversations` | Una por contacto+canal; `state` es la state machine |
| `message_batches` | Buffer de mensajes entrantes (silence window, claim, meta/checkpoints) |
| `messages` | Mensajes; `wamid` único por workspace (dedup); `meta` con transcript |
| `message_errors` | Errores de envío estructurados por mensaje |
| `business_info` | Datos del negocio para el system prompt |
| `prompts` / `prompt_versions` | Prompts por scope con versionado y publish |
| `templates` / `template_library` | Templates de Meta por workspace + biblioteca |
| `tools` / `tool_configs` | Catálogo de tools + habilitación/config por workspace |
| `n8n_tools` | Tools dinámicos vía webhook n8n (URL, auth header cifrado, params) |
| `integrations` | Credenciales cifradas por proveedor (ycloud/kapso/highlevel/openrouter); máx. 1 proveedor WhatsApp activo por workspace |
| `kb_documents` / `kb_chunks` | Knowledge base con embeddings (pgvector, `match_kb`) |
| `setter_configs` | Config del modo setter (preguntas, knockout rules, scoring) |
| `schedules` / `appointments` | Disponibilidad y citas (índice único con HL) |
| `agents` | Agentes IA por workspace (prompt, modelo, config, avatar) |
| `automation_rules` | Reglas trigger → acción (first_message, keyword_match, …) |
| `events` | Log de observabilidad/auditoría (tool_call, llm_usage, cost_cut, …) |
| `member_password_resets` | Resets de contraseña gestionados por admin |

Migraciones destacadas: RLS por workspace y hardening de funciones
(`search_path`, `SECURITY DEFINER`), guard de ventana 24h
(`trg_messages_24h_window`), RPCs atómicas del buffer
(`upsert_batch_and_link_message`, `claim_next_batch`), pgvector
(`match_kb`), pg_cron/pg_net, reservas de turnos/llamadas LLM
(`reserve_llm_turn`, `reserve_workspace_llm_call`), super admin, índices
únicos de reconciliación con HighLevel.

## Puntos de entrada y secretos

| Entrada | Auth |
| --- | --- |
| `/api/webhooks/ycloud?wsid=` | Firma HMAC con timestamp (300s) por workspace |
| `/api/webhooks/kapso?wsid=` | `X-Webhook-Signature` HMAC-SHA256 por workspace |
| `/api/webhooks/highlevel?wsid=&token=` | Token por workspace, comparación constant-time |
| `/api/cron/buffer-flush` | `Authorization: Bearer $CRON_SECRET` |
| `/api/internal/buffer/process` | `BUFFER_PROCESS_SECRET` |
| UI (todo lo demás) | Sesión Supabase vía `middleware.ts` + RLS |

Env vars: Supabase URL/anon/service_role, `OPENROUTER_API_KEY` +
`OPENROUTER_DEFAULT_MODEL`, `ENCRYPTION_KEY(+_VERSION)`, `CRON_SECRET`,
`BUFFER_PROCESS_SECRET`, `TYPESAFE_API_KEY` (Jev), `RESEND_API_KEY` +
`HANDOFF_NOTIFY_FROM` (aviso al equipo, opcional). YCloud/Kapso/HighLevel
**no** son env vars: se guardan cifrados por workspace en `integrations`.

## Comandos

```bash
npm run dev          # next dev --turbopack → http://localhost:3000
npm run build        # build de producción
npm run lint         # eslint src/ middleware.ts
npm run typecheck    # tsc --noEmit
npm run test:unit    # node --test sobre src/**/*.test.ts (Node ≥ 22.18)
npm run test:e2e     # Playwright
supabase test db     # pgTAP contra Supabase local (supabase start)
```

Showcase del design system en desarrollo: `http://localhost:3000/ui`
(reglas en `COMPONENT_RULES.md`).
