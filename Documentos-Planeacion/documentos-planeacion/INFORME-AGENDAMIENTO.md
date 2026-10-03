---
proyecto: 01 — Agente de WhatsApp
doc: informe de estado — Agendamiento
actualizado: 2026-10-02
relacionado: BRIEF.md §9, USER-STORIES-agente-whatsapp.md US-E6-4/US-E6-5, BLUEPRINT-agente-whatsapp.md §3.9/§5, INFORME-SETTER.md
---

# Informe de estado — Agendamiento

> **Agendamiento — toma y gestiona las citas.**
> Informe basado en el código tal como existe al 2026-10-02. Cada afirmación cita
> el archivo que la respalda.

## 1. Resumen ejecutivo

El Agendamiento está **implementado y es la parte más endurecida del producto**:
los dos caminos del BRIEF (link externo + directo en HighLevel) funcionan, la
gestión del ciclo de vida (listar, cancelar, reagendar) existe, y el manejo de
resultados inciertos es ejemplar — la IA nunca afirma una cita que no pudo
confirmar, y los casos ambiguos generan nota al equipo + handoff.

El gap conceptual principal: **el agendamiento no es un módulo propio sino tools
+ configuración**. La tabla `schedules` prevista en el modelo nunca se usa; la
config real vive en `tool_configs` (link) e `integrations` (calendario HL). No
hay superficie UI de citas para el equipo, ni recordatorios, ni sync de cambios
hechos directamente en HighLevel.

## 2. Arquitectura real

Las citas las "toman y gestionan" **tools del agente**, no un servicio dedicado:

| Pieza | Qué es | Archivo |
| --- | --- | --- |
| Tools del agente | 6 tools de citas (de 8 registradas en el registry, junto a `echo` y `handoff_human`); el LLM las invoca por tool-calling durante la conversación | `src/features/tools/index.ts`, `src/features/tools/tools/` |
| Lib compartida HL | `locateAppointmentAt` (found/not_found/ambiguous/unconfirmed/already_cancelled/not_active), `putHLEvent`, `recordLocally` (write-back del cache), `noteForTeam`, `parseConfirmedInstant`, presupuestos de tiempo | `src/features/tools/lib/hl-appointment.ts` |
| Zona horaria única | business info → HL location → default; todas las surfaces leen/escriben en ella | `src/features/inbox/services/scheduling-timezone.ts` |
| Datos | `appointments` (cache local, RLS, `hl_appointment_id` único por workspace) + catálogo `tools`/`tool_configs` + `integrations` (PIT, location, calendar_id, pipeline/stage) | `supabase/migrations/20260608000000_foundation.sql`, `20260930000005_appointments_hl_unique_index.sql` |

## 3. Estado por capacidad

