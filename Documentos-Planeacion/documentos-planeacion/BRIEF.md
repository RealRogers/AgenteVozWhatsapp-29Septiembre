---
proyecto: 01 — Agente de WhatsApp
estado: brief de producto v1 — listo para `forge plan`
construido_con: Forge
actualizado: 2026-06-08
relacionado: ARQUITECTURA-OBJETIVO.md
---

# Proyecto 01 — Plataforma de WhatsApp con IA (inbox conversacional operable por humano)

> **No es "solo un bot".** Es una **plataforma de inbox conversacional para WhatsApp con IA, operable por humano**:
> combina **inbox + CRM básico + motor de automatización/agent runtime + handoff humano + integraciones +
> cumplimiento estricto de reglas Meta/WhatsApp**.

## Qué es (definición corta para el agente)
- Webapp **tipo WhatsApp Web** para gestionar conversaciones.
- IA conectada a WhatsApp con **modo automático** y **modo humano**.
- **CRM básico** para contactos y contexto comercial.
- Tools, knowledge base y conectores **activables por workspace**.
- **Modo setter** para calificación, knockout questions y agendamiento.
- Integración nativa con **HighLevel** + enlaces externos de agenda.
- Gestión de **templates**, **ventana de 24h** y **cumplimiento Meta**.

## Decisiones fijas (NO re-discutir en el plan)
| Tema | Decisión |
|------|----------|
| Proveedor WhatsApp | **YCloud (único)** — sin Kapso ni Meta directo, por simplicidad |
| LLM | **OpenRouter** (gateway; modelo seleccionable por workspace/tarea) |
| Integración oficial v1 | **HighLevel (only)** |
| Stack | Next.js + Tailwind + shadcn + **Supabase** |
| Multi-tenancy | Por **workspace** (multi-tenant desde el diseño) |
| Construcción / entrega | **Forge** · repo one-click install + onboarding |
| Referencia YCloud | Repo **Movinsa** — shapes/gotchas reales de YCloud (NO es tenant del producto; ver `ARQUITECTURA-OBJETIVO.md`) |

## Onboarding (wizard)
1. **Caso de uso / modo:** setter · ventas · soporte/servicio · agendamiento → siembra prompt + tools.
2. **Información del negocio** (módulo Business Info).
3. **Conectar YCloud** (credenciales) + número.
4. **(Opcional) HighLevel + OpenRouter API key.**
→ Agente activo.

---

## MÓDULOS

### 1. Inbox conversacional — superficie principal
Layout estilo **WhatsApp Web**: lista de conversaciones a la izquierda, conversación activa a la derecha, controles de estado IA/humano arriba.
- Lista: **búsqueda, filtros, etiquetas, asignado, último mensaje, hora, estado, canal**.
- Conversación: **historial completo, eventos del sistema, timeline de acciones**.
- **Composer**: texto, audio, imágenes, documentos, video y **templates aprobados**.
- **Estado visible de la ventana de 24h** por conversación.
- Botón superior **encender/apagar IA** por conversación.
- Botón **"derivar a humano"**.
- Indicador: asignada · atendida por IA · atendida por humano · en handoff.
- **Notas internas** (no visibles para el contacto).
- Etiquetas **manuales y automáticas**.
- Acciones rápidas: cerrar, reabrir, archivar, marcar prioridad, copiar teléfono, abrir CRM.

### 2. Buffer y agrupación inteligente ⭐ (diferenciador)
En vez de responder cada mensaje al instante, espera una ventana corta para **agrupar intención** (evita "hola"→responde, "me das informes"→responde de nuevo).
- **Delay configurable** por workspace / número / conversación (p.ej. 10–60 s).
- El buffer **se reinicia** mientras sigan llegando mensajes en la ventana.
- Todo el batch se procesa como **un solo bloque semántico**.
- Agrupa **texto + audio transcrito + captions de imagen + archivos relevantes**.
- **Reglas por tipo** (p.ej. esperar más si llega un audio).
- Se dispara por **silencio del usuario**, no por "primer mensaje recibido".
- **Logs** de qué mensajes fueron al mismo batch.
- **Bypass** para urgentes o plantillas/botones interactivos.

### 3. Modos de operación IA / humano (state machine)
La conversación es un **estado operativo**, no solo un chat.
**Estados:** IA activa · Humano activo · Handoff pendiente · Esperando respuesta del usuario · Pausada/snoozed · Cerrada.
**Comportamiento:**
- IA activa → responde automáticamente según reglas.
- IA apagada → humano responde desde la webapp o desde el celular (coexistencia móvil + Cloud API sobre el mismo número).
- IA detecta **baja confianza / objeción compleja / enojo / solicitud de humano / límite de capacidad** → activa **handoff**.
- Handoff → cambia a **modo humano** + **notifica al equipo**.
- La IA **se puede reactivar** manualmente tras el handoff.

