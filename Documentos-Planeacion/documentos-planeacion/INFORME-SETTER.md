---
proyecto: 01 — Agente de WhatsApp
doc: informe de estado — Setter
actualizado: 2026-10-02
relacionado: BRIEF.md §8, USER-STORIES-agente-whatsapp.md US-E7-3, BLUEPRINT-agente-whatsapp.md §3.9/§4.3
---

# Informe de estado — Setter

> **Setter — califica y agenda leads, y mueve al prospecto por el embudo.**
> Informe basado en el código tal como existe al 2026-10-02. Cada afirmación cita
> el archivo que la respalda.

## 1. Resumen ejecutivo

El Setter está **funcional end-to-end a nivel workspace**: existe el agente, la
configuración (preguntas, knockout, scoring, post-action), el evaluador LLM
integrado al pipeline de mensajes, el movimiento de etapa del contacto en el CRM
interno y la creación de oportunidad en HighLevel.

El gap conceptual principal: **las preguntas configuradas no guían la
conversación** — alimentan únicamente un evaluador *post-hoc* que puntúa el
transcript después de cada respuesta. El agente setter solo "hace las preguntas"
si su prompt libre se lo indica. La decisión `apply_setter` del Blueprint §4.3.2
nunca se implementó; el decision engine real (respond / handoff / abstain /
rate_limited) no conoce el modo setter.

## 2. Qué es el Setter en el código

Dos piezas separadas que se combinan en runtime:

| Pieza | Qué es | Archivo |
| --- | --- | --- |
| Agente `type='setter'` | Uno de los 3 agentes por workspace (setter/soporte/agendamiento), con nombre, avatar, modelo y prompt propios. Exactamente uno activo por workspace (índice único parcial `uq_agents_one_active`). El setter se crea activo por defecto en el backfill y en onboarding. | `supabase/migrations/20260609000003_agents.sql` |
| `setter_configs` + evaluador | Config de calificación (preguntas con peso, knockout rules, umbral, post-action) + `evaluateLead`, que puntúa el transcript con salida estructurada (`generateObject` + zod). | `supabase/migrations/20260608000000_foundation.sql` (§setter_configs), `src/features/inbox/services/setter.ts` |

## 3. Estado por capacidad

| Capacidad | Estado | Evidencia |
| --- | --- | --- |
| Agente setter (identidad, modelo, prompt versionado, avatar, test chat) | ✅ Implementado | `agents` table + `set_active_agent` RPC; `src/features/agents/` (`agent-config-sheet.tsx`, `guided-prompt-editor.tsx`, `test-chat-panel.tsx`, `agent-meta.ts` — tagline "Califica leads y agenda citas") |
| Config UI (toggle, preguntas, knockout, scoring, post-action) | ✅ Implementado | Tab "Avanzado" solo visible cuando `agent.type === "setter"` en `agent-config-sheet.tsx`; `setter-advanced-config.tsx` con empty/loading/error states |
| API CRUD de `setter_configs` | ✅ Implementado | `src/app/api/workspace/[id]/setter/route.ts` — GET (miembro), POST/PATCH (admin/manager), validación zod, PATCH verifica pertenencia al workspace |
| Evaluación LLM estructurada (score + knockout + resumen) | ✅ Implementado | `evaluateLead` en `setter.ts` — `generateObject` vía OpenRouter (`OPENROUTER_SETTER_MODEL` o `openai/gpt-4o-mini`), reconcile: knockout ⇒ no calificado, si no `score ≥ threshold` |
| Integración en el pipeline de mensajes | ✅ Implementado | `buffer.ts` §9c: corre tras despachar la respuesta, solo si el agente activo es setter y `!jev.ownsStage`; awaited (no fire-and-forget) para que el post-action sobreviva al freeze serverless; nunca lanza al batch |
| Idempotencia y control de costo | ✅ Implementado | No re-evalúa si `lead_qualified` o `setter_knocked_out`; debounce a máx. 1 eval cada 2 turnos de usuario (`setter_eval_turns`) |
| Movimiento por el embudo (interno) | ✅ Implementado | `contacts.stage` (enum `new → engaged → qualified → customer → lost`): knockout → `lost`, calificado → `qualified`, nunca degrada `customer`. Edición manual en `crm-panel.tsx` |
| Movimiento por el embudo (HighLevel) | ✅ Implementado | `post_action: create_hl_opportunity` → `createHLOpportunity` usa pipeline/etapa configurados del workspace y loggea `setter_post_action` / `setter_post_action_failed` |
| Otras post-actions | ✅ Implementado | `handoff` (transición `handoff_pending`), `add_tag` (+ sync a HL), `send_template` (vía `dispatchTemplate`) |
| Agenda (agendar citas) | ✅ Implementado como tools | `schedule_link` (link en `tool_configs.config.scheduling_link`), `schedule_highlevel` (booking directo HL + persistencia en `appointments` con `hl_appointment_id` único), `check_availability`; `reschedule/cancel/list_highlevel_appointments` en **beta** (off por defecto). Disponibles para el agente por tool-calling si están habilitadas |
| Observabilidad | ⚠️ Parcial | Eventos `setter_evaluation` (info/warn/error) se insertan por evaluación, pero `observability-panel.tsx` no tiene badge propio para el tipo — cae en fallback genérico con payload truncado a 80 chars |
| Automatización sobre calificación | ⚠️ Configurable, no ejecuta | El trigger `lead_qualified` existe en schema/UI de `automation_rules`, pero **no hay engine en runtime** que evalúe las reglas — nunca dispara |