| Capacidad | Estado | Evidencia |
| --- | --- | --- |
| Agendar por link externo (Cal.com/Calendly/otro) | ✅ Implementado | `schedule-link.ts` devuelve `scheduling_link` de `tool_configs`; UI de config en `tool-config-panel.tsx` (Settings → Tools → "Agendamiento (link)") |
| Consultar disponibilidad real | ✅ Implementado | `check-availability.ts` → GET `calendars/{id}/free-slots`; rango por días en la zona del workspace (`zonedDayRange`); parsing con criterio positivo — una respuesta no reconocida es error explícito, nunca "sin cupos" |
| Agendar directo en HighLevel | ✅ Implementado | `schedule-highlevel.ts` → POST `calendars/events/appointments`; upsert del contacto en HL (`upsertHLContactByPhone` + `linkHLContact`); rechaza fechas pasadas y offsets de otra zona; persiste en `appointments` (upsert por `workspace_id+hl_appointment_id`) |
| Listar citas del contacto | ✅ Implementado (beta) | `list-highlevel-appointments.ts` — HL es la fuente de verdad; declara `unreadable`/`more` en vez de fingir lista completa |
| Cancelar cita | ✅ Implementado (beta) | `cancel-highlevel.ts` — localiza la cita por el instante que el cliente confirmó, PUT `appointmentStatus: "cancelled"`, `recordLocally` |
| Reagendar cita | ✅ Implementado (beta) | `reschedule-highlevel.ts` — conserva la duración de la cita; `meta.rescheduled_from` detecta retries de un movimiento que sí se hizo |
| Manejo honesto de outcomes | ✅ Implementado | `UnknownOutcomeError` (write enviado sin respuesta → "ni se hizo ni falló, un humano confirma"); `SLOT_TAKEN` → verifica si es la propia cita del cliente (retry ≤10min → `already_booked`; cita previa → error honesto; ambiguo → `noteForTeam` + `needs_human`); `hasTimeToWrite`/`hasTimeToLookUp` impiden writes sin presupuesto |
| Handoff ante incertidumbre | ✅ Implementado | `needs_human` → el buffer hace handoff tras responder **solo para un allowlist hardcodeado** (`NEEDS_HUMAN_TOOLS`: las 3 writes de citas, `buffer.ts:547`); `noteForTeam` deja nota interna; `write_tools_ran` en `batch.meta` + `handOffAfterWrite`/`noteUnconfirmedWrites` avisan al equipo qué writes corrieron |
| Zona horaria consistente | ✅ Implementado | `scheduling-timezone.ts` — una sola zona para prompt, slots y tools; **el "ahora" del prompt usa la misma zona** (`buffer.ts:929` → `buildNowContext`, igual en test-chat), así que "hoy/mañana" del modelo coinciden con los slots; `zonedMidnight` de doble pasada cubre cambios de hora (días de 23/25h) |
| Calendario gobernado por admin | ✅ Implementado | `resolveCalendarId` (`calendar-id.ts`): el `calendar_id` del workspace siempre gana sobre el que el modelo mande — un LLM no puede agendar en un calendario no configurado |
| Toggle por workspace | ✅ Implementado | `tool_configs.enabled` vía Settings → Tools (`tools-catalog.tsx`, toggles solo admin/manager, badges lectura/escritura/sensible + "Beta"); `getEnabledTools` filtra por workspace (`tool-configs.ts`) |
| Observabilidad de citas | ⚠️ Parcial | Cada llamada loggea `tool_call` (con args sanitizados); los fallos dejan eventos dedicados `hl_appointment_failed` / `hl_appointment_unconfirmed` / `appointment_persist_failed` + `playground_write` en pruebas — pero **un booking exitoso no emite evento propio** (solo `tool_call` genérico) |
| Persistencia + RLS | ✅ Implementado | `appointments` con RLS; índice único `workspace_id+hl_appointment_id` (migración `20260930000005` deduplicó y lo hizo total) |
| Playground seguro | ✅ Implementado | `schedule_highlevel` en test-chat solo agenda al teléfono que el **tester escribió** en el chat, con traza `playground_write` previa al write; cancel/reschedule/list se niegan sin contacto real |
| Agente de agendamiento | ✅ Existe (prompt) | Tipo `agendamiento` en `agents` (backfill/onboarding, default "Andrés", prompt semilla de reservas); avatar propio en `public/avatars/` |
| Tests | ✅ Amplia cobertura | `hl-appointment-tools.test.ts` (~116 checks), `schedule-highlevel.test.ts` (~95), `check-availability.test.ts`, `calendar-id.test.ts`, `scheduling-timezone.test.ts`, `tool-configs.test.ts` |

## 4. Gaps vs spec (US-E6-4 / US-E6-5 / BRIEF §9)