### 4. CRM básico (context layer conversacional, NO un CRM completo)
**Contacto:** nombre · teléfono · email (opc) · fuente · owner/agente · tags · custom fields · estado/stage · última interacción · consentimiento/opt-in · relación con HighLevel.
**Funciones:** crear/actualizar al entrar mensaje · **dedupe por teléfono** · vista lateral del contacto en el inbox · edición rápida sin salir de la conversación · historial de tags/notas/cambios · **sync bidireccional con HighLevel** (al menos contacto y tags).

### 5. Información del negocio (módulo aparte del prompt)
Contexto empresarial **estructurado**, separado de las instrucciones narrativas.
**Campos:** nombre · qué vende/descripción · servicios/productos · FAQs · horarios · zonas de atención · precios/rangos · políticas · objeciones frecuentes · **claims permitidos / prohibidos** · tono de marca · enlaces · CTA principal · datos para agenda/pagos/seguimiento.
**Forma:** parte libre en texto + parte estructurada en formularios (para que el agente la use mejor).

### 6. Custom prompting (sin tocar código)
- System prompt **global por workspace**.
- Prompt por **número** · por **campaña/funnel** · por **etiqueta/segmento** · por **modo** (soporte/ventas/setter).
- **Variables dinámicas** inyectadas: nombre, fuente, stage, horario, dueño del lead…
- **Versionado** · **draft vs published** · historial de cambios · **playground** de prueba.
- **Fallback prompt** si falla una tool o falta contexto.
- **Guardrails**: qué no prometer, qué no decir, cuándo escalar.
- Reglas de estilo: longitud, formalidad, idioma, emojis, tono.

### 7. Tools / conectores (activables, NO hardcodeados)
**Catálogo:** KB search · consulta a base de datos · consulta a APIs internas · crear/actualizar contacto HighLevel · agendar cita · consultar disponibilidad · enviar enlace de agenda · etiquetar conversación/contacto · actualizar stage/custom field · **validar ventana WhatsApp abierta** · **elegir template permitido** · **transferir a humano** · crear nota interna · webhook custom.
**Requisitos:** habilitar/deshabilitar por workspace · credenciales por tool · qué tools puede usar cada agente · **logs de tool calls** · timeout/retry/fallback · **confirmación previa** para acciones sensibles.

### 8. Setter y calificación (modo, no otro producto)
**Objetivo:** calificar lead · preguntas de descubrimiento · **knockout questions** · decidir si avanza · intentar agendar.
**Specs:** toggle por workspace/conversación · secuencia configurable de preguntas (obligatorias/opcionales) · **knockout rules** (presupuesto, ubicación, giro, headcount, edad, idioma…) · **score** (calificado / no calificado / revisar manual) · **resumen automático** del lead · acción posterior configurable (mandar agenda, crear oportunidad, mandar a humano, actualizar HighLevel).

### 9. Agendamiento (dos caminos)
**Por link:** Cal.com / Calendly / otro · link configurable por workspace/campaña/agente · plantillas con CTA de agenda.
**Directo:** integración **HighLevel** (crear cita vía API/endpoint) · mapeo de payload configurable · validaciones (timezone, disponibilidad, nombre, teléfono) · confirmación y reprogramación · registro del resultado en conversación + CRM.

### 10. Templates y cumplimiento Meta ⚠️ (crítico — rompe o funciona)
**Reglas obligatorias:**
- Ventana **abierta (<24h)** → permitir mensajes libres (no-template).
- Ventana **cerrada** → **bloquear** free text y **obligar template aprobado**.
- Mostrar en UI si la conversación está **dentro/fuera de ventana**.
- **Sugerir** templates válidos cuando la ventana esté cerrada.
- El humano **no puede forzar** free text fuera de ventana (o requiere **override admin con warning**).
**Gestión de templates:** crear · editar/clonar · **enviar a validación Meta** · estados (draft/submitted/approved/rejected/paused) · **sincronizar desde Meta** · (opc) sync con HighLevel · soportar texto/media/variables/botones/ubicación · **validación de estructura** (request y template deben coincidir exacto en variables, componentes, idioma y nombre).

### 11. OpenRouter y modelos (LLM modular)
Conectar **API key OpenRouter** · modelo por **workspace** y por **tarea** (clasificación vs respuesta) · parámetros (temperature, max tokens, reasoning effort) · **fallback model** · límites de costo/uso · **métricas de tokens y costo por conversación** · logs por ejecución · política de redacción segura.

### 12. Knowledge base y datos (fuente gobernada)
**KB:** subir documentos · FAQs manuales · URLs · snippets estructurados · versionado · activación por workspace/agente · **prioridad entre KB / prompt / tools** · citación/trazabilidad de la fuente usada · fallback cuando no hay respuesta.
**BD/acciones:** habilitar conexión a bases/endpoints · **consultas seguras** (no SQL libre sin restricción) · acciones controladas · **auditar accesos**.

