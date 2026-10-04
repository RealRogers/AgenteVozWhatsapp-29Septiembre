---
proyecto: 01 — Agente de WhatsApp
doc: auditoría técnica — Integración GoHighLevel (HighLevel / GHL)
actualizado: 2026-10-02
relacionado: INFORME-AGENDAMIENTO.md, INFORME-SETTER.md, SECURITY-AUDIT-agente-whatsapp.md
---

# Auditoría técnica — Integración GoHighLevel

> **Integración GHL — contactos, calendario, citas y oportunidades.**
> Auditoría basada en inspección directa del código fuente (no de documentación),
> ejecutada el 2026-10-02. Cada afirmación cita el archivo que la respalda.
> Los endpoints/headers se contrastaron con la spec oficial de GHL v2
> (`/gohighlevel/highlevel-api-docs`). 152 tests relacionados pasan;
> `tsc --noEmit` limpio.

## 1. Resumen ejecutivo

**Clasificación: Completa en producción — con una salvedad operativa.**

La integración no es maqueta ni parcial: cliente HTTP propio con la versión de
API correcta **por endpoint**, 5 tools LLM funcionales, sync de contactos
bidireccional, cifrado AES-256-GCM real con AAD por tenant, webhook autenticado
con comparación constant-time, y manejo ejemplar de resultados inciertos (la IA
nunca afirma una cita que no pudo confirmar).

