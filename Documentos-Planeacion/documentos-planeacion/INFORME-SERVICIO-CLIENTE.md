---
proyecto: 01 — Agente de WhatsApp
doc: informe de estado — Servicio al cliente
actualizado: 2026-10-02
relacionado: BRIEF.md §12/§14, USER-STORIES-agente-whatsapp.md US-E3-1..6, BLUEPRINT-agente-whatsapp.md §4.7, INFORME-AGENDAMIENTO.md, INFORME-SETTER.md
---

# Informe de estado — Servicio al cliente

> **Servicio al cliente — responde dudas, da información y escala a un humano
> cuando es necesario.**
> Informe basado en el código tal como existe al 2026-10-02. Cada afirmación cita
> el archivo que la respalda.

## 1. Resumen ejecutivo

El Servicio al cliente **es el loop central del producto, no un módulo aparte**:
es la combinación del agente `soporte` (Sofía) + la cadena de ensamblado del
prompt (KB semántica + business info + historial + media) + la maquinaria de
handoff. Las tres patas del verbo del spec están cubiertas y endurecidas:

- **Responde dudas / da información:** cada turno arma un prompt con la base de
  conocimiento por similitud semántica (pgvector), la info estructurada del
  negocio, el resumen rodante y los últimos N mensajes — todo por el mismo
  builder canónico que usa el playground.
- **Escala a humano:** existen **seis caminos** hacia `handoff_pending` que
  convergen en un único choke point (`applyTransition`), con ACK al cliente,
  email al equipo (opt-in) y alertas en la UI.

El gap conceptual principal: **los triggers de escalado son hardcodeados u
opt-in** — las frases clave viven en código, la detección de baja
confianza/objeción/enojo solo existe vía el juez Jev (que requiere flag por
workspace y una API key de plataforma), y la propia tool `handoff_human` viene
deshabilitada de fábrica.

## 2. Arquitectura real

### 2a. "Responde dudas" — la cadena de ensamblado del turno

Cada batch de mensajes pasa por esta cadena en `buffer.ts` (§6–§9):

| Pieza | Qué hace | Archivo |
| --- | --- | --- |
| Decisión | Estado → `abstain` si no es `ai_active`; keyword de handoff → transición directa; `reserveLlmTurn` (20 turnos/h por contacto) | `src/features/inbox/services/decision-engine.ts` |
| Jev | Juez LLM opt-in (key de plataforma): puede suprimir la respuesta, mover el stage del contacto o derivar a humano | `src/features/jev-judge/apply.ts`, `map-judgment.ts`, `uses.ts` |
| Provider + presupuesto | Exige provider WhatsApp activo; `enforceCostPolicy` corta o degrada el modelo | `buffer.ts:837–866`, `cost-enforcer.ts` |
| Prompt | `resolveSystemPrompt` por modo del agente (mode→segment→campaign→number→global, solo `published`); `buildSystemPrompt` ordena: now→summary→biz→KB→style→base→formato WA→media→guardrails→tool-honesty | `prompt-resolver.ts`, `prompt-builder.ts` |
| Contexto | `getBusinessInfo` (structured + free_text), `searchKb` top-3, `listKbSourceLinks`, `getConversationHistory` (ventana 5–50, default 10), `conversations.summary` | `business-info.ts`, `kb-service.ts`, `conversation-history.ts` |
| Modelo | `getWorkspaceModel` → `enforceModelPolicy` (o el modelo degradado por presupuesto); `generateWithTools` con las tools habilitadas | `openrouter.ts` |

La misma cadena corre en el playground (`test-chat`), que además cede writes
solo a `admin` — un manager solo prueba tools `read`.

### 2b. "Escala a un humano" — los seis caminos a `handoff_pending`

Todos los caminos convergen en `applyTransition` (`decision-engine.ts:140`) — el
único punto que valida la transición en `state-machine.ts`, pone
`ai_enabled=false` y emite `state_change` + notificaciones:

| # | Camino | Gatillo | Evidencia |
| --- | --- | --- | --- |
| 1 | **Keyword** | `detectsHandoffTrigger(mergedText)` pre-LLM — 11 frases hardcodeadas ("hablar con", "agente humano", "persona real", "operador"...), normalización NFD | `state-machine.ts:82–94`, `decision-engine.ts:76` |
| 2 | **Tool `handoff_human`** | El agente la invoca (`customer_request`/`agent_stuck`); la tool es `read` — no escribe; el buffer captura `pending_handoff` en meta, envía la despedida y luego transiciona | `tools/handoff-human.ts`, `buffer.ts:1010–1022, 1378` |
| 3 | **Write incierto** | `needs_human` en las 3 tools de citas → `tool_failed`; cualquier write sin resultado → `write_unconfirmed`; write + turno sin reply → `handOffAfterWrite` | `buffer.ts:544–551, 1076–1108` |
| 4 | **Jev** | Veredicto `handoff` (p.ej. `autoReplyProbability ≤ 0.5` → regla `respond-sin-redactor`) | `jev-judge/apply.ts:120`, `map-judgment.ts:55–63` |
| 5 | **Manual** | `POST /handoff` (request→pending, cancel→ai_active); `POST /take` (pending→human_active + asigna actor); `PATCH /toggle-ai` (ai_active↔human_active) | `app/api/conversations/[id]/handoff|take|toggle-ai` |
| 6 | **Cost cut** | `cost_cut_handoff` opt-in cuando `enforceCostPolicy` dice `cut` | `buffer.ts:850–865` |
| 7 | **Dead-letter** | Tras `MAX_BATCH_RETRIES` sin respuesta, `deadLetter()` **deriva la conversación a una persona** (`trigger: "batch_dead_letter"`), deja nota interna ("La IA no pudo responder… Atiéndelo tú") y evento `batch_dead_letter` antes de cancelar el batch | `buffer.ts:1657–1691` |
| + | **Setter** | `post_action: "handoff"` en lead calificado → `applyTransition` | `buffer.ts:1924` |
| + | **Sleep-on-manual** | Un humano que responde desde el inbox mueve la conversación a `human_active` (config `sleepOnManualMessage`, default on) | `app/api/conversations/[id]/messages/route.ts:75–93`, `media/route.ts:124` |
| + | **Handoff re-queued** | Si `applyTransition` falla, el batch se re-encola con backoff propio (`handoff_attempts`, `pending_handoff` persisten); el fallo se reporta como `handoff_failed` solo en el último intento | `buffer.ts:1442–1554` |

### 2c. Post-handoff — qué pasa al entrar en `handoff_pending`

`applyTransition` → `notifyHandoffPending` (`handoff-notifier.ts`), con dos
superficies:

- **Al cliente (ACK):** `handoff_ack_enabled`/`handoff_ack_message` (default ON,
  texto "Gracias por escribir. En un momento te atiende un asesor."). Dedupe de
  15 min por `handoff_ack_sent`; se **omite** si el agente ya envió su despedida
  (`trigger` prefijado `tool:`); `WINDOW_EXPIRED`/`OPT_OUT` se registran como
  `info`, no incidente. Eventos: `handoff_ack_sent`/`handoff_ack_skipped`/
  `handoff_ack_failed`.
- **Al equipo (email):** `notifyTeamHandoff` — opt-in `handoff_team_email` en la
  config de WhatsApp; Resend (`RESEND_API_KEY` + `HANDOFF_NOTIFY_FROM`); dedupe
  15 min y tope 10 avisos/hora por workspace; destinatarios = miembros activos
  con rol `admin`/`manager`/`agent` (viewer excluido); `describeTrigger`
  traduce el motivo al español en el correo. Eventos: `handoff_team_notified`/
  `handoff_team_notify_skipped`.
- **Aviso por WhatsApp al equipo: deliberadamente no implementado** — los
  números del equipo nunca abren ventana 24h, así que Meta exigiría un template
  HSM aprobado por WABA verificada. Comentario en `handoff-notifier.ts:12–16`.

