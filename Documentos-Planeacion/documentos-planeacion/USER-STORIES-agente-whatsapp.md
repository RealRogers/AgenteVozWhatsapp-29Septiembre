# Plataforma de Inbox Conversacional WhatsApp con IA — User Stories (Core v1)

> **Versión:** 1.0
> **Estado:** BORRADOR
> **Fecha:** 2026-06-08
> **Proyecto:** 01 — Agente de WhatsApp
> **Inputs:** `../BRIEF.md` (producto + 17 módulos) · `../ARQUITECTURA-OBJETIVO.md` · `BLUEPRINT-agente-whatsapp.md` (schema §3, motor §4, integraciones §5, reuso §6, roadmap §7)
> **Alcance:** SOLO Core v1. `v1.5` y `v2` quedan fuera (ver "Stories Diferidos").
> **Total Stories:** 48 (P0: 26 · P1: 18 · P2: 4)

---

## User Journey Map

```
[Onboarding/Auth]
   │
   ▼
[E1 MVP] Contacto escribe → webhook YCloud → normaliza → IA responde texto → inbox realtime → operador togglea IA/humano
   │
   ▼
[E2 Buffer] Mensajes en ráfaga se agrupan por silencio → un solo bloque semántico al agente
   │
   ▼
[E3 State Machine] Conversación = estado operativo → handoff manual y automático IA↔humano
   │
   ▼
[E4 Ventana 24h] Guardrail Meta: dentro=free text, fuera=template aprobado obligatorio
   │
   ▼
[E5 CRM] Panel lateral de contacto + tags + sync bidireccional HighLevel
   │
   ▼
[E6 Tools+Agenda] Tool-calling con confirmación de acciones sensibles + agendamiento link/HighLevel
   │
   ▼
[E7 Setter+KB] Business info + prompting jerárquico + knockout questions + knowledge base
   │
   ▼
[E8 Multimedia+Obs] Audio/imagen/doc/video + observabilidad de costos + roles
```

---

## Resumen de Epics

| Epic                                        | Fase Blueprint    | Stories           | Prioridad | Descripción                                                              |
| ------------------------------------------- | ----------------- | ----------------- | --------- | ------------------------------------------------------------------------ |
| E1: MVP Camino Feliz (texto end-to-end)     | Fase 1 (+ Fase 0) | US-E1-1 a US-E1-8 | P0        | Webhook YCloud → IA responde texto → inbox realtime con toggle IA/humano |
| E2: Buffer Inteligente                      | Fase 2            | US-E2-1 a US-E2-5 | P0/P1     | Agrupación por silencio del usuario, batch multimodal                    |
| E3: State Machine + Handoff                 | Fase 3            | US-E3-1 a US-E3-6 | P0/P1     | Estados operativos + handoff manual y automático                         |
| E4: Ventana 24h + Templates Meta            | Fase 4            | US-E4-1 a US-E4-6 | P0        | Guardrail duro de cumplimiento Meta                                      |
| E5: CRM Básico + Sync HighLevel             | Fase 5            | US-E5-1 a US-E5-6 | P0/P1     | Contacto, dedupe por teléfono, tags, sync HighLevel                      |
| E6: Tools + Agendamiento                    | Fase 6            | US-E6-1 a US-E6-6 | P0/P1     | Tool-calling con confirmación + agenda link/HighLevel                    |
| E7: Setter + Business Info + Prompting + KB | Fase 7            | US-E7-1 a US-E7-6 | P1/P2     | Calificación, knockout, prompting jerárquico, KB                         |
| E8: Multimedia + Observabilidad + Roles     | Fase 8            | US-E8-1 a US-E8-5 | P1/P2     | Media completa, costos/logs, roles                                       |

---

## Epic 1 — MVP Camino Feliz (Fase 1 + Fase 0) · M1, M14

> El núcleo ejecutable: un contacto escribe por WhatsApp, la IA responde texto, todo aparece en el inbox en tiempo real y el operador puede tomar el control. Sin esto no hay producto.

### US-E1-1: Login y acceso al workspace

**Como** Agent (operador humano)
**Quiero** iniciar sesión con email/contraseña y entrar a mi workspace asignado
**Para** acceder al inbox de mi negocio sin ver datos de otros tenants

**Acceptance Criteria:**

Funcionalidad:

- [ ] Login con email/password vía Supabase Auth
- [ ] Tras login, se resuelve el/los workspace del usuario vía `memberships` activas (`auth_workspace_ids()`)
- [ ] Si el usuario pertenece a un solo workspace, entra directo al inbox; si a varios, muestra selector
- [ ] Logout disponible desde el menú de usuario

Validaciones:

- [ ] Credenciales inválidas: "Email o contraseña incorrectos."
- [ ] Usuario sin membership activa: "Tu cuenta no tiene acceso a ningún workspace. Contacta a tu administrador."

Error Handling:

- [ ] Si Supabase Auth no responde: "No pudimos iniciar sesión. Intenta nuevamente."

UX:

- [ ] Rutas del inbox protegidas: usuario no autenticado se redirige a login
- [ ] Estado de carga durante la autenticación

**Prioridad:** P0
**Estimación:** M
**Dependencias:** Ninguna
**Notas técnicas:** RLS por `auth_workspace_ids()` (Blueprint §3.2/§3.10). Fase 0 (scaffolding).

---

### US-E1-2: Recibir mensaje entrante de WhatsApp (webhook YCloud)

**Como** Sistema
**Quiero** recibir el webhook de YCloud, verificar su firma y normalizar el mensaje entrante
**Para** que todo mensaje de WhatsApp entre de forma segura y consistente al runtime

**Acceptance Criteria:**

Funcionalidad:

- [ ] Endpoint `POST /api/webhooks/ycloud/[workspace]` recibe el inbound y resuelve el tenant por path
- [ ] Verifica la firma `YCloud-Signature` (HMAC-SHA256 sobre `timestamp + "." + rawBody`) leyendo el raw body antes de parsear JSON
- [ ] Parsea `whatsappInboundMessage` (from, text, wamid, customerProfile) a `UnifiedInboundEvent`
- [ ] El teléfono se normaliza a E.164 con `+` aunque YCloud lo mande sin él

Validaciones:

- [ ] Firma inválida o fuera de tolerancia de 5 min (replay): responde 401 y no procesa
- [ ] Payload sin `wamid` o sin `from`: descarta y registra evento `level=warn`

Error Handling:

- [ ] Responde 200 a YCloud aun si el procesamiento posterior falla, para evitar reintentos en bucle; el error se registra en `events`

UX:

- [ ] N/A (servicio backend)

**Prioridad:** P0
**Estimación:** M
**Dependencias:** US-E1-1
**Notas técnicas:** Blueprint §4.1. `events.type='send_error'`/`'decision'` para auditoría.

---

### US-E1-3: Dedupe e ingreso de contacto/conversación/mensaje

**Como** Sistema
**Quiero** upsert del contacto por teléfono, upsert de la conversación e insertar el mensaje sin duplicar webhooks
**Para** mantener un inbox limpio sin contactos ni mensajes repetidos

**Acceptance Criteria:**

Funcionalidad:

- [ ] Upsert de `contacts` por `(workspace_id, phone)` — si ya existe, se reutiliza (dedupe por teléfono)
- [ ] Upsert de `conversations` por `(workspace_id, contact_id, channel='whatsapp')`
- [ ] Insert de `messages` con `direction='in'`, `wamid`, `body`, `type`
- [ ] Actualiza `conversations.last_message_at` y `unread_count`

Validaciones:

- [ ] Un `wamid` repetido NO genera segundo mensaje (índice único parcial `(workspace_id, wamid)`)

Error Handling:

- [ ] Colisión de inserción por `wamid` duplicado se ignora silenciosamente (idempotencia)