**La salvedad:** en la DB de producción (`ppbdbyljcvaosjmxhrpa`) hay **cero filas
`integrations` con provider `highlevel`** — está construida pero ningún workspace
la ha conectado. Y el sync inbound (HL→app) tiene un gap de última milla: el
webhook funciona, pero **la URL+token que hay que pegar en HighLevel no se
muestra en ninguna parte de la UI** (ver Hallazgo #1).

## 2. Matriz de funcionalidades

| Función | Estado | Evidencia |
| --- | --- | --- |
| Sync contactos app→HL (push) | ✅ Listo | `syncContactToHL` (PUT/upsert + tags aditivos), `src/features/inbox/services/highlevel-client.ts:319`; dispara en cada edición de contacto (`contact-actions.ts:81`) y botón "Sync HighLevel" en CRM panel (`crm-panel.tsx:318`) |
| Sync contactos HL→app (webhook) | ✅ Listo — sin UI para la URL | `src/app/api/webhooks/highlevel/route.ts`: token por workspace, dedupe por hl_id→teléfono, merge de tags. Bloqueado por Hallazgo #1 |
| Leer slots (`check_availability`) | ✅ Listo | GET `calendars/{id}/free-slots`, Version `2021-04-15`, `check-availability.ts:100-110`; output por día con invariante "día completo o nada" (`slots.ts`) |
| Agendar (`schedule_highlevel`) | ✅ Listo | POST `calendars/events/appointments` con los 4 campos requeridos; anti-doble-reserva por "slot taken"+`addedMs`; trace en playground |
| Reagendar (`reschedule_highlevel`) | 🟡 Beta | PUT conservando duración; retry-safe via `rescheduled_from` en meta local |
| Cancelar (`cancel_highlevel`) | 🟡 Beta | PUT `{appointmentStatus:"cancelled"}`; idempotente (`already_cancelled` → ok) |
| Listar citas (`list_highlevel_appointments`) | 🟡 Beta | Lee live desde HL (contact appointments + event endpoint); nunca afirma "sin citas" si hubo lecturas fallidas |
| Webhook inbound | ✅ Backend / ⚠️ UI | Auth constant-time OK; falta superficie para copiar la URL |
| Oportunidades (setter) | ✅ Listo | `createHLOpportunity` cableado al `post_action` del setter (`buffer.ts:1968`); pipeline/etapa seleccionables en UI cargados desde la API |

## 3. Mapa de archivos

| Pieza | Archivos |
| --- | --- |
| Cliente HTTP / config / sync | `src/features/inbox/services/highlevel-client.ts` (768 líneas) |
| Lib compartida de citas | `src/features/tools/lib/hl-appointment.ts` (678 líneas) |
| Helpers de slots/zona | `src/features/tools/lib/slots.ts`, `src/features/inbox/services/scheduling-timezone.ts`, `src/shared/lib/timezone.ts` |
| Teléfonos | `src/features/inbox/services/phone.ts`, `country-code.ts` |
| Tools LLM | `src/features/tools/tools/{check-availability,schedule-highlevel,reschedule-highlevel,cancel-highlevel,list-highlevel-appointments}.ts`; registro en `src/features/tools/index.ts` |
| Webhook | `src/app/api/webhooks/highlevel/route.ts` (109 líneas) |
| APIs de workspace | `src/app/api/workspace/[id]/integrations/route.ts`, `.../highlevel/test/route.ts`, `.../highlevel/pipelines/route.ts`, `src/app/api/tools/[workspaceId]/route.ts`, `src/app/api/workspace/[id]/setter/route.ts` |
| UI | `src/features/settings/components/integrations-tab.tsx` (sección HL ~855-1158), `tools-catalog.tsx`, `tool-config-panel.tsx`, `src/features/inbox/components/crm-panel.tsx`, `src/features/agents/components/setter-advanced-config.tsx` |
| Cifrado | `src/shared/lib/crypto.ts`, `src/shared/lib/integration-secrets.ts` |
| SQL | `foundation.sql` (columnas `hl_contact_id`, `hl_appointment_id`, policies de `integrations`), `20260929000002_contacts_hl_unique_index.sql`, `20260930000005_appointments_hl_unique_index.sql`, `20260608000006_tools_sensitivity.sql`, `20260617000001_seed_check_availability_tool.sql`, `20260930000000_seed_highlevel_cancel_reschedule_tools.sql` |
| Tests | `hl-contact-sync.test.ts`, `highlevel-tenant.test.ts`, `highlevel-zone.test.ts`, `scheduling-timezone.test.ts`, `contact-actions.test.ts`, `hl-appointment-tools.test.ts`, `schedule-highlevel.test.ts`, `check-availability.test.ts`, `slots.test.ts`, `beta-tools.test.ts`, `tool-configs.test.ts`, `catalog-seed.test.ts` |

## 4. Cliente API de HighLevel

**Endpoints codificados** — todos contrastados con la spec oficial v2:

| Endpoint | Uso | Version header | ✓ |
| --- | --- | --- | --- |
| `GET /locations/{id}` | test de conexión + zona horaria | `2021-07-28` | ✓ |
| `POST /contacts/upsert` | crear/actualizar por teléfono | `2021-07-28` | ✓ |
| `GET /contacts/{id}` | sync inbound | `2021-07-28` | ✓ |
| `PUT /contacts/{id}` | push de ediciones | `2021-07-28` | ✓ |
| `POST /contacts/{id}/tags` | tags aditivos (no reemplaza lista) | `2021-07-28` | ✓ |
| `GET /contacts/{id}/appointments` | candidatos de citas | `2021-07-28` | ✓ |
| `GET /calendars/{id}/free-slots` | disponibilidad | `2021-04-15` | ✓ |
| `POST /calendars/events/appointments` | agendar | `2021-04-15` | ✓ |
| `GET/PUT /calendars/events/appointments/{id}` | leer/mover/cancelar | `2021-04-15` | ✓ |
| `GET /opportunities/pipelines` | selector pipeline | `2021-07-28` | ✓ |
| `POST /opportunities/` | crear oportunidad | `2021-07-28` | ✓ |

- **Auth:** PIT (`Authorization: Bearer`), correcto — sin OAuth ni refresh.
  El PIT vive cifrado en `integrations.credentials.highlevel_pit`;
  location/calendar/pipeline en `integrations.config`.
- **Base URL:** `https://services.leadconnectorhq.com` (`highlevel-client.ts:18`).
- **Teléfonos:** `phone.ts` (módulo puro): `placePhone`/`phoneKey`/`phoneVariants`
  cubren los casos difíciles reales — México `+52 1` vs `+52`, Argentina `+54 9`,
  lectura nacional por `default_country_code` del workspace. El sync inbound prueba
  todas las variantes antes de matchear (`highlevel-client.ts:515-568`); un número
  que no cabe en la lectura queda sin match, nunca se adivina.
- **Zonas horarias:** una sola cadena `business_info.timezone → HL location
  timezone → DEFAULT_TIMEZONE` (`scheduling-timezone.ts`). La zona de la location
  se lee del API y persiste con `timezone_source:"location"` al guardar/probar
  (`saveHLLocationTimeZone`, `highlevel-client.ts:183`, update con guard por
  `updated_at`+`location_id`). Las tools **rechazan** un ISO cuyo offset no
  corresponde a esa zona (`parseConfirmedInstant`, `hl-appointment.ts:119`).
- **Errores:** distingue 4xx (rechazo cierto → error limpio) de 5xx/timeout/red
  (`UnknownOutcomeError` → "no pude confirmar", `noteForTeam` deja nota interna).
  Cada llamada tiene timeout propio acotado dentro del presupuesto de la tool
  (`hl-appointment.ts:38-49`). El body crudo de GHL (inglés, ids internos) va a
  logs; al modelo le llega una razón traducible.

## 5. Webhook inbound

`POST /api/webhooks/highlevel?wsid=<ws>&token=<secret>` (`route.ts`):

- **Auth:** token por workspace en query, `timingSafeEqual` con cortocircuito de
  longitud (`route.ts:38-43`), verificado antes de procesar el evento. El secreto
  se autogenera (24 bytes hex) al primer guardado de la integración y nunca se
  rota solo (`integrations/route.ts:203-208`). Cifrado en reposo.
- **`wsid` es la fuente de verdad** — el `locationId` del payload no se usa para
  autorizar (correcto). *No se valida* que coincida con el `location_id`
  configurado (menor: el secreto ya es por-workspace).
- **Eventos:** solo `type.startsWith("Contact")`; id extraído de
  `contactId ?? id ?? contact.id`. Otros tipos → `{ok:true, skipped:true}`.
- **Dedupe/conflictos:** match por `hl_contact_id` → luego por teléfono en todas
  sus variantes. Un teléfono ya ligado a *otro* contacto HL queda intacto
  (`highlevel-client.ts:570-575`). Dos locales con el mismo HL id → índice único
  `(workspace_id, hl_contact_id)` rechaza (23505) y emite evento
  `hl_contact_link_conflict` — nunca mergea automáticamente.
- **Tags: aditivos en ambas direcciones.** Inbound hace unión (`:585`); outbound
  nunca manda tags en PUT/upsert — solo `POST /tags` que agrega (`:349-351`).
  Un tag borrado local no se borra en HL (decisión documentada).
- **Idempotencia:** reintentos convergen al mismo estado; el único caso
  irreconciliable se reporta, no se fuerza.
- **Errores:** sync fallida → 200 `{synced:false}` para que HL no reintente
  (deliberado, `route.ts:104`).

## 6. Tools de IA

| Tool | Schema Zod | Sensitivity | Confirmación humana | Salvaguardas |
| --- | --- | --- | --- | --- |
| `check_availability` | estricto (`date_from`, `date_to`, `calendar_id?`) | read | N/A | Respuesta ilegible → error explícito, nunca "sin cupos" |
| `schedule_highlevel` | estricto (`datetime_iso` req) | write | No — corre autónomo | Offset de zona validado; pasado rechazado; anti-doble-reserva; playground exige teléfono tecleado por el tester + trace `playground_write` |
| `reschedule_highlevel` | estricto (2 ISOs) | write | No | `locateAppointmentAt` por instante exacto; ambigüedad/no-confirmado → `needs_human`; retry-safe por meta |
| `cancel_highlevel` | estricto (1 ISO) | write | No | Igual; idempotente |
| `list_highlevel_appointments` | `{}` | read | N/A | Solo citas del contacto de la conversación |

- **"Confirmación" real:** el gate `sensitivity:"sensitive"` (aprobación humana)
  existe en el registry pero ninguna tool GHL lo usa — las de escritura son
  `write`: corren autónomas **sin retry** (un retry tras timeout podría repetir
  el write, `registry.ts:176`). La compensación: `needs_human` + notas internas +
  handoff del batch ante incertidumbre (`buffer.ts:540-551`, `NEEDS_HUMAN_TOOLS`
  cubre las 3 writes de citas). Ninguna tool escribe sin contacto real fuera del
  playground; `ctx.contactId` es ancla server-side (`tool.ts`).
- **Beta:** `cancel_highlevel`, `reschedule_highlevel`, `list_highlevel_appointments`
  llevan badge "Beta" + nota "pruébala en una sub-cuenta" (`beta-tools.ts`,
  `tools-catalog.tsx:190-205`). `schedule_highlevel` y `check_availability` **no**
  son beta.
- **Activación:** las 5 están sembradas en `public.tools` (verificado en vivo) pero
  cada workspace las enciende manualmente en Settings → Tools
  (`tool_configs.enabled`; `getEnabledTools` filtra por workspace,
  `tool-configs.ts:22-38`).
- **`calendar_id` del workspace siempre gana** sobre el que el modelo mande
  (`calendar-id.ts`) — un LLM no puede agendar en un calendario no configurado.

## 7. Credenciales y seguridad

- **Cifrado real:** AES-256-GCM, IV 96-bit, AAD = `workspaceId:provider` — un blob
  movido a otro tenant no descifra (`crypto.ts`). Formato `enc:v1:iv:ct`; lectura
  tolera plaintext legado, escritura nunca (`integration-secrets.ts`).
- **UI de Settings** (`integrations-tab.tsx:857-1158`): PIT en campo password,
  Location ID, Calendar ID, Pipeline+Etapa cargados del API. Botón **"Probar
  conexión"** → `POST .../highlevel/test` → `GET /locations/{id}` real; devuelve
  nombre de location + si falta calendar.
- **Roles:** PUT integrations = **admin**; GET integrations + test + pipelines =
  **manager**+; toggle tools = **manager**+; `syncContactHL` manual = **agent**+.
  Consistente con las policies RLS (`foundation.sql:841-857`). Las rutas que usan
  service-role replican esas policies en código (comentado en cada ruta).
- **Enmascaramiento:** GET devuelve credentials como `••••••`; excepción
  intencional: el webhook secret de HL viaja al cliente manager+ para copiar la
  URL (`integrations/route.ts:112-132`) — pero ver Hallazgo #1.

## 8. Puntos críticos / bugs encontrados

| # | Severidad | Hallazgo | Ref |
| --- | --- | --- | --- |
| 1 | ~~Alta (bloqueo operativo)~~ **Resuelto 2026-10-02** | ~~La URL del webhook inbound no se muestra en la UI.~~ La sección HighLevel ahora renderiza un bloque copiable de `highlevel_webhook_url` (solo-read Input + botón copiar + toast), visible tras el primer guardado. | `integrations-tab.tsx` (sección HL) |
| 2 | ~~Media~~ **Resuelto 2026-10-02** | ~~Sin toggle para desactivar HighLevel; `enabled:true` hardcodeado.~~ Switch "Integración activa" (solo admin) envía el estado real; desactivada, se omiten el auto-load de pipelines y "Probar conexión". | `integrations-tab.tsx` |
| 3 | Media | **Token del webhook en query string** — puede quedar en logs de edge/proxy. Secreto de bajo valor (solo sync inbound), ya reconocido como "low-sensitivity" en comentarios; rotable si se filtra. | `api/webhooks/highlevel/route.ts:54-55` |
| 4 | Baja | **Webhook no valida `locationId` del payload** contra `config.location_id`. Mitigado porque el secreto es por-workspace; defensa en profundidad pendiente. | `api/webhooks/highlevel/route.ts:82-91` |
| 5 | Baja | **Comentario desactualizado** afirma que `create_hl_opportunity` está stubbed; llama a la función real. Cosmético pero confunde. | `buffer.ts:1904-1905` vs `1968-1978` |
| 6 | Baja | **Catálogo `tools.schema` desactualizado** en DB: `check_availability` muestra `timezone` (arg ya eliminado del código) y `schedule_highlevel` omite `contact_phone`. Solo display. | seed `20260617000001` vs `check-availability.ts:6-17` |
| 7 | Info | **GHL publicó endpoints v3** (`Version: "v3"`) para opportunities y calendar events. El código usa v2 (`2021-07-28`/`2021-04-15`), que sigue vigente — no es bug hoy; hay versión más nueva disponible. | spec `apps/v3/*` |
| 8 | Info | Sin backoff ante **429** de GHL (~100 req/10s por PIT). Los fallos se reportan al modelo; bajo carga concurrente puede degradar a "no pude confirmar". | timeouts en `hl-appointment.ts` |

Sin errores de tipo (`tsc --noEmit` limpio). Sin headers incorrectos. Sin
endpoints deprecados en uso.

## 9. Recomendaciones

### Conectar una subcuenta de GHL hoy

1. En GHL: Settings → Private Integrations → crear token con scopes
   `contacts.readonly`, `contacts.write`, `calendars.readonly`,
   `calendars/events.write`, `opportunities.readonly`, `opportunities.write`,
   `locations.readonly`.
2. En la app: Configuración → Integraciones → HighLevel → pegar PIT + Location
   ID + Calendar ID → **Guardar** (rol admin).
3. **Probar conexión** — valida el PIT y persiste la zona horaria de la location.
4. Desde aquí el sync outbound ya funciona: contactos editados se empujan a HL y
   el agente puede agendar.

### Agendar citas por WhatsApp

5. Configuración → Negocio → definir **timezone** y **código de país**.
6. Configuración → Tools → activar `check_availability` + `schedule_highlevel`
   (y las 3 beta si se acepta el riesgo).
7. En GHL: el calendario debe tener **free slots** configurados (availability del
   calendario en GHL, no de la app).
8. Probar en el chat de prueba escribiendo un teléfono de test en el mensaje.

### Sync inbound (HL→app)

9. ~~Falta implementar en UI el bloque copiable del webhook.~~ **Resuelto:**
   la sección HighLevel muestra `highlevel_webhook_url` copiable tras guardar.
   En GHL: Workflows → trigger "Contact Create" o "Contact Update" → acción
   webhook POST a esa URL y los contactos se importan solos.
10. Alternativa programática: `GET /api/workspace/{id}/integrations` con rol
    manager+ devuelve `highlevel_webhook_url` en JSON.

### Mejoras sugeridas (no bloqueantes)

- Toggle enable/disable de HL en UI (#2).
- Validar `locationId` del payload contra config (#4).
- Actualizar schema de catálogo de `check_availability`/`schedule_highlevel` (#6)
  y el comentario stale (#5).
- Considerar `Version: "v3"` en una migración futura de opportunities/events (#7).
- Backoff corto ante 429 (#8).

**Veredicto final:** para agendar por WhatsApp —lo que el producto promete— la
integración está **lista para usarse hoy**: solo falta conectar la subcuenta y
activar las tools. El único hueco real es la superficie UI del webhook
inbound (#1).