UI del lado humano: contador `(N)` en el título de la pestaña +
`Notification` nativa del navegador al entrar `handoff_pending`
(`use-handoff-alerts.ts`), badge por estado en lista e hilo
(`state-badge.tsx`), filtro "Handoff" en la lista (`inbox-layout.tsx:28`),
botones "Solicitar handoff" / "Tomar" / "Devolver a IA" (`chat-thread.tsx`),
y el menú de acciones (cerrar/reabrir/asignar/tags/prioridad).

**Reapertura automática:** un inbound sobre una conversación `closed` la
devuelve a `ai_active` (mejor-esfuerzo — el mensaje se persiste aunque la
transición falle), así que un cliente que vuelve a escribir reactiva a la IA
sin intervención del equipo (`normalizer.ts:130–149`).

## 3. Estado por capacidad

| Capacidad | Estado | Evidencia |
| --- | --- | --- |
| Agente "Soporte" como tipo | ✅ Implementado | `agent_type` enum con `soporte`; seed "Sofía" + prompt "Responde dudas con precisión y empatía…" (migración `20260609000003_agents.sql:95`, `onboarding-actions.ts`, `agent-meta.ts`) |
| Responder dudas con KB | ✅ Implementado | `kb_documents` + `kb_chunks` (vector 1536, pgvector); chunking 500/50; embeddings `openai/text-embedding-3-small` vía OpenRouter; `match_kb_chunks` RPC top-3 + fallback SQL | 
| Dar información del negocio | ✅ Implementado | `business_info` (structured + free_text) inyectada en el prompt; Settings → Negocio |
| Compartir links de referencia | ✅ Implementado | `listKbSourceLinks` + `formatKbReferenceLinks` — el agente puede citar la página real, no solo el chunk |
| Citación de la fuente | ⚠️ Parcial | Los chunks viajan con `[Fuente: {título}]` en el prompt — el modelo puede mencionarla, pero **no hay trazabilidad en UI ni en `events`** (BRIEF §12) |
| Historial + memoria | ✅ Implementado | `message_history_window` 5–50 (default 10); `conversations.summary` rodante; `now` DST-safe en la zona del workspace |
| Audios/imágenes entrantes | ✅ Implementado | `media-understanding.ts` transcribe audio y describe imágenes; el prompt aclara al modelo que ya los "leyó" |
| Responder solo si procede | ✅ Implementado | `decide()` abstiene si `state !== ai_active`; reserva turno antes de generar (20/h por contacto); presupuesto diario corta o degrada |
| Escalar cuando el cliente pide humano | ✅ Implementado | Keyword pre-LLM (11 frases) + tool `handoff_human` + despedida + transición + ACK |
| Escalar cuando la IA no puede | ⚠️ Parcial | `handoff_human` (`agent_stuck`) + writes inciertos + Jev opt-in — pero **sin detector de confianza/objeción/enojo en el core** (ver §4) |
| Handoff manual del operador | ✅ Implementado | `request`/`cancel`/`take`/`toggle-ai` con auth por rol; `sleep-on-manual` al responder |
| Aviso al equipo | ✅ Implementado | Email opt-in (Resend, dedupe, cap 10/h) + contador en pestaña + notificación nativa del navegador |
| ACK al cliente | ✅ Implementado | Configurable por workspace, dedupe 15 min, omite si ya hubo despedida |
| Máquina de estados | ✅ Implementado | 6 estados, transiciones validadas, `ai_enabled` invariante, `state_change` en `events` — choke point único |
| Notas internas del equipo | ✅ Implementado | `noteForTeam` / `noteUnconfirmedWrites` / `addInternalNote` dejan contexto al humano que toma; ruta `/api/conversations/[id]/notes` para notas manuales |
| Opt-out del contacto | ⚠️ Parcial | `contacts.opt_in=false` bloquea todo envío (`OPT_OUT` en `dispatch.ts`) y Jev detecta intención de baja → `abstain` + stage `lost` — pero **no hay detector de "stop"/"baja" por keyword** (comentario `future work` en `normalizer.ts:67`) |
| Reapertura de conversación | ✅ Implementado | Inbound sobre `closed` → `ai_active` automático (`normalizer.ts:134`); `reopen` manual del operador → `human_active` con el actor asignado |
| Observabilidad | ⚠️ Parcial | `state_change`, `handoff_ack_*`, `handoff_team_*`, `handoff_failed`, `jev_judgment`, `tool_call`, `batch_retry_transient`, `batch_dead_letter` — pero **no hay evento `decision`** (US-E3-4) ni trazabilidad KB |
| Auto-tag / resumen | ✅ Opt-in (v1.5) | `maybeAutoProcess` post-reply con modelo barato (`autoTag`/`summarize` en `agent.config`) |
| Panel avanzado de soporte | ❌ No existe | La tab "Avanzado" solo aparece para `agent.type === "setter"` (`agent-config-sheet.tsx:130,263`) — soporte solo tiene prompt/modelo/avatar/estilo/sleep/etag |
| Tests | ✅ Amplia cobertura | `state-machine.test.ts`, `decision-engine.test.ts`, `handoff-notifier.test.ts`, `team-notifier.test.ts`, `use-handoff-alerts.test.ts`, `buffer.test.ts` (handoff paths), `jev-judge/*` |