UX:

- [ ] El nuevo contacto aparece con nombre de `customerProfile` si está disponible; si no, con el teléfono

**Prioridad:** P0
**Estimación:** M
**Dependencias:** US-E1-2
**Notas técnicas:** Blueprint §3.4/§3.5. `uq_contacts_workspace_phone`, `uq_messages_wamid`.

---

### US-E1-4: La IA responde texto automáticamente

**Como** Contacto (cliente final)
**Quiero** recibir una respuesta automática y relevante a mi mensaje de texto
**Para** ser atendido al instante sin esperar a un humano

**Acceptance Criteria:**

Funcionalidad:

- [ ] Al entrar un mensaje con `ai_enabled=true`, el runtime llama a OpenRouter con el prompt del workspace
- [ ] La respuesta generada se envía al contacto vía YCloud `sendText` (`POST /v2/whatsapp/messages`)
- [ ] Se inserta el `message` outbound con `direction='out'`, `sender_user_id=NULL` (IA), `status='queued'`

Validaciones:

- [ ] Si el workspace no tiene integración OpenRouter habilitada: no responde y registra `event level=warn`

Error Handling:

- [ ] Si OpenRouter falla o agota timeout: no se envía mensaje basura; se registra `event type='llm_usage' level=error` y la conversación queda lista para handoff
- [ ] Si YCloud rechaza el envío: `messages.status='failed'` + `error_message`

UX:

- [ ] N/A directo (la respuesta llega al WhatsApp del contacto)

**Prioridad:** P0
**Estimación:** L
**Dependencias:** US-E1-3
**Notas técnicas:** Blueprint §4.4 (Agent Runtime, Vercel AI SDK v5 + OpenRouter). F1-T3/F1-T4.

---

### US-E1-5: Ver la lista de conversaciones (inbox)

**Como** Agent
**Quiero** ver la lista de conversaciones de mi workspace ordenadas por último mensaje
**Para** identificar rápidamente a quién atender

**Acceptance Criteria:**

Funcionalidad:

- [ ] Lista a la izquierda con nombre/teléfono, último mensaje, hora y `unread_count`
- [ ] Ordenada por `last_message_at DESC`
- [ ] Muestra indicador de estado (atendida por IA / humano / handoff)

Validaciones:

- [ ] Solo se muestran conversaciones de workspaces del usuario (RLS)

Error Handling:

- [ ] Si falla la carga: "No pudimos cargar tus conversaciones. Reintentar." con botón

UX:

- [ ] **Empty state**: "Aún no hay conversaciones. Aparecerán aquí cuando un contacto escriba."
- [ ] **Loading state**: skeleton de la lista
- [ ] Layout estilo WhatsApp Web (lista izquierda / thread derecha)

**Prioridad:** P0
**Estimación:** M
**Dependencias:** US-E1-3
**Notas técnicas:** Reuse de hooks de inbox del ATS (Blueprint §6). F1-T5.

---

### US-E1-6: Ver y leer el hilo de una conversación en tiempo real

**Como** Agent
**Quiero** abrir una conversación y ver el historial completo actualizándose en vivo
**Para** seguir el contexto sin recargar la página

**Acceptance Criteria:**

Funcionalidad:

- [ ] Render del historial in/out ordenado por `created_at`
- [ ] Mensajes nuevos aparecen vía Supabase Realtime sin recargar
- [ ] Iconos de estado en outbound (queued/sent/delivered/read/failed)
- [ ] Distingue visualmente mensajes de IA vs humano vs contacto

Validaciones:

- [ ] Solo mensajes de conversaciones accesibles por el usuario (RLS)

Error Handling:

- [ ] Si se cae la conexión realtime: reintenta y muestra indicador discreto de reconexión

UX:

- [ ] **Empty state**: hilo sin mensajes muestra "Sin mensajes todavía"
- [ ] **Loading state**: skeleton del hilo al abrir
- [ ] Auto-scroll al último mensaje al recibir uno nuevo

**Prioridad:** P0
**Estimación:** M
**Dependencias:** US-E1-5
**Notas técnicas:** `messages`/`conversations` en publication realtime, `REPLICA IDENTITY FULL` (Blueprint §3.5).

---

### US-E1-7: Encender/apagar la IA por conversación

**Como** Agent
**Quiero** activar o desactivar la IA en una conversación específica con un botón
**Para** tomar el control cuando quiero responder yo, y devolverlo a la IA después

**Acceptance Criteria:**

Funcionalidad:

- [ ] Botón superior en el hilo togglea `conversations.ai_enabled`
- [ ] Con `ai_enabled=false`, el webhook NO llama a OpenRouter; solo persiste el inbound
- [ ] El cambio se refleja en el badge de estado de la lista y el hilo
- [ ] La IA se puede reactivar manualmente en cualquier momento

Validaciones:

- [ ] Solo roles `admin/manager/agent` pueden togglear (Viewer no)

Error Handling:

- [ ] Si falla la actualización: revierte el toggle visual y muestra "No pudimos cambiar el estado de la IA."

UX:

- [ ] Estado visual inmediato (optimistic UI) con confirmación

**Prioridad:** P0
**Estimación:** S
**Dependencias:** US-E1-6
**Notas técnicas:** F1-T6. El gating fino de roles se endurece en US-E8-4.

---

### US-E1-8: Responder manualmente desde el composer

**Como** Agent
**Quiero** escribir y enviar un mensaje de texto al contacto desde la webapp
**Para** atender personalmente cuando la IA está apagada o necesito intervenir

**Acceptance Criteria:**

Funcionalidad:

- [ ] Composer de texto en el hilo; al enviar, se llama a YCloud `sendText` y se inserta outbound con `sender_user_id` del agente
- [ ] El mensaje enviado aparece en el hilo en realtime con su `status`

Validaciones:

- [ ] No permite enviar mensaje vacío
- [ ] Solo `admin/manager/agent` pueden enviar (Viewer no ve el composer)

Error Handling:

- [ ] Si el envío falla: `status='failed'`, se muestra el mensaje en rojo con opción de reintentar

UX:

- [ ] Enter envía, Shift+Enter salta línea
- [ ] El composer se limpia tras enviar con éxito

**Prioridad:** P0
**Estimación:** M
**Dependencias:** US-E1-7
**Notas técnicas:** El bloqueo de free text fuera de ventana 24h se agrega en US-E4-2 (no aplica todavía en E1).

---

## Epic 2 — Buffer Inteligente (Fase 2) · M2

> Diferenciador clave: en vez de responder cada "hola" suelto, el sistema espera a que el usuario termine de escribir (silencio) y procesa todo el batch como un solo bloque semántico.

### US-E2-1: Agrupar mensajes en ráfaga por silencio del usuario

**Como** Contacto
**Quiero** que el sistema espere a que termine de escribir mis mensajes seguidos antes de responder
**Para** recibir una sola respuesta coherente y no una por cada línea suelta

**Acceptance Criteria:**

Funcionalidad:

- [ ] Al entrar un inbound se abre/reutiliza un `message_batches` en estado `buffering`
- [ ] El batch se dispara por **silencio** del usuario (`flush_at`), no por el primer mensaje
- [ ] Cada nuevo inbound dentro de la ventana **reinicia** el contador de silencio
- [ ] Ventana de silencio configurable por workspace (`silence_ms`, rango 10–60s)
- [ ] Al cumplirse el silencio, el batch pasa a `flushed` y se procesa una sola vez (→ `processed`)

Validaciones:

- [ ] Solo se procesa un batch en estado `flushed` una vez (idempotencia)

Error Handling:

- [ ] Si el procesamiento del batch falla, queda registrado y el batch puede cerrarse como `cancelled` con log

UX:

- [ ] N/A directo (transparente para el contacto)