| Acceptance criterion / spec | Estado real |
| --- | --- |
| "Link configurable por workspace/**campaña/agente**" | ⚠️ Solo por workspace: un único `scheduling_link` en `tool_configs.config` |
| "Si no hay link configurado: la tool no se ofrece y registra log" | ❌ La tool se ofrece siempre que esté `enabled` y **falla en runtime** ("No hay un link de agendamiento configurado"); el fallo queda en el log genérico `tool_call`, sin evento dedicado |
| "Registra el resultado en `appointments` + en la conversación" | ✅ `appointments` sí (upsert); la conversación lo registra el reply del agente + eventos `tool_call`; notas internas solo en fallos |
| Ciclo de vida de la cita (`confirmed`/`completed`/`no_show`) | ⚠️ Los estados existen en el CHECK de la tabla y se reflejan desde HL en lecturas, pero **nada los transiciona** ni actúa sobre ellos (sin confirmaciones, sin recordatorios, sin no-show follow-up) |
| Recordatorios de cita | ❌ No existen — ni cron ni tool; la landing/demo prometen "te llegará un recordatorio" que no está implementado |
| Vista de citas para el equipo | ❌ Ninguna UI ni API lee `appointments`; el equipo ve citas solo en HighLevel o como eventos/notas sueltas |
| Cambios hechos en HL → producto | ❌ El webhook `/api/webhooks/highlevel` solo procesa eventos `Contact*`; mover/cancelar en HL no actualiza el cache hasta que una tool lo lea |
| "Qué tools puede usar cada agente" (BRIEF §7) | ⚠️ `getEnabledTools(workspaceId)` es por workspace — el agente soporte puede agendar si la tool está activa |
| Confirmación humana previa al booking (US-E6-3) | ⚠️ Decisión de diseño: las tools de citas son `sensitivity='write'` — corren sin aprobación humana (la confirmación la da el cliente en la conversación); solo `sensitive` pide aprobación. El write sin respuesta NO se reintenta y se reporta como incierto |
| `schedules` (modo external_link/highlevel) | ❌ Schema muerto — ningún código la lee/escribe; `appointments.schedule_id` queda siempre NULL |

**Detalles menores:**

- Título de la cita fijo: `"Cita — {nombre}"`; sin notas, ubicación ni tipo de cita configurables.
- `enabledFor: () => true` en todas las tools — el gate real es `tool_configs`.
- En `schedule_link` el link es texto libre (sin validación de que sea URL al invocarla; el panel sí valida con `scheduleLinkConfigSchema`).

## 5. Dependencias de configuración para producción

1. Activar las tools en Settings → Tools (por workspace): `schedule_link` y/o `schedule_highlevel` + `check_availability`; las 3 de gestión están en beta.
2. **Link:** guardar `scheduling_link` en el panel de config de la tool.
3. **Directo HL:** PIT + `location_id` + `calendar_id` en Settings → Integrations (la UI avisa si falta el Calendar ID).
4. Timezone: Settings → Negocio (`structured.timezone`) o la zona de la location de HL.
5. El contacto en una conversación real se agenda por sí mismo; en el playground hay que escribir el teléfono de prueba en el chat.

## 6. Recomendaciones priorizadas

**P1 — completan "gestiona las citas" de verdad:**

- Vista de citas para el equipo (lista en inbox/CRM o sección en dashboard leyendo `appointments`).
- Recordatorios pre-cita (cron + template Meta fuera de ventana) y transición de estados (`confirmed`/`no_show`).
- `schedule_link`: no ofrecer la tool sin link configurado (o mover el check a `enabledFor`), y links por agente/campaña si el spec se mantiene.
- Sync de citas desde HL: aceptar eventos de appointment en el webhook (hoy solo `Contact*`).

**P2 — completitud del spec:**

- Resolver el destino de `schedules` (usarla como config canónica o deprecarla) y poblar `appointments.schedule_id`.
- Gating de tools por agente (setter vs soporte vs agendamiento) si BRIEF §7 sigue vigente.
- Campos de la cita configurables (título, duración, notas) — hoy el título es fijo y la duración la decide HL.
- `appointment_status` observability: evento propio `appointment_booked` (hoy solo `tool_call` genérico + notas en fallos).
