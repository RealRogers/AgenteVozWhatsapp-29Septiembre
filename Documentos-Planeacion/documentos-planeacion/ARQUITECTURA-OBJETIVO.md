---
proyecto: 01 — Agente de WhatsApp
doc: arquitectura objetivo + arranque
actualizado: 2026-06-08
relacionado: BRIEF.md
---

# Arquitectura objetivo — cómo queda hecho y cómo arrancar

> Complementa `BRIEF.md`. El brief dice *qué* (producto + módulos); esto dice *cómo se ve terminado*,
> *qué data model* y *qué se hace el día 1*.
> Referencia técnica: `clients/movinsa/` — repo con la **conexión real a YCloud** (shapes de payload, gotchas, buffer n8n). Se usa SOLO como referencia; **NO es un tenant del producto**.

---

## 1. Cómo se ve cuando está hecho

Una **plataforma de inbox conversacional para WhatsApp con IA** (Next.js + Supabase, **YCloud-only**),
**multi-tenant por workspace**, operable por humano y configurable por web sin tocar código.
Producto **genérico multi-tenant** (no atado a ningún negocio). El repo `clients/movinsa` se usa solo como
**referencia** de cómo se conecta YCloud en producción (shapes, gotchas, buffer).

### Runtime (de la entrada del mensaje a la respuesta)

```
WhatsApp (YCloud)
        │  webhook inbound
        ▼
[1] Ingress + Normalizador     → evento unificado {workspace, from, type, text|media, ts, wamid}
        ▼
[2] Buffer / debounce ⭐        → agrupa por SILENCIO del usuario (no por 1er mensaje);
        │                         junta texto + audio transcrito + captions; reglas por tipo; logs de batch
        ▼
[3] Motor de DECISIÓN           → ¿responder? ¿esperar más? ¿usar tool? ¿modo setter? ¿etiquetar?
        │                         ¿handoff a humano? ¿abstenerse (fuera de ventana / baja confianza)?
        ▼
[4] Agent runtime (OpenRouter)  → prompt resuelto (workspace > número > campaña > segmento > modo)
        │        ▲                + variables dinámicas + tool-calling + guardrails + ventana 24h
        │        │ tools
        ▼        │
[5] Capa de Tools (adapter) ◄───┘  interfaz común; impl: KB search · HighLevel · agenda · etiquetar ·
        │                          validar ventana · elegir template · transferir a humano · webhook custom
        ▼
[6] Salida YCloud               → texto (sesión <24h) | template aprobado (fuera de ventana)
        ▼
[7] Persistencia + Observabilidad (Supabase) → todo el log de la decisión (ver BRIEF §17)

   [estado] State machine de la conversación (transversal):
   IA activa · Humano activo · Handoff pendiente · Esperando respuesta · Pausada/snoozed · Cerrada
```

### Superficies del dashboard
- **Inbox** estilo WhatsApp Web (Supabase realtime): lista + hilo + composer + toggle IA/humano + ventana 24h + handoff + notas internas + CRM lateral.
- **Settings** (14 secciones, ver BRIEF §15): WhatsApp/YCloud · Templates Meta · OpenRouter · Business info · Prompting · Tools · KB · Setter · Scheduling · HighLevel · Automation rules · Handoff · Team/roles · Logs.
- **Onboarding wizard**: modo → datos empresa → YCloud → (opc) HighLevel/OpenRouter → activo.

### Modelo de datos (Supabase, objetivo)
`workspaces` · `users` + `roles`/`permissions` · `contacts` (CRM: tags, custom_fields, stage, owner, hl_id) ·
`conversations` (estado, asignado, ventana_24h, canal) · `messages` (in/out, tipo, media, wamid, batch_id) ·
`message_batches` (buffer) · `business_info` (estructurado + libre) · `prompts` + `prompt_versions` (draft/published) ·
`tools` + `tool_configs` (por workspace, credenciales, enabled) · `kb_documents` + `kb_chunks` (pgvector) ·
`templates` (estado Meta, componentes, idioma) · `setter_configs` (preguntas, knockout, score) ·
`schedules`/`appointments` · `integrations` (HighLevel, OpenRouter) · `logs`/`events` (observabilidad).

### La pieza clave: la **capa de Tools** (extensible por workspace)
Interfaz `Tool` única. Para el producto: KB / HighLevel / agenda / Supabase. Cualquier workspace con sistemas
externos propios (n8n, Make, API) los conecta con un adapter **`custom_webhook`** (URL configurada por workspace,
server-side), sin reescribir el motor.