**Prioridad:** P0
**Estimación:** L
**Dependencias:** US-E1-4
**Notas técnicas:** Blueprint §4.2, `message_batches` §3.5. F2-T1/T2.

---

### US-E2-2: Consolidar el batch en un solo bloque semántico

**Como** Sistema
**Quiero** unir el texto de todos los mensajes del batch en un solo `merged_text`
**Para** entregar al agente la intención completa del usuario, no fragmentos

**Acceptance Criteria:**

Funcionalidad:

- [ ] Al cerrar el batch, concatena los `body` de sus mensajes ordenados por `created_at` en `merged_text`
- [ ] El runtime envía `merged_text` (no mensajes individuales) a OpenRouter
- [ ] El batch registra `message_count`

Validaciones:

- [ ] Si el batch quedó vacío (mensajes borrados/sistema), no se llama al agente

Error Handling:

- [ ] Si falta texto en algún mensaje, se omite ese fragmento sin romper la consolidación

UX:

- [ ] N/A

**Prioridad:** P0
**Estimación:** M
**Dependencias:** US-E2-1
**Notas técnicas:** F2-T2/T3.

---

### US-E2-3: Agrupar contenido multimodal en el batch

**Como** Contacto
**Quiero** que un audio, una imagen con caption y un texto enviados juntos se entiendan como un solo mensaje
**Para** que la IA capte mi intención completa aunque la exprese en varios formatos

**Acceptance Criteria:**

Funcionalidad:

- [ ] El `merged_text` incluye texto + transcripción de audio + captions de imagen del batch
- [ ] Cada fragmento queda etiquetado por origen en el bloque consolidado

Validaciones:

- [ ] Si la transcripción de audio aún no está lista, el batch espera según regla por tipo (US-E2-4)

Error Handling:

- [ ] Si la transcripción falla, se incluye un marcador "(audio no transcrito)" y se continúa

UX:

- [ ] N/A

**Prioridad:** P1
**Estimación:** M
**Dependencias:** US-E2-2, US-E8-1 (transcripción)
**Notas técnicas:** F2-T3. Dependencia parcial con multimedia (E8) para audio→texto.

---

### US-E2-4: Reglas de buffer por tipo y bypass de urgentes

**Como** Manager
**Quiero** configurar reglas de espera por tipo de mensaje y bypass para casos urgentes
**Para** que la IA no haga esperar a quien pulsa un botón interactivo o envía algo prioritario

**Acceptance Criteria:**

Funcionalidad:

- [ ] Regla configurable: esperar más si llega un audio (transcripción pendiente)
- [ ] **Bypass**: mensajes interactivos (botón/lista) o marcados urgentes se procesan sin esperar el silencio completo
- [ ] Las reglas se guardan en `message_batches.meta` / config del workspace

Validaciones:

- [ ] `silence_ms` fuera de rango 10–60s: "El tiempo de espera debe estar entre 10 y 60 segundos."

Error Handling:

- [ ] Config inválida cae al default (30000 ms)

UX:

- [ ] Sección de configuración del buffer en settings con valores por defecto visibles

**Prioridad:** P1
**Estimación:** M
**Dependencias:** US-E2-1
**Notas técnicas:** F2-T4.

---

### US-E2-5: Ver el log de qué mensajes fueron al mismo batch

**Como** Manager
**Quiero** ver qué mensajes se agruparon en cada batch y cuándo se procesó
**Para** auditar y ajustar el comportamiento del buffer

**Acceptance Criteria:**

Funcionalidad:

- [ ] Registro en `events` del flush del batch con la lista de `message_id` agrupados
- [ ] Cada mensaje referencia su `batch_id`

Validaciones:

- [ ] Solo `admin/manager` ven los logs de batch

Error Handling:

- [ ] **Empty state**: "No hay batches registrados todavía."

UX:

- [ ] Vista legible (no JSON crudo) en el panel de observabilidad

**Prioridad:** P2
**Estimación:** S
**Dependencias:** US-E2-1
**Notas técnicas:** F2-T4. Se integra con la observabilidad de US-E8-3.

---

## Epic 3 — State Machine + Handoff (Fase 3) · M3, M14

> La conversación es un estado operativo, no solo un chat. La IA cede y retoma el control de forma controlada.

### US-E3-1: Estado operativo de la conversación con transiciones válidas

**Como** Sistema
**Quiero** que cada conversación tenga un estado (`ai_active`, `human_active`, `handoff_pending`, `waiting_reply`, `paused`, `closed`) con transiciones controladas
**Para** que el comportamiento de la IA y del equipo sea predecible

**Acceptance Criteria:**

Funcionalidad:

- [ ] `conversations.state` refleja el estado actual
- [ ] Solo se permiten transiciones definidas en `state-machine.ts`
- [ ] El estado determina si la IA responde (`ai_active`) o se abstiene (`human_active`, `paused`, `closed`)

Validaciones:

- [ ] Una transición inválida se rechaza y se registra `event level=warn`

Error Handling:

- [ ] Estado corrupto/desconocido cae a un estado seguro (`paused`) con alerta

UX:

- [ ] N/A directo (alimenta badges de US-E3-5)

**Prioridad:** P0
**Estimación:** M
**Dependencias:** US-E1-7
**Notas técnicas:** Blueprint §4.7, enum `conversation_state` §3.2. F3-T1.

---

### US-E3-2: Handoff manual a humano

**Como** Agent
**Quiero** derivar una conversación a humano con un botón
**Para** intervenir personalmente cuando la situación lo amerita

**Acceptance Criteria:**

Funcionalidad:

- [ ] Botón "Derivar a humano" en el hilo → estado `handoff_pending` o `human_active`
- [ ] Al derivar, la IA queda pausada (`ai_enabled=false`)
- [ ] Se registra `event type='state_change'` con el usuario que derivó

Validaciones:

- [ ] No disponible para Viewer

Error Handling:

- [ ] Si falla el cambio de estado: "No pudimos derivar la conversación. Intenta de nuevo."

UX:

- [ ] Confirmación visual del cambio de estado inmediato

**Prioridad:** P0
**Estimación:** S
**Dependencias:** US-E3-1
**Notas técnicas:** F3-T2.

---

### US-E3-3: Handoff automático por triggers de la IA

**Como** Contacto
**Quiero** que me pasen con una persona cuando lo pido explícitamente o la IA no puede ayudarme
**Para** no quedarme atascado con un bot que no resuelve

**Acceptance Criteria:**

Funcionalidad:

- [ ] El motor de decisión marca `handoff_pending` ante triggers: petición explícita de humano, baja confianza, palabra clave de escalado, objeción compleja
- [ ] Al activarse, la IA deja de responder y la conversación queda lista para el equipo

Validaciones:

- [ ] Los triggers de escalado son configurables por workspace

Error Handling:

- [ ] Si el motor no puede evaluar (falta contexto), se abstiene y marca handoff por seguridad

UX:

- [ ] N/A directo (alimenta notificación US-E3-6 y badges)

**Prioridad:** P0
**Estimación:** L
**Dependencias:** US-E3-1, US-E1-4
**Notas técnicas:** Blueprint §4.3/§4.7. `decision-engine.ts`. F3-T3/T4.

---

### US-E3-4: Motor de decisión v1 (responder/esperar/handoff/abstenerse)

**Como** Sistema
**Quiero** un motor que decida entre responder, esperar más, derivar o abstenerse según el estado y el contexto
**Para** orquestar correctamente el buffer, la IA y el handoff

**Acceptance Criteria:**

Funcionalidad:

- [ ] El motor recibe el batch consolidado y el estado de la conversación y emite una decisión
- [ ] Respeta el estado: no responde si `human_active`/`paused`/`closed`
- [ ] Se abstiene si no hay confianza suficiente o falta contexto crítico