## 4. Gaps vs spec (US-E3 / BRIEF §12/§14 / BLUEPRINT §4.7)

| Acceptance criterion / spec | Estado real |
| --- | --- |
| "Los triggers de escalado son **configurables por workspace**" (US-E3-3) | ❌ `HANDOFF_PHRASES` es una lista hardcodeada en `state-machine.ts` — sin UI ni config por tenant |
| "Baja confianza / objeción / enojo" como triggers (BLUEPRINT §4.7.2, BRIEF §76) | ⚠️ Solo vía **Jev** (opt-in `jev_enabled` + `TYPESAFE_API_KEY` de plataforma): `autoReplyProbability ≤ 0.5` deriva y el cutoff de `actionConfidence` suprime — el motor principal **no clasifica** confianza ni sentimiento |
| "La decisión y su razón se registran en `events type='decision'`" (US-E3-4) | ❌ `decide()` solo hace `console.info("[buffer] not responding:", decision, reason)` — la decisión no se persiste salvo el `state_change` si hay transición |
| "Se abstiene si no hay confianza suficiente o falta contexto" (US-E3-4) | ⚠️ Abstiene por estado/rate-limit/cost-cut, no por confianza — salvo el veredicto Jev opt-in |
| `handoff_human` disponible para escalar | ⚠️ La tool está en el catálogo pero **`tool_configs.enabled=false` por defecto** — un workspace que nunca abre Settings → Tools deja al agente sin su vía de escape, aunque el prompt diga "ofrece escalar" |
| `waiting_reply` / `paused` como estados operativos | ⚠️ Declarados en la máquina y en badges/filtros, pero **ningún código de runtime los escribe** — `waiting_reply` (el `awaiting_reply` del Blueprint §4.7.3) y `paused` son estados muertos |
| KB: "versionado · activación por workspace/agente · prioridad entre KB/prompt/tools · citación/trazabilidad · fallback" (BRIEF §12) | ⚠️ Ingesta + búsqueda + borrado sí; **versionado no, activación por agente no, prioridad fija** (KB va antes del prompt base), citación solo implícita en el prompt, y el fallback es `[]` silencioso — sin evento de "KB sin respuesta" |
| Umbral de relevancia KB | ❌ `match_kb_chunks` devuelve top-3 **sin corte de similitud** — chunks irrelevantes entran al prompt si la KB está vacía de ese tema |
| Notificación del equipo por WhatsApp | ❌ Deliberadamente no implementada — sin ventana 24h para números del equipo; requeriría HSM aprobado |
| Asignación/SLA del handoff | ❌ `handoff_pending` queda **sin dueño** hasta que alguien presiona "Tomar"; sin rotación, sin re-escalado por tiempo, sin SLA |
| "Motor de decisión" como concepto (BRIEF §14) | ⚠️ `decide()` es thin — estado + keyword + rate limit. Las decisiones ricas (tools, confianza, abstenerse sin ventana) las hacen `buffer.ts` + el modelo, no un motor explícito |