### 13. Sincronización con HighLevel (integración oficial v1)
Auth/conexión de subcuenta · crear/actualizar contacto · sync tags · (opc) sync notas · crear/actualizar oportunidad · **crear cita directa** por endpoint/payload · traer datos del contacto para contexto de IA · **webhooks inbound/outbound** · mapeo configurable de campos · retries y logs de error.

### 14. Motor de decisión de IA (reglas + triggers)
**La IA decide:** cuándo responder · cuándo esperar más mensajes · cuándo usar tools · cuándo pedir agenda · cuándo aplicar preguntas de setter · cuándo etiquetar · cuándo derivar a humano · cuándo **abstenerse** (sin ventana o sin confianza).
**Triggers:** primer mensaje · batch de mensajes · audio transcrito · intención detectada · etiqueta/segmento · horario laboral · conversación fuera de policy · solicitud expresa de humano.

### 15. Panel de configuración (settings)
WhatsApp account · Meta templates · OpenRouter/modelos · Business info · Prompting · Tools · Knowledge base · Setter mode · Scheduling/calendars · HighLevel integration · Automation rules · Human handoff · Team/roles/permissions · Logs & observability.

### 16. Roles y permisos (mínimo v1)
**Roles:** Admin · Manager · Agent/human operator · Viewer.
**Permisos:** encender/apagar IA · responder manualmente · editar prompts · editar templates · conectar tools · ver costos/logs · forzar envíos · hacer handoff.

### 17. Observabilidad (logs mínimos)
Mensajes entrantes · mensajes agrupados en buffer · decisión del agente · prompt utilizado · tools llamadas · respuesta del modelo · estado de ventana 24h · error de template/envío · cambio IA↔humano · sync con HighLevel · resultado de agenda.

---

## LISTA MAESTRA

### Core v1
- Inbox tipo WhatsApp Web.
- CRM básico de contactos.
- Soporte de texto, audios, imágenes, documentos y media.
- **Buffer inteligente** para agrupar múltiples mensajes antes de responder.
- Toggle IA / humano por conversación.
- Handoff manual a humano.
- Handoff automático cuando la IA detecte que no puede continuar.
- Información del negocio.
- Custom prompting.
- Catálogo de tools / conectores.
- Etiquetas en conversaciones y contactos.
- Sincronización de contactos con HighLevel.
- Integración OpenRouter.
- Respetar ventana de 24 horas.
- Bloqueo de mensajes libres fuera de ventana.
- Envío obligatorio de templates fuera de ventana.
- Gestión, validación y sincronización de templates con Meta.
- Modo setter con preguntas de calificación y knockout questions.
- Agendamiento por enlace externo.
- Agendamiento directo en HighLevel.
- Coexistencia con móvil / operación humana.

### Nice to have v1.5
Reglas por horario · auto-tagging por intención · resúmenes automáticos de conversación · score de lead · SLA y prioridad · notificaciones de handoff · versionado de prompts · playground de prompts · dashboard de métricas · búsqueda semántica en conversaciones.

### v2
Multiagente por workspace · multi-número · pipelines y oportunidades · flujos visuales complejos · QA de conversaciones · A/B testing de prompts · auto-optimización de templates/respuestas · voice notes con transcripción/resumen nativo · marketplace de tools.

---

## Pendiente para la sesión dedicada (con Forge)
- [ ] Leer **documentación oficial de YCloud** (API, plantillas, webhooks, media, status) y **OpenRouter** y **HighLevel** (contactos, tags, oportunidades, citas, webhooks).
- [ ] **Esquema Supabase** completo (workspaces, users/roles, contacts, conversations+estado, messages, business_info, prompts+versions, tools/tool_configs, kb_documents, templates, setter_configs, logs) — ver `ARQUITECTURA-OBJETIVO.md`.
- [ ] **Motor del agente**: buffer/debounce → decisión → tools → respuesta, con ventana 24h y state machine.
- [ ] **Inbox** (realtime) + toggle IA/humano + handoff.
- [ ] **Cumplimiento Meta** (bloqueo fuera de ventana + templates) como guardrail duro.
- [ ] Scaffolding con **Forge** (`forge init` en `codigo/`) + flujo de one-click install.

## Notas
- **Media:** recibe audio · video · PDF · imagen · reacciones. Composer humano envía texto · audio · imagen · documento · video · template.
- **Ventana 24h:** mensajes de sesión (libre, <24h) vs **plantillas** (fuera de la ventana, requieren aprobación de Meta).
- **Multi-tenant = workspace.** Cada workspace: su config, prompts, tools, KB, credenciales y datos aislados.