Validaciones:

- [ ] La decisión y su razón se registran en `events type='decision'`

Error Handling:

- [ ] Ante error interno, decisión por defecto = abstenerse + handoff

UX:

- [ ] N/A

**Prioridad:** P0
**Estimación:** L
**Dependencias:** US-E3-1, US-E2-2
**Notas técnicas:** `decision-engine.ts`. F3-T4. Se extiende en E6 (tools) y E7 (KB/setter).

---

### US-E3-5: Indicador de estado en lista e hilo + filtros

**Como** Manager
**Quiero** ver y filtrar conversaciones por su estado (IA / humano / handoff pendiente / pausada / cerrada)
**Para** priorizar las que requieren atención humana

**Acceptance Criteria:**

Funcionalidad:

- [ ] Badge de estado en cada conversación de la lista y en el header del hilo
- [ ] Filtros por estado en la lista

Validaciones:

- [ ] Filtros respetan RLS (solo workspaces del usuario)

Error Handling:

- [ ] **Empty state** de un filtro sin resultados: "No hay conversaciones en este estado."

UX:

- [ ] Colores/etiquetas consistentes por estado
- [ ] **Loading state** al aplicar filtro

**Prioridad:** P1
**Estimación:** M
**Dependencias:** US-E3-1
**Notas técnicas:** F3-T5.

---

### US-E3-6: Notificar al equipo cuando hay handoff pendiente

**Como** Agent
**Quiero** ser notificado cuando una conversación entra en `handoff_pending`
**Para** atender al contacto sin que se quede esperando

**Acceptance Criteria:**

Funcionalidad:

- [ ] Al entrar en `handoff_pending`, la conversación se destaca en la lista (contador/indicador visible)
- [ ] El indicador se limpia cuando un agente toma la conversación (`human_active`)

Validaciones:

- [ ] Solo se notifica a usuarios del workspace correspondiente

Error Handling:

- [ ] Si no hay agentes disponibles, la conversación permanece destacada hasta atención

UX:

- [ ] Indicador visible en la navegación del inbox (badge de handoffs pendientes)

**Prioridad:** P1
**Estimación:** S
**Dependencias:** US-E3-3
**Notas técnicas:** Notificación in-app v1; canales externos quedan en v1.5.

---

## Epic 4 — Ventana 24h + Templates Meta (Fase 4) · M10

> Guardrail duro de cumplimiento Meta. Rompe o funciona: fuera de ventana NO se puede enviar texto libre.

### US-E4-1: Mostrar el estado de la ventana de 24h

**Como** Agent
**Quiero** ver claramente si una conversación está dentro o fuera de la ventana de 24h
**Para** saber si puedo escribir libremente o debo usar una plantilla

**Acceptance Criteria:**

Funcionalidad:

- [ ] `conversations.window_expires_at` = último inbound + 24h
- [ ] Banner en el hilo: "Ventana abierta — vence en HH:MM" o "Ventana cerrada — requiere plantilla"
- [ ] El estado se recalcula con cada inbound

Validaciones:

- [ ] El cálculo usa la zona horaria del workspace

Error Handling:

- [ ] Si `window_expires_at` es nulo (sin inbound aún), se trata como ventana cerrada

UX:

- [ ] Banner con color distintivo (abierta vs cerrada)
- [ ] Cuenta regresiva legible

**Prioridad:** P0
**Estimación:** M
**Dependencias:** US-E1-6
**Notas técnicas:** Blueprint §4.8, `window_expires_at` §3.5. Reuse banner ATS. F4-T1.

---

### US-E4-2: Bloquear texto libre fuera de ventana (guardrail duro)

**Como** Sistema
**Quiero** impedir el envío de texto libre cuando la ventana está cerrada, tanto al humano como a la IA
**Para** cumplir las reglas de Meta y no arriesgar el número de WhatsApp

**Acceptance Criteria:**

Funcionalidad:

- [ ] Con ventana cerrada, el composer de texto libre queda deshabilitado y solo permite enviar templates aprobados
- [ ] El agent runtime tampoco envía free text fuera de ventana (se obliga template)
- [ ] El bloqueo aplica server-side, no solo en UI

Validaciones:

- [ ] Intento de envío de free text fuera de ventana: "La ventana de 24h está cerrada. Solo puedes enviar una plantilla aprobada."

Error Handling:

- [ ] Si el estado de ventana es ambiguo, se asume cerrada (fail-safe)

UX:

- [ ] El composer muestra estado bloqueado con explicación y CTA "Elegir plantilla"

**Prioridad:** P0
**Estimación:** M
**Dependencias:** US-E4-1, US-E1-8
**Notas técnicas:** F4-T2. Guardrail duro server-side (Blueprint §4.8).

---

### US-E4-3: Override de admin para forzar free text (con warning)

**Como** Admin
**Quiero** poder forzar excepcionalmente un envío de texto libre fuera de ventana con una advertencia explícita
**Para** manejar casos extraordinarios bajo mi responsabilidad

**Acceptance Criteria:**

Funcionalidad:

- [ ] Solo rol `admin` ve la opción de override
- [ ] Requiere confirmación con warning explícito de riesgo de cumplimiento Meta
- [ ] El override se registra en `events level=warn` con el usuario que lo ejecutó

Validaciones:

- [ ] Sin rol admin, la opción no existe (no solo oculta: bloqueada server-side)

Error Handling:

- [ ] Si YCloud rechaza el envío fuera de ventana, se muestra el error real y se registra

UX:

- [ ] Modal de confirmación: "Estás enviando texto libre fuera de la ventana de 24h. Esto puede violar políticas de Meta. ¿Continuar?"

**Prioridad:** P1
**Estimación:** S
**Dependencias:** US-E4-2
**Notas técnicas:** BRIEF M10: "requiere override admin con warning".

---

### US-E4-4: Sugerir y enviar templates aprobados fuera de ventana

**Como** Agent
**Quiero** que el sistema me sugiera las plantillas válidas y enviarlas con sus variables
**Para** reabrir la conversación cumpliendo las reglas

**Acceptance Criteria:**

Funcionalidad:

- [ ] Con ventana cerrada, el composer ofrece selector de templates en estado `approved`
- [ ] Al elegir, se piden las variables del template y se envía vía YCloud `sendTemplate`
- [ ] El template enviado se registra como `message type='template'` con `template_id`

Validaciones:

- [ ] No deja enviar si faltan variables requeridas: "Completa todas las variables de la plantilla."
- [ ] La estructura del request debe coincidir exacto con el template (variables, componentes, idioma, nombre)

Error Handling:

- [ ] Si YCloud rechaza por mismatch de estructura: muestra el error y no marca como enviado

UX:

- [ ] Vista previa del template con variables sustituidas antes de enviar

**Prioridad:** P0
**Estimación:** L
**Dependencias:** US-E4-2, US-E4-5
**Notas técnicas:** F4-T5. Idioma `"es"` (NO `es_PA`), `components.parameters` array PLANO (gotchas Movinsa, Blueprint §3.7).

---

### US-E4-5: Gestionar templates (CRUD + estados Meta)

**Como** Manager
**Quiero** crear, clonar y ver el estado de las plantillas de mi workspace
**Para** tener plantillas listas para usar fuera de ventana

**Acceptance Criteria:**

Funcionalidad:

- [ ] Listado de templates con su `status` (draft/submitted/approved/rejected/paused) y `rejection_reason`
- [ ] Crear/editar/clonar template con body, variables posicionales, componentes (header/body/buttons/footer)
- [ ] Idioma default `"es"`

Validaciones:

- [ ] Nombre único por `(workspace, name, language)`: "Ya existe una plantilla con ese nombre e idioma."
- [ ] Validación de estructura de variables antes de guardar