**Detalles menores:**

- `detectsHandoffTrigger` corre sobre el batch fusionado — un quote de otro
  mensaje ("él me dijo: quiero hablar") también dispara; es la opción
  conservadora deliberada.
- `paused`/`waiting_reply` existen en `state-badge`/`dashboard-metrics` como
  etiquetas — la UI está lista, el runtime no las usa.
- El ACK de handoff usa el texto de `DEFAULT_HANDOFF_ACK` si el workspace no
  personaliza — y ese default **no menciona horario ni nombre del negocio**.
- `rate_limited` (20 turnos/hora por contacto agotados) deja al cliente **en
  silencio** hasta que se libera un slot — sin ACK ni handoff; es un corte de
  costo deliberado, pero invisible para el contacto.
- Las tools habilitadas son **por workspace, no por agente** — la `soporte`
  puede agendar o lanzar cualquier write que el workspace tenga activo (ver
  INFORME-AGENDAMIENTO §4, "qué tools puede usar cada agente").
- En el playground `handoff_human` corre (es `read`) y el agente redacta la
  despedida, pero **no hay transición real** — el test-chat no crea
  conversación; sirve para probar el texto, no el handoff.

## 5. Dependencias de configuración para producción

1. **`handoff_human` habilitada** en Settings → Tools (default OFF) — sin ella el
   agente solo puede *decir* que escala, no *hacerlo*.
2. **Config de WhatsApp** (`integrations.config`):
   `handoff_ack_enabled`/`handoff_ack_message`, `handoff_team_email`,
   `cost_cut_handoff`, `jev_enabled` + `jev_stage`/`jev_reply`/`jev_opt_out`,
   `message_history_window`, `buffer_silence_seconds`.
3. **Env de plataforma:** `OPENROUTER_API_KEY` (reply + embeddings KB +
   evaluador — key de plataforma, no por workspace), `RESEND_API_KEY` +
   `HANDOFF_NOTIFY_FROM` (email del equipo), `TYPESAFE_API_KEY` (Jev).
4. **Provider WhatsApp activo** — `buffer.ts` §7b lo exige antes de llamar al
   modelo (sin provider ni siquiera se gasta el turno); el envío en sí —
   respuesta o ACK — pasa por el guard de ventana 24h en `dispatchText`
   (fuera de ventana → nota interna, nunca texto libre).
5. **KB poblada** — `kb_documents` con contenido (o URLs) para que `searchKb`
   aporte; sin documentos el agente responde solo con prompt + business info.

## 6. Recomendaciones priorizadas

**P1 — cerrar la promesa "escala a un humano":**

- Habilitar `handoff_human` por defecto al sembrar el workspace (o warning
  visible en Settings → Tools si está apagada) — el agente `soporte` la
  necesita para cumplir su propio prompt.
- Mover `HANDOFF_PHRASES` a config por workspace (en `integrations.config`,
  junto al resto del handoff) — hoy es la única pieza del flujo que un admin
  no puede tocar.
- Emitir `events type='decision'` con la razón de `decide()` (y los triggers
  de Jev) — US-E3-4 lo exige y hoy la única traza es `console.info`.
- Resolver el destino de `waiting_reply`: activarlo tras cada reply de la IA
  (es el `awaiting_reply` del Blueprint) o deprecarlo del enum junto a
  `paused`.

**P2 — completitud del spec:**

- Detector de confianza propio en `decide()` (o activar Jev por defecto y
  anunciar el coste) para cubrir "baja confianza/objeción/enojo" sin depender
  del opt-in.
- Auto-asignación de `handoff_pending` (round-robin por rol/presencia) + SLA
  de re-escalado si nadie toma en N minutos.
- KB: versionado de documentos, umbral de similitud configurable, y evento
  `kb_search` (hits/miss) — hoy la búsqueda es invisible en `events`.
- Panel avanzado de soporte (temas permitidos, políticas de escalado, tono)
  simétrico al del setter.
- `handoff_ack_message` con variables (`{{business_name}}`, horario) — el
  default actual es genérico.