```ts
interface Tool {
  name: string;
  description: string;          // para el tool-calling del LLM (vía OpenRouter)
  schema: ZodSchema;            // args
  enabledFor(workspace): bool;  // activable por workspace
  run(args, ctx): Promise<ToolResult>;   // ctx: workspace, conversation, contact, credenciales
}
// HighLevel: run() => fetch(API HighLevel)         // integración oficial v1
// Custom:    run() => fetch(webhook externo del workspace) // adapter configurable por tenant
// Curso:     run() => supabase / cal.com / etc.
```

---

## 2. Cómo arrancar HOY (día 1, sesión dedicada)

> Se construye en su propia sesión **Claude Code + Forge**, en `01-agente-whatsapp/codigo/` (repo independiente).
> El repo `clients/movinsa` es **solo referencia** — no se mezcla su código; de ahí se toman los shapes/gotchas reales de YCloud.
> Estrategia: **MVP del camino feliz primero**, luego capas (buffer inteligente, handoff, setter, templates, HighLevel).

1. **Scaffolding** con Forge (`forge init` en `codigo/`): Next.js + Tailwind + Supabase + shadcn.
2. **Docs oficiales** (mapear endpoints): **YCloud** (inbound webhook, send message, templates, media, status) · **OpenRouter** · **HighLevel**. → *Ya tenemos el shape real del inbound YCloud* (ver §3), reusarlo.
3. **Schema Supabase mínimo** → crecer al modelo de §1: arrancar con `workspaces`, `contacts`, `conversations`, `messages`, `prompts`, `tool_configs`, `templates`.
4. **Contrato `Tool`** + 1 tool de referencia (p.ej. `obtenerInfoCliente` stub).
5. **Camino feliz**: webhook → normalize → **OpenRouter** (sin buffer aún) → reply YCloud, **solo texto**. Audio/imagen/PDF/reacciones después.
6. **Inbox MVP**: lista de conversaciones + hilo (Supabase realtime) + **toggle IA/humano**.
7. **Capas siguientes**: buffer inteligente (§BRIEF 2) → state machine + handoff (§BRIEF 3) → ventana 24h + templates como guardrail duro (§BRIEF 10) → HighLevel (§BRIEF 13) → setter (§BRIEF 8).
8. **Recién con MVP**: onboarding del primer workspace productivo vía el wizard (no requiere código tenant-específico).

---

## 3. Reusar de lo ya construido (no reinventar)

- **Shape inbound YCloud** (confirmado en el agente n8n de Movinsa):
  ```
  body.whatsappInboundMessage = { from:"+507…", to:"+50763440979", type:"text|audio|image",
                                  text:{ body }, customerProfile:{ name }, wamid, … }
  ```
- **Payload de envío de plantilla** YCloud (`POST https://api.ycloud.com/v2/whatsapp/messages`,
  header auth): idioma `es` (NO `es_PA`), components/body parameters planos.
- **6 plantillas aprobadas** + variables (tabla Airtable `Plantillas WhatsApp`).
- **Webhooks n8n como tool endpoints**: patrón de integración externa, expuesto vía la tool `custom_webhook` (cualquier workspace, no hardcodeado).
- **Gotchas ya documentados**: ventana 24h, normalización de celular (a veces sin `+`), `es` no `es_PA`.

**Lo que NO se reusa (se deja morir en n8n):** el buffering vía Redis (lo rehacemos **en código y más inteligente**,
ver BRIEF §2), los lookups que devuelven IDs (en código se resuelve directo), y el spaghetti de 56–62 nodos del agente n8n.

---

## 4. Decisiones para la sesión dedicada

- **LLM → OpenRouter** (gateway). Modelo seleccionable por workspace y por tarea (clasificación vs respuesta),
  fallback model, límites de costo, métricas de tokens/costo por conversación. (Supera la antigua duda Claude-vs-OpenAI:
  con OpenRouter se rutea a cualquiera, incl. Claude.)
- **Integración oficial v1 → HighLevel (only)**: contacto, tags, oportunidad, **cita directa**, webhooks. Las tools de
  integraciones externas de cualquier workspace usan la tool `custom_webhook` sobre la misma capa `Tool`.
- **Buffer/debounce inteligente**: agrupar por **silencio del usuario**, juntar texto+audio+captions, reglas por tipo, bypass.
- **Cumplimiento Meta como guardrail duro**: fuera de ventana se **bloquea** free text y se obliga template (override admin con warning).
- **Multi-tenant (workspace)**: diseñar siempre multi-tenant; cada workspace aísla su config, prompts, tools, KB y datos.
- **Cutover de número**: un número WhatsApp = un webhook destino. Al migrar un número desde un sistema previo
  (p.ej. un flujo n8n), el cambio es de golpe; un **filtro whitelist** permite probar en paralelo de forma segura.
- **Roles v1**: Admin · Manager · Agent · Viewer (permisos en BRIEF §16).