Error Handling:

- [ ] **Empty state**: "Aún no tienes plantillas. Crea una para enviar mensajes fuera de la ventana de 24h."

UX:

- [ ] Badge de estado por template; `rejected` muestra el motivo
- [ ] **Loading state** al guardar

**Prioridad:** P0
**Estimación:** L
**Dependencias:** US-E1-1
**Notas técnicas:** `templates` §3.7. Reuse de `whatsapp_templates` del ATS (Blueprint §6). F4-T3.

---

### US-E4-6: Sincronizar templates desde YCloud/Meta

**Como** Manager
**Quiero** sincronizar el estado de mis plantillas desde YCloud/Meta
**Para** que el listado refleje las aprobaciones/rechazos reales

**Acceptance Criteria:**

Funcionalidad:

- [ ] Acción "Sincronizar" trae el estado actual de los templates desde YCloud
- [ ] Actualiza `status`, `provider_template_id` y `rejection_reason` locales
- [ ] Validación de estructura tras el sync

Validaciones:

- [ ] Solo `admin/manager` pueden sincronizar

Error Handling:

- [ ] Si YCloud no responde: "No pudimos sincronizar las plantillas. Intenta más tarde." (sin alterar estados locales)

UX:

- [ ] **Loading state** durante el sync; resumen de cuántos se actualizaron

**Prioridad:** P1
**Estimación:** M
**Dependencias:** US-E4-5
**Notas técnicas:** F4-T4. `fetchMetaTemplates` adaptado a endpoint YCloud (Blueprint §5).

---

## Epic 5 — CRM Básico + Sync HighLevel (Fase 5) · M4, M13

> Capa de contexto conversacional con dedupe por teléfono y sincronización bidireccional con HighLevel.

### US-E5-1: Ver y editar el contacto desde el inbox (panel lateral)

**Como** Agent
**Quiero** ver y editar los datos del contacto sin salir de la conversación
**Para** mantener el contexto comercial actualizado mientras converso

**Acceptance Criteria:**

Funcionalidad:

- [ ] Panel lateral muestra nombre, teléfono, email, fuente, owner, stage, tags, custom fields, opt-in
- [ ] Edición rápida inline desde el panel
- [ ] Los cambios se guardan en `contacts` y se reflejan en realtime

Validaciones:

- [ ] Email con formato inválido: "Ingresa un email válido."
- [ ] Solo `admin/manager/agent` editan (Viewer solo lee)

Error Handling:

- [ ] Si falla el guardado: "No pudimos guardar los cambios del contacto."

UX:

- [ ] **Loading state** al abrir el panel
- [ ] Indicador de guardado exitoso

**Prioridad:** P0
**Estimación:** M
**Dependencias:** US-E1-6
**Notas técnicas:** `contacts` §3.4. Panel CRM nuevo. F5-T1/T2.

---

### US-E5-2: Dedupe de contacto por teléfono

**Como** Sistema
**Quiero** garantizar que cada teléfono tenga un solo contacto por workspace
**Para** no fragmentar el historial ni duplicar leads

**Acceptance Criteria:**

Funcionalidad:

- [ ] Constraint `UNIQUE (workspace_id, phone)` impide duplicados
- [ ] Al entrar un inbound de un teléfono existente, se reutiliza el contacto
- [ ] El teléfono se normaliza a E.164 antes de cualquier escritura

Validaciones:

- [ ] Crear contacto manual con teléfono existente: "Ya existe un contacto con este teléfono." y ofrece abrir el existente

Error Handling:

- [ ] Colisión en inserción concurrente se resuelve como upsert (no error al usuario)

UX:

- [ ] Al detectar duplicado en alta manual, link directo al contacto existente

**Prioridad:** P0
**Estimación:** S
**Dependencias:** US-E1-3
**Notas técnicas:** `uq_contacts_workspace_phone` §3.4. Flujo crítico de dedupe.

---

### US-E5-3: Gestionar tags de conversación y contacto

**Como** Agent
**Quiero** agregar y quitar etiquetas a contactos y conversaciones
**Para** segmentar y organizar mi pipeline

**Acceptance Criteria:**

Funcionalidad:

- [ ] CRUD de tags y asignación desde el panel del contacto y desde la conversación
- [ ] Las tags se almacenan en `contacts.tags[]`
- [ ] Filtro de la lista por tag

Validaciones:

- [ ] Tag vacía o duplicada no se agrega

Error Handling:

- [ ] Si falla la asignación: revierte el cambio visual

UX:

- [ ] **Empty state**: "Sin etiquetas. Agrega una para organizar este contacto."

**Prioridad:** P1
**Estimación:** M
**Dependencias:** US-E5-1
**Notas técnicas:** GIN index en `tags` §3.4. F5-T3. Auto-tagging por intención queda en v1.5.

---

### US-E5-4: Conectar HighLevel y sincronizar contacto + tags

**Como** Admin
**Quiero** conectar mi subcuenta de HighLevel y sincronizar contactos y tags
**Para** mantener un único registro entre la plataforma y mi CRM

**Acceptance Criteria:**

Funcionalidad:

- [ ] Conexión de HighLevel (OAuth/API) guardada cifrada en `integrations`
- [ ] Push: crear/actualizar contacto y tags en HighLevel; guarda `hl_contact_id`
- [ ] Pull: traer datos del contacto desde HighLevel para contexto de IA
- [ ] Mapeo de campos configurable

Validaciones:

- [ ] Credenciales inválidas: "No pudimos conectar con HighLevel. Verifica tus credenciales."
- [ ] Solo `admin` configura la integración

Error Handling:

- [ ] Errores de API con retries y log en `events`; sin romper el flujo del inbox

UX:

- [ ] Estado de conexión visible (conectado/desconectado) en settings
- [ ] **Loading state** durante el sync inicial

**Prioridad:** P0
**Estimación:** L
**Dependencias:** US-E5-1
**Notas técnicas:** `integrations` cifrado §3.8/§3.11. Blueprint §5. F5-T4.

---

### US-E5-5: Recibir actualizaciones de HighLevel por webhook

**Como** Sistema
**Quiero** actualizar el contacto local cuando HighLevel notifique cambios
**Para** mantener sincronía bidireccional sin polling

**Acceptance Criteria:**

Funcionalidad:

- [ ] Endpoint inbound de webhooks HighLevel actualiza el contacto local por `hl_contact_id`
- [ ] El cambio se refleja en el panel CRM en realtime

Validaciones:

- [ ] Webhook sin contacto correspondiente local se ignora con log

Error Handling:

- [ ] Payload malformado: responde 200 y registra `event level=warn` (no reintenta en bucle)

UX:

- [ ] N/A directo

**Prioridad:** P1
**Estimación:** M
**Dependencias:** US-E5-4
**Notas técnicas:** F5-T5. Blueprint §5 (webhooks inbound HighLevel).

---

### US-E5-6: Notas internas en la conversación

**Como** Agent
**Quiero** escribir notas internas no visibles para el contacto
**Para** dejar contexto a mi equipo sin enviar nada por WhatsApp

**Acceptance Criteria:**

Funcionalidad:

- [ ] Notas internas asociadas a la conversación, marcadas como `type='system'`/internas
- [ ] Visibles solo en la webapp, nunca se envían a YCloud

Validaciones:

- [ ] Nota vacía no se guarda

Error Handling:

- [ ] Si falla el guardado: "No pudimos guardar la nota."

UX:

- [ ] Diferenciación visual clara entre nota interna y mensaje real
- [ ] **Empty state**: "Sin notas internas en esta conversación."

**Prioridad:** P1
**Estimación:** S
**Dependencias:** US-E1-6
**Notas técnicas:** BRIEF M1 (notas internas). Garantía: jamás sale a WhatsApp.