## 4. Gaps vs spec (US-E7-3 / BRIEF §8)

| Acceptance criterion / spec | Estado real |
| --- | --- |
| "Secuencia configurable de preguntas (obligatorias/opcionales)" | ⚠️ Las preguntas se configuran pero **no se inyectan al prompt** — `prompt-builder.ts`/`openrouter.ts` no leen `setter_configs`. Funcionan como rúbrica de evaluación, no como guion que el agente sigue |
| "Score → calificado / no calificado / **revisar manual**" | ❌ Solo hay binario qualified/knocked_out; no existe el tercer estado ni el manejo "si una knockout rule no se puede evaluar → revisar manual" |
| Acción por knockout rule (`disqualify` / `continue` / `handoff`) | ⚠️ Se captura en UI/DB y se manda al LLM en el prompt de evaluación, pero el runtime solo usa el boolean `knocked_out` → `stage='lost'`. Una regla con `action='handoff'` **no hace handoff** |
| "Acción posterior configurable: agendar, crear oportunidad, handoff, actualizar HL" | ⚠️ El enum de `post_action` tiene `send_template`/`create_hl_opportunity`/`handoff`/`add_tag` — **falta "agendar"** (la agenda solo ocurre vía tools durante la conversación) |
| "Resumen del lead visible en el panel CRM" | ❌ `lead_summary`/`lead_score` se persisten en `contacts.custom_fields` pero `crm-panel.tsx` no los muestra |
| "Toggle de setter por workspace/conversación" | ⚠️ Solo por workspace (`setter_configs.enabled`); no hay toggle por conversación |
| Decisión `apply_setter` (Blueprint §4.3.2) | ❌ No implementada — el setter evalúa post-reply en vez de ser una rama del decision engine |
| Modelo y API key del evaluador | ⚠️ `getModel()` en `setter.ts` usa `process.env.OPENROUTER_API_KEY` + `OPENROUTER_SETTER_MODEL` directo — **ignora la key propia del workspace** (`openrouter.ts` sí la resuelve por workspace) y el `ModelPicker` de "Identidad" no afecta al evaluador |
| Costo de la evaluación | ⚠️ `evaluateLead` nunca llama `recordLlmUsage` ni pasa por `reserveLlmTurn`: sus tokens **no aparecen en las métricas** (`observability.ts` suma eventos `llm_usage`) ni cuentan contra el límite de 20 turnos/hora. Solo el debounce de 2 turnos lo acota (reconocido en comentario de `buffer.ts`) |
| Múltiples configs por workspace | ⚠️ POST crea fila nueva por nombre (UNIQUE `workspace_id+name`); GET devuelve la **más reciente** (cualquier `enabled`) y `getSetterConfig` toma "la primera enabled" **sin ORDER BY** → la UI puede mostrar una config distinta a la evaluada. Tampoco hay DELETE |
| Tests | ❌ Sin `setter.test.ts` ni tests del route `/setter`; `buffer.test.ts` mockea el módulo completo (`getSetterConfig → null`). Las tools de agenda sí tienen cobertura amplia (`schedule-highlevel.test.ts`, `hl-appointment-tools.test.ts`) |
| Tabla `schedules` | ⚠️ Schema muerto: existe con RLS y FK desde `appointments.schedule_id`, pero ningún código la lee/escribe — la config real de agenda vive en `tool_configs` e `integrations` |
| Detalle menor | `post_action: send_template` hardcodea `templateLanguage: "es"` en `buffer.ts` |

## 5. Dependencias de configuración para producción

Para que el Setter opere en un workspace real se requiere:

1. Agente `setter` activo (por defecto tras backfill/onboarding).
2. `setter_configs` con `enabled=true` y al menos preguntas o umbral coherentes.
3. `OPENROUTER_API_KEY` (y opcionalmente `OPENROUTER_SETTER_MODEL`).
4. Para agendar: `scheduling_link` en tool_configs **o** HighLevel conectado con `calendar_id` (timezone vía `scheduling-timezone.ts`).
5. Para oportunidades HL: pipeline + etapa configurados en la integración (`/api/workspace/[id]/integrations/highlevel/pipelines`).

## 6. Recomendaciones priorizadas

**P1 — cierran el gap funcional principal:**

- Inyectar las preguntas/knockout del `setter_configs` al system prompt del agente (o implementar la decisión `apply_setter`), para que el agente realmente conduzca la calificación.
- Despachar la `action` de cada knockout rule (hoy `handoff` en una regla no hace nada).
- Mostrar `lead_score`/`lead_summary` en el CRM panel (el dato ya existe).
- Registrar `llm_usage` del eval (tokens/costo) y resolver la key/modelo por workspace como hace `openrouter.ts` — hoy el eval siempre factura a la key de plataforma y es invisible en métricas.
- Tests unitarios de `evaluateLead`/`getSetterConfig` y del route `/setter`.

**P2 — completitud del spec:**

- Tercer estado "revisar manual" y manejo de knockout no evaluable.
- Post-action "agendar" (p.ej. disparar `schedule_link`/`schedule_highlevel` o enviar template con CTA).
- Engine de `automation_rules` (o quitar `lead_qualified` de la UI hasta que exista).
- Una sola config activa por workspace (o ORDER BY explícito + DELETE) para que UI y evaluador no diverjan.
- Decidir el destino de la tabla `schedules` (usarla o deprecarla).
- Toggle de setter por conversación.
- Badge propio para `setter_evaluation`/`setter_post_action` en el panel de observabilidad.
- Idioma del template del post-action configurable (hoy "es" fijo).