---

## Epic 6 — Tools + Agendamiento (Fase 6) · M7, M9

> Tool-calling productivo con confirmación de acciones sensibles y agendamiento por link o HighLevel directo.

### US-E6-1: Activar/desactivar tools por workspace con credenciales

**Como** Admin
**Quiero** habilitar las tools que mi agente puede usar y configurar sus credenciales
**Para** controlar qué acciones puede ejecutar la IA en mi nombre

**Acceptance Criteria:**

Funcionalidad:

- [ ] Catálogo de tools con toggle enabled/disabled por workspace (`tool_configs`)
- [ ] Credenciales por tool guardadas cifradas
- [ ] Flag de "confirmación previa" para acciones sensibles por tool

Validaciones:

- [ ] Solo `admin` (o capability `tools.configure`) configura tools
- [ ] Credenciales requeridas faltantes: "Faltan credenciales para activar esta tool."

Error Handling:

- [ ] Tool sin credenciales válidas queda deshabilitada y avisa

UX:

- [ ] Lista de tools con estado y descripción de qué hace cada una

**Prioridad:** P0
**Estimación:** M
**Dependencias:** US-E5-4
**Notas técnicas:** `tools`/`tool_configs` cifrado §3.8/§3.11. F6-T1.

---

### US-E6-2: Tool-calling en el agent runtime

**Como** Contacto
**Quiero** que la IA ejecute acciones reales (consultar datos, agendar, etiquetar) durante la conversación
**Para** resolver mi solicitud sin que intervenga un humano

**Acceptance Criteria:**

Funcionalidad:

- [ ] El runtime expone al modelo solo las tools con `enabledFor(workspace)=true`
- [ ] El modelo invoca tools vía Vercel AI SDK v5 y el resultado vuelve a la conversación
- [ ] Cada tool valida sus args con su ZodSchema

Validaciones:

- [ ] Args inválidos: la tool rechaza y el runtime maneja el fallback sin enviar basura

Error Handling:

- [ ] Timeout/retry/fallback por tool configurables; si falla definitivamente, usa fallback prompt
- [ ] Cada tool call se registra en `events type='tool_call'` (args + resultado + latency)

UX:

- [ ] N/A directo

**Prioridad:** P0
**Estimación:** L
**Dependencias:** US-E6-1, US-E3-4
**Notas técnicas:** Contrato Tool §4.5 (F0-T3). `registry.ts`. F6-T2/T3.

---

### US-E6-3: Confirmación previa para acciones sensibles

**Como** Manager
**Quiero** que ciertas acciones de la IA requieran confirmación antes de ejecutarse
**Para** evitar que la IA haga algo irreversible sin supervisión

**Acceptance Criteria:**

Funcionalidad:

- [ ] Tools marcadas como sensibles no se ejecutan directo: quedan en estado "pendiente de confirmación"
- [ ] Un humano confirma o rechaza la acción desde el inbox
- [ ] La acción solo se ejecuta tras confirmación

Validaciones:

- [ ] Solo roles autorizados pueden confirmar la acción

Error Handling:

- [ ] Si la acción confirmada falla al ejecutarse, se muestra el error y queda registrada

UX:

- [ ] Tarjeta de acción pendiente en el hilo con botones "Confirmar" / "Rechazar"
- [ ] Indica qué hará exactamente la acción antes de confirmar

**Prioridad:** P0
**Estimación:** M
**Dependencias:** US-E6-2
**Notas técnicas:** BRIEF M7 ("confirmación previa para acciones sensibles"). Flujo crítico.

---

### US-E6-4: Agendamiento por link externo

**Como** Contacto
**Quiero** recibir un enlace de agenda cuando quiero reservar una cita
**Para** elegir horario yo mismo sin ida y vuelta

**Acceptance Criteria:**

Funcionalidad:

- [ ] Tool que devuelve el link configurado (Cal.com/Calendly/otro) por workspace/campaña/agente
- [ ] El link se inserta en la respuesta al contacto

Validaciones:

- [ ] Si no hay link configurado: la tool no se ofrece y registra log

Error Handling:

- [ ] Config faltante cae a un fallback (mensaje + handoff)

UX:

- [ ] N/A directo

**Prioridad:** P1
**Estimación:** S
**Dependencias:** US-E6-2
**Notas técnicas:** `schedules.mode='external_link'` §3.9. F6-T4.

---

### US-E6-5: Agendamiento directo en HighLevel

**Como** Contacto
**Quiero** que la IA agende mi cita directamente
**Para** confirmar mi reserva en el momento sin salir de WhatsApp

**Acceptance Criteria:**

Funcionalidad:

- [ ] Tool que crea la cita vía API HighLevel con el payload mapeado
- [ ] Valida timezone, disponibilidad, nombre y teléfono antes de crear
- [ ] Registra el resultado en `appointments` + en la conversación, guarda `hl_appointment_id`

Validaciones:

- [ ] Datos incompletos: la IA pide lo que falta antes de agendar
- [ ] Horario no disponible: ofrece alternativas o handoff

Error Handling:

- [ ] Si HighLevel rechaza la creación: no marca como agendado y registra `event level=error`

UX:

- [ ] Confirmación de la cita enviada al contacto con fecha/hora

**Prioridad:** P1
**Estimación:** L
**Dependencias:** US-E6-5 requiere US-E5-4, US-E6-2
**Notas técnicas:** `schedules.mode='highlevel'`, `appointments` §3.9. Blueprint §5. F6-T5.

---

### US-E6-6: Validar ventana abierta como tool antes de enviar

**Como** Sistema
**Quiero** una tool que valide si la ventana de 24h está abierta y elija template si está cerrada
**Para** que el agente nunca intente free text fuera de ventana vía tool-calling

**Acceptance Criteria:**

Funcionalidad:

- [ ] Tool `validar ventana` consulta `window_expires_at` y devuelve abierta/cerrada
- [ ] Si está cerrada, la tool fuerza la ruta de template aprobado

Validaciones:

- [ ] Resultado siempre fail-safe a "cerrada" si el estado es ambiguo

Error Handling:

- [ ] Error de cálculo → cerrada + log

UX:

- [ ] N/A

**Prioridad:** P0
**Estimación:** S
**Dependencias:** US-E4-2, US-E6-2
**Notas técnicas:** BRIEF M7 (tool "validar ventana WhatsApp abierta"). Refuerza el guardrail de E4.

---

## Epic 7 — Setter + Business Info + Custom Prompting + KB (Fase 7) · M5, M6, M8, M12

> Calificación de leads, contexto de negocio estructurado, prompting jerárquico y knowledge base con prioridad de fuentes.

### US-E7-1: Configurar información del negocio

**Como** Manager
**Quiero** capturar la info de mi negocio en formularios estructurados y texto libre
**Para** que la IA responda con datos reales sin meter todo en el prompt

**Acceptance Criteria:**

Funcionalidad:

- [ ] Formulario estructurado (`structured` JSONB): servicios, FAQs, horarios, zonas, precios, políticas, claims permitidos/prohibidos, CTA
- [ ] Campo de texto libre adicional
- [ ] La info se inyecta como contexto al prompt del agente

Validaciones:

- [ ] Un workspace tiene un solo `business_info` (UNIQUE)

Error Handling:

- [ ] Si falla el guardado: "No pudimos guardar la información del negocio."

UX:

- [ ] **Loading state** al guardar; secciones colapsables

**Prioridad:** P1
**Estimación:** M
**Dependencias:** US-E1-1
**Notas técnicas:** `business_info` §3.6. F7-T1.

---

### US-E7-2: Custom prompting jerárquico con versionado

**Como** Manager
**Quiero** definir prompts por scope (global > número > campaña > segmento > modo) con versiones draft/published
**Para** ajustar el comportamiento de la IA sin tocar código y sin riesgo

**Acceptance Criteria:**

Funcionalidad:

- [ ] Crear prompts por scope; el motor resuelve el activo por jerarquía
- [ ] Versiones draft/published; solo una published vigente por prompt (`active_version_id`)
- [ ] Variables dinámicas inyectadas (nombre, fuente, stage, horario, owner)
- [ ] Fallback prompt y guardrails (qué no prometer, cuándo escalar)
- [ ] Playground para probar el prompt antes de publicar

Validaciones:

- [ ] No se puede publicar una versión con variables no resueltas: avisa cuáles faltan
- [ ] Solo `admin/manager` (o capability) editan prompts

Error Handling:

- [ ] Si falla la resolución del prompt activo, usa el fallback

UX:

- [ ] Historial de versiones con quién y cuándo publicó
- [ ] **Loading state** en el playground

**Prioridad:** P1
**Estimación:** L
**Dependencias:** US-E7-1
**Notas técnicas:** `prompts`/`prompt_versions` §3.6, `prompt_scope`. F7-T2.

---

### US-E7-3: Modo setter con knockout questions y score

**Como** Manager
**Quiero** activar un modo setter con preguntas de calificación, knockout rules y score
**Para** que la IA califique leads automáticamente y avance solo los buenos

**Acceptance Criteria:**

Funcionalidad:

- [ ] Toggle de setter por workspace/conversación (`setter_configs`)
- [ ] Secuencia configurable de preguntas (obligatorias/opcionales)
- [ ] Knockout rules (presupuesto, ubicación, giro, headcount, idioma…)
- [ ] Score → calificado / no calificado / revisar manual + resumen automático del lead
- [ ] Acción posterior configurable: agendar, crear oportunidad, handoff, actualizar HighLevel

Validaciones:

- [ ] Config de scoring sin umbral: "Define un umbral de calificación."

Error Handling:

- [ ] Si una knockout rule no se puede evaluar, marca "revisar manual"

UX:

- [ ] Resumen del lead visible en el panel CRM
- [ ] **Empty state**: "No has configurado el modo setter."

**Prioridad:** P1
**Estimación:** L
**Dependencias:** US-E7-2
**Notas técnicas:** `setter_configs` §3.9. F7-T3.

---

### US-E7-4: Cargar y gestionar la Knowledge Base

**Como** Manager
**Quiero** subir documentos, FAQs, URLs y snippets a una base de conocimiento
**Para** que la IA responda con información gobernada y trazable

**Acceptance Criteria:**

Funcionalidad:

- [ ] Ingest de docs/FAQs/URLs/snippets → `kb_documents` + chunking + embeddings en `kb_chunks` (pgvector)
- [ ] Activación de la KB por workspace/agente
- [ ] Listado de documentos con su `source_type`

Validaciones:

- [ ] Formato/URL inválido: mensaje de error específico
- [ ] Documento vacío no se ingesta

Error Handling:

- [ ] Si la generación de embeddings falla, el doc queda marcado como "pendiente" con retry

UX:

- [ ] **Empty state**: "Tu base de conocimiento está vacía. Sube tu primer documento."
- [ ] **Loading state** durante el ingest

**Prioridad:** P2
**Estimación:** L
**Dependencias:** US-E7-1
**Notas técnicas:** `kb_documents`/`kb_chunks` HNSW §3.8. F7-T4.

---

### US-E7-5: Prioridad de fuentes y citación

**Como** Contacto
**Quiero** que la IA responda con la fuente correcta y priorizada (KB > prompt > tools)
**Para** recibir información confiable y consistente

**Acceptance Criteria:**

Funcionalidad:

- [ ] El motor de decisión aplica prioridad KB > prompt > tools al construir la respuesta
- [ ] Se registra la fuente usada (trazabilidad) en `events`
- [ ] Fallback cuando ninguna fuente tiene respuesta (mensaje + posible handoff)

Validaciones:

- [ ] Si la KB no tiene match por encima del umbral, no se cita

Error Handling:

- [ ] Si la búsqueda semántica falla, cae a prompt/tools sin romper

UX:

- [ ] N/A directo

**Prioridad:** P2
**Estimación:** M
**Dependencias:** US-E7-4, US-E3-4
**Notas técnicas:** F7-T5. Extiende el `decision-engine.ts`.

---

### US-E7-6: Configurar modelo OpenRouter por workspace/tarea

**Como** Admin
**Quiero** elegir el modelo OpenRouter por workspace y por tarea, con fallback y límites de costo
**Para** balancear calidad y costo según mi operación

**Acceptance Criteria:**

Funcionalidad:

- [ ] API key OpenRouter guardada cifrada en `integrations`
- [ ] Modelo por tarea (clasificación vs respuesta) + parámetros (temperature, max tokens)
- [ ] Fallback model y límite de costo/uso

Validaciones:

- [ ] API key inválida: "No pudimos validar tu API key de OpenRouter."
- [ ] Solo `admin` configura

Error Handling:

- [ ] Si el modelo principal falla, usa el fallback y registra el evento

UX:

- [ ] Estado de conexión y modelo activo visible en settings

**Prioridad:** P1
**Estimación:** M
**Dependencias:** US-E1-4
**Notas técnicas:** `integrations` provider `openrouter` §3.8. Blueprint M11. Habilita métricas de US-E8-3.

---

## Epic 8 — Multimedia Completo + Observabilidad + Roles (Fase 8) · M11, M16, M17

> Cierra el Core v1: media completa, visibilidad de costos/decisiones y control de acceso por rol.

### US-E8-1: Recibir y procesar multimedia entrante

**Como** Contacto
**Quiero** enviar audios, imágenes, documentos y videos y que la IA los entienda
**Para** comunicarme como lo haría normalmente por WhatsApp

**Acceptance Criteria:**

Funcionalidad:

- [ ] Descarga de media vía `link` YCloud y store en Supabase Storage privado por tenant
- [ ] Audio → transcripción; imagen → caption/visión; documento/video → referencia almacenada
- [ ] `messages.media` guarda `{storage_path, mime, ycloud_media_id, transcript, caption}`

Validaciones:

- [ ] Tipo de media no soportado se registra y se maneja con mensaje genérico

Error Handling:

- [ ] Si la descarga del media falla: registra `event level=error` y el mensaje conserva el texto/caption disponible

UX:

- [ ] N/A directo (alimenta US-E8-2)

**Prioridad:** P1
**Estimación:** L
**Dependencias:** US-E2-3
**Notas técnicas:** Blueprint §4 (media), `messages.media` §3.5. F8-T1.

---

### US-E8-2: Render de multimedia en el hilo + composer media

**Como** Agent
**Quiero** ver y enviar audio, imagen, documento y video en la conversación
**Para** atender visualmente igual que en WhatsApp Web

**Acceptance Criteria:**

Funcionalidad:

- [ ] Render de cada tipo de media en el hilo (player de audio, preview de imagen, link de documento, player de video)
- [ ] Composer humano permite enviar texto, audio, imagen, documento y video

Validaciones:

- [ ] Archivo que excede el límite: "El archivo es muy grande."
- [ ] El composer media respeta el guardrail de ventana 24h (US-E4-2)

Error Handling:

- [ ] Si un media no carga: placeholder con opción de reintentar

UX:

- [ ] Thumbnails y previews; **loading state** en subida

**Prioridad:** P1
**Estimación:** M
**Dependencias:** US-E8-1
**Notas técnicas:** Reuse `whatsapp-attachment.tsx` del ATS (Blueprint §6). F8-T2.

---

### US-E8-3: Observabilidad de eventos, tokens y costo

**Como** Manager
**Quiero** ver logs de eventos y el costo/tokens por conversación
**Para** auditar el comportamiento de la IA y controlar el gasto

**Acceptance Criteria:**

Funcionalidad:

- [ ] Registro en `events` de: webhook, decisión, tool call, envío, error, flush de buffer, cambio de estado, sync HighLevel
- [ ] Métricas de tokens y costo por conversación (OpenRouter) en `events type='llm_usage'`
- [ ] Vista de observabilidad filtrable por tipo y conversación

Validaciones:

- [ ] Solo `admin/manager` ven costos y logs

Error Handling:

- [ ] **Empty state**: "Sin eventos registrados en este rango."

UX:

- [ ] Vista legible (no JSON crudo); **loading state** al filtrar
- [ ] Costo agregado por conversación visible en el panel

**Prioridad:** P1
**Estimación:** M
**Dependencias:** US-E7-6
**Notas técnicas:** `events` §3.9. F8-T3. Consolida logs de E2-E7.

---

### US-E8-4: Roles y permisos (Admin/Manager/Agent/Viewer)

**Como** Admin
**Quiero** asignar roles y que cada rol solo pueda hacer lo que le corresponde
**Para** proteger configuración sensible y costos

**Acceptance Criteria:**

Funcionalidad:

- [ ] Roles `admin/manager/agent/viewer` por membership
- [ ] Gating de acciones: encender/apagar IA, responder, editar prompts/templates, conectar tools, ver costos/logs, forzar envíos, handoff
- [ ] Overrides finos vía `permissions` (capabilities puntuales)

Validaciones:

- [ ] Acción no permitida: bloqueada server-side (RLS/`auth_has_role`), no solo oculta en UI
- [ ] Viewer no puede enviar ni editar nada

Error Handling:

- [ ] Intento no autorizado: "No tienes permisos para realizar esta acción."

UX:

- [ ] Pantalla de gestión de equipo con roles asignables
- [ ] Acciones no permitidas aparecen deshabilitadas con tooltip

**Prioridad:** P0
**Estimación:** L
**Dependencias:** US-E1-1
**Notas técnicas:** `memberships`/`permissions` §3.3, `auth_has_role()` §3.2/§3.10. F8-T4. Endurece el gating preliminar de E1.

---

### US-E8-5: Settings completos + coexistencia móvil

**Como** Admin
**Quiero** un panel de settings con todas las secciones y un inbox usable en móvil
**Para** configurar todo en un solo lugar y operar desde el celular

**Acceptance Criteria:**

Funcionalidad:

- [ ] Settings con secciones: WhatsApp/YCloud, templates, OpenRouter/modelos, business info, prompting, tools, KB, setter, scheduling, HighLevel, handoff, equipo/roles, logs
- [ ] Inbox responsive: lista y hilo navegables en móvil
- [ ] Coexistencia: si el número se opera también desde el celular, los mensajes igual se persisten y muestran

Validaciones:

- [ ] Cada sección valida sus campos según su módulo

Error Handling:

- [ ] Sección que falla al cargar muestra error aislado sin tumbar el resto

UX:

- [ ] Navegación clara entre secciones; **loading state** por sección
- [ ] Layout móvil con transición lista↔hilo

**Prioridad:** P2
**Estimación:** L
**Dependencias:** US-E8-4
**Notas técnicas:** BRIEF M15. F8-T5. Coexistencia móvil (Blueprint).

---

## Resumen de Dependencias

```
US-E1-1 (Login) → US-E1-2 (Webhook) → US-E1-3 (Dedupe/ingreso) → US-E1-4 (IA responde)
                                                                  → US-E1-5 (Lista) → US-E1-6 (Hilo realtime)
                                                                        → US-E1-7 (Toggle IA) → US-E1-8 (Composer)
US-E1-4 → US-E2-1 (Buffer) → US-E2-2 (Consolidar) → US-E2-3 (Multimodal)
US-E1-7 → US-E3-1 (State machine) → US-E3-2/3/4 (Handoff + motor)
US-E1-6 → US-E4-1 (Ventana) → US-E4-2 (Bloqueo free text) → US-E4-4 (Enviar template) ← US-E4-5 (Gestión templates)
US-E1-6 → US-E5-1 (Panel CRM) → US-E5-4 (HighLevel) → US-E5-5 (Webhook HL)
US-E5-4 → US-E6-1 (Tools) → US-E6-2 (Tool-calling) → US-E6-3 (Confirmación) / US-E6-5 (Agenda HL) / US-E6-6 (Validar ventana)
US-E7-1 → US-E7-2 (Prompting) → US-E7-3 (Setter); US-E7-4 (KB) → US-E7-5 (Prioridad fuentes)
US-E8-4 (Roles) endurece gating de E1; US-E8-3 (Observabilidad) consolida logs E2-E7
```

## Flujos Críticos (mapa a stories)

| Flujo crítico                                       | Stories                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| Handoff IA↔humano                                   | US-E3-2 (manual), US-E3-3 (automático), US-E3-4 (motor), US-E3-6 (notificación) |
| Bloqueo free text fuera de ventana 24h              | US-E4-1, US-E4-2, US-E4-3 (override), US-E6-6 (tool)                            |
| Buffer por silencio                                 | US-E2-1, US-E2-2, US-E2-4 (bypass)                                              |
| Tool-calling con confirmación de acciones sensibles | US-E6-2, US-E6-3                                                                |
| Dedupe de contacto por teléfono                     | US-E1-3, US-E5-2                                                                |

## Stories Diferidos (Post-Core v1)

| Story                                                | Razón de diferimiento                    | Fase tentativa |
| ---------------------------------------------------- | ---------------------------------------- | -------------- |
| Auto-tagging por intención                           | Nice to have, no bloquea                 | v1.5           |
| Resúmenes automáticos de conversación                | Mejora, no core                          | v1.5           |
| Notificaciones de handoff por canales externos       | In-app cubre v1 (US-E3-6)                | v1.5           |
| Dashboard de métricas avanzado                       | Observabilidad básica cubre v1 (US-E8-3) | v1.5           |
| Búsqueda semántica en conversaciones                 | Mejora de inbox                          | v1.5           |
| SLA y prioridad                                      | No bloquea operación                     | v1.5           |
| Multiagente / multi-número por workspace             | Cambio de arquitectura                   | v2             |
| Pipelines/oportunidades + flujos visuales            | Producto mayor                           | v2             |
| A/B testing y auto-optimización de prompts/templates | Optimización                             | v2             |
| Marketplace de tools                                 | Plataforma extendida                     | v2             |

---

## Tabla Resumen (Epic | # stories | P0/P1/P2)

| Epic                                    | # Stories | P0     | P1     | P2    |
| --------------------------------------- | --------- | ------ | ------ | ----- |
| E1: MVP Camino Feliz                    | 8         | 8      | 0      | 0     |
| E2: Buffer Inteligente                  | 5         | 2      | 2      | 1     |
| E3: State Machine + Handoff             | 6         | 4      | 2      | 0     |
| E4: Ventana 24h + Templates             | 6         | 4      | 2      | 0     |
| E5: CRM + HighLevel                     | 6         | 3      | 3      | 0     |
| E6: Tools + Agendamiento                | 6         | 4      | 2      | 0     |
| E7: Setter + Prompting + KB             | 6         | 0      | 4      | 2     |
| E8: Multimedia + Observabilidad + Roles | 5         | 1      | 3      | 1     |
| **TOTAL**                               | **48**    | **26** | **18** | **4** |

> Nota de conteo: 48 stories (P0: 26 · P1: 18 · P2: 4). El header preliminar (54/33/17/4) se corrige aquí tras el desglose final por fase.

---

_User Stories generados con Forge · La Herrería Skill #5 (User Stories) · Pendiente aprobación antes de avanzar al siguiente skill._
