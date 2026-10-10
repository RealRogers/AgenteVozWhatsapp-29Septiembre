# CHAT-LANDING — Cómo funciona el chat de la landing

> **Proyecto:** Agente WhatsApp SaaS · **Fecha:** 2026-10-10
> **Alcance:** los tres teléfonos de chat de la landing (`/`): hero, demo interactiva e inbox del showcase.
> **Origen:** port a React de `landing-agente-whatsapp.html` (todo el comportamiento reproduce el `<script>` del HTML).

---

## 1. Vista general

La landing pública es `src/app/page.tsx` (server component): importa todas las secciones desde `@/features/landing`, carga `landing.css` y las fuentes propias (`Montserrat`/`Instrument Sans` vía `next/font` → `--font-montserrat`/`--font-instrument` → `--lx-hd`/`--lx-bd`; el resto de la app sigue con Geist/Space Grotesk). Solo consulta la sesión de Supabase para cambiar el CTA del header (`loggedIn`). Orden de las secciones con chat: **Hero → Showcase → Demo**.

La landing muestra el mismo "teléfono" (`.lx-phone`) en tres contextos distintos:

| Superficie | Componente | Comportamiento |
|---|---|---|
| Hero | `HeroSection` | Reproduce `heroScript` animado al entrar al viewport; switch interactivo; botón "Ver de nuevo" al terminar. |
| Showcase "Tú decides quién responde" | `ShowcaseSection` | Lista "Conversaciones" → clic abre el historial estático de la conversación con ← y switch. |
| Demo "Pruébalo tú mismo" | `DemoSection` | Botones `.lx-qbtn` lanzan `demoPresets[i].script`; switch interactivo; `aria-live="polite"` tras interacción del usuario. |

Hero y demo son **reproducciones animadas** (motor `useChatPlayback`); el showcase es **historial estático** (`renderConversationMessages`, sin animación).

**Todo es simulado en cliente.** Ningún chat de la landing toca backend: sin `fetch`, sin Supabase, sin API. La única conexión landing↔app es `ContactSection`, que POSTea a `/api/leads` y el lead cae como conversación real en el inbox del workspace (dogfooding — la demo se responde por el mismo canal que se vende).

---

## 2. Arquitectura de archivos

```
src/features/landing/
├── data/scripts.ts            Tipos, contenido (guiones, conversaciones, copys) y helpers puros
├── data/scripts.test.ts       Tests node:test de los helpers (866 tests totales en la suite)
├── hooks/use-chat-playback.ts Motor de reproducción (estado + timers + pausas + handoff)
├── hooks/use-on-view.ts       IntersectionObserver: useOnViewOnce / useOnView
├── components/chat-frame.tsx  UI del teléfono (header, hilo, composer) — solo presentación
├── components/hero-section.tsx     Wiring hero: play(heroScript) al entrar en vista
├── components/demo-section.tsx     Wiring demo: presets + playback
├── components/showcase-section.tsx Wiring inbox: lista ↔ chat estático
└── landing.css                Todas las clases lx-* (burbujas, typing, switch, inbox…)
```

Flujo de datos: `scripts.ts` (datos) → `useChatPlayback` o `renderConversationMessages` (mensajes renderizables) → `ChatFrame` (DOM). `ChatFrame` no tiene estado propio más que el autoscroll.

---

## 3. Modelo de datos (`scripts.ts`)

```ts
type ChatKind = "client" | "ia" | "human" | "system" | "day";

interface ChatMessage {
  kind: ChatKind;
  text: string;
  who?: string;        // nombre sobre la burbuja (solo ia/human): "IA", "Mariana, equipo"…
  voice?: boolean;     // nota de voz: `text` es la duración "m:ss"
  transcribe?: boolean;// system: primero muestra "Transcribiendo…" y luego el texto
}

interface SwitchEvent { switch: "on" | "off" }   // evento de control, no es burbuja
type ChatEvent = ChatMessage | SwitchEvent;
```

- **`ChatEvent[]` = guion**: el motor recorre el array en orden; los `SwitchEvent` solo cambian `aiActive` (la posición del switch) sin pausar la cadena.
- **Sellos de hora**: no son hora real — un reloj interno (`clock = startMinutes`) suma **+1 min por mensaje** no-system (`formatStamp(clock++)`), fiel al `_min++` del HTML. `heroScript` arranca en 10:42 (`HERO_START_MINUTES = 642`), la demo en 11:05 (`DEMO_START_MINUTES = 665`) y cada `Conversation` del inbox tiene su `startMinutes` para que el último sello coincida con la hora de la fila.
- **Voice notes**: `VOICE_BAR_HEIGHTS` (20 barras, alturas en %) dibuja la onda; `VOICE_BAR_MS = 70` es el ritmo al que se encienden durante la reproducción.
- **Helpers puros** (todos testeados): `minutesOf`, `formatStamp`, `clientDelay` (300 ms voice note; `min(1300, 450 + len·16)` texto), `typingDelay` (`min(1800, 700 + len·14)`), `isSwitchEvent`, `lastMessagePreview` (preview de la fila: ignora system, voice → "Nota de voz m:ss"), `renderConversationMessages` (historial → `RenderedMessage[]` con ids, sellos y voice notes encendidas), `switchResult` (transición + nota system del toggle manual).
- **Contenido del handoff manual**: `HUMAN_REPLY_START_MS` (700 ms) y `HUMAN_TAKEOVER_MESSAGE` (`kind: "human"`, `who: "Tú"`, `"Hola, ya te atiendo yo."`).
- **Inbox**: `conversations` (4 filas), `responderMeta` (badge IA/Humano/Pendiente → `lx-badge`/`lx-badge-h`/`lx-badge-p`), `switchLabel` ("IA activa"/"Humano al mando"/"Sin atender").

---

## 4. Motor de reproducción (`use-chat-playback.ts`)

`useChatPlayback(startMinutes)` devuelve `{ messages, typing, status, aiActive, finished, play, pause, resume, setAiActive }`.

### Estado visible

```ts
interface PlaybackState {
  messages: RenderedMessage[];  // ChatMessage + id + time? + voiceLit?
  typing: TypingIndicator | null; // { who, kind: "ia" | "human" } → burbuja "X escribiendo" con 3 puntos
  status: string;               // <small> del header: "en línea" / "escribiendo…"
  aiActive: boolean;            // posición del switch
  finished: boolean;            // guion terminado (muestra "Ver de nuevo" en el hero)
}
```

### Cadena de eventos (`play(script, onDone?)`)

Secuencial con **un solo `setTimeout` en vuelo**. Internos:

- `pendingTimerRef: PendingTimer | null` — el siguiente paso de la cadena (`{ id, gen, f, remaining, startedAt }`; al pausar se congela `remaining` y se rearma al reanudar).
- `pendingIntervalRef: PendingInterval | null` — el `setInterval` de las barras de una voice note (`f` conserva `lit` en el closure, así que pausar/rearmar no pierde progreso).
- `humanTimerRef: number | null` — el timeout "Tú escribiendo" → burbuja del handoff manual; **independiente** de la cadena pausada por `"switch"` y cancelable por `clearAll`.
- `genRef` — contador de corridas; `play` lo incrementa y los timers viejos no disparan (`genRef.current === t.gen`).
- `msgIdRef` — ids incrementales de mensaje (se incrementa dentro de los updaters de `setState`).
- `pauseReasonsRef: Set<string>` — razones de pausa activas.

`play` limpia timers (`clearAll`), borra la razón `"switch"` de corridas anteriores, sube `gen` y renderiza `Hoy` + estado inicial (`aiActive: true`, `status: "en línea"`). Luego `next()` consume eventos:

- `SwitchEvent` → `aiActive = e.switch === "on"`, sigue a los 500 ms.
- `system`/`day` → se publica directo; con `transcribe` publica "Transcribiendo…" y lo reemplaza a los 900 ms. Sigue a los 600 ms.
- `client` → `status: "escribiendo…"`, espera `clientDelay`, publica la burbuja, `status: "en línea"`. Si es voice note, el intervalo enciende las barras (`voiceLit`) y al terminar sigue a los 400 ms; si no, 600 ms.
- `ia`/`human` → muestra el indicador `typing` (`"IA escribiendo"` / `"Mariana, equipo escribiendo"`), espera `typingDelay`, lo quita, publica la burbuja y sigue a los 700 ms.

Al terminar: `status: "en línea"`, `finished: true`, `onDone?.()`.

### Pausas (`pause`/`resume` con razones acumulables)

- Las razones viven en un `Set` (`pauseReasonsRef`): la cadena solo continúa cuando el set queda vacío.
- Al pausar se congela el timeout guardando `remaining` (se descuenta lo transcurrido) y se limpia el intervalo de la voice note conservando `lit` en el closure; al reanudar se rearma con el tiempo restante.
- Razones existentes: `"viewport"` (el `.lx-chat` sale del viewport, vía `useOnView`), `"hidden"` (`document.hidden` / `visibilitychange`), `"switch"` (handoff manual, vía `setAiActive`).

### Handoff manual (`setAiActive(next)`)

Al tocar el switch del hero/demo:

- **Apagar (humano toma el chat):** `pause("switch")` congela la cadena del guion; se limpia `typing` al instante (no queda "IA escribiendo" congelado), `status: "en línea"`, se añade la nota system `IA pausada. Tomaste el chat`, y **se simula la respuesta humana** vía `scheduleHumanReply()`: a los `HUMAN_REPLY_START_MS` aparece "Tú escribiendo…" y tras `typingDelay(HUMAN_TAKEOVER_MESSAGE)` se publica la burbuja `Tú — "Hola, ya te atiendo yo."` con sello de `stampAfterLast` (+1 min sobre el último mensaje con hora, o `startMinutes` si el hilo está vacío).
- **Encender (IA reactivada):** `resume("switch")` rearma la cadena donde quedó y se añade la nota `IA reactivada`.
- El timer del humano (`humanTimerRef`) es **independiente** de la cadena pausada; cada paso tiene guard `s.aiActive ? s : …`, así que reactivar la IA o arrancar otra corrida (`play` → `clearAll` lo cancela) descarta una respuesta pendiente.
- Con `prefers-reduced-motion: reduce`: la nota y la burbuja humana se insertan **en el mismo setState**, sin teatro de typing.

### Reduced motion

`play()` con `prefers-reduced-motion` renderiza **todo el guion de inmediato** (incl. resultado de los `SwitchEvent`, voice notes encendidas, `finished: true`) y llama `onDone` sin timers.

---

## 5. UI del teléfono (`chat-frame.tsx`)

Componente puramente presentacional; todo llega por props (`ChatFrameProps`).

```
.lx-phone (role="group", aria-label=groupAriaLabel, shellClassName)
├── .lx-ph  header
│   ├── [lx-back "←"]          solo si onBack (vista de conversación del inbox); recibe backRef para foco
│   ├── <b>{title}</b> + <small>{statusText}</small>
│   └── .lx-switch             <button role="switch" aria-checked={!switchOff}> si hay onToggleSwitch,
│                              si no un <div> decorativo; etiqueta {switchLabel}; data-off marca visual off
├── .lx-chat (aria-live, ref=scrollRef+chatRef, chatClassName p.ej. lx-chat-demo/lx-chat-inbox)
│   ├── MessageBubble por mensaje:
│   │   ├── day    → .lx-msg-day          ("Hoy")
│   │   ├── system → .lx-msg-sys          (nota centrada gris)
│   │   └── client/ia/human → .lx-msg-{kind} con <em class="lx-msg-who">{who}</em> (si existe),
│   │       texto o <VoiceNote> (barras .lx-wave + .lx-dur), y .lx-meta con hora + <Ticks/> (✓✓ solo ia/human)
│   └── {typing && .lx-msg-{kind} .lx-typing} — "{who} escribiendo" + 3 puntos animados; aria-hidden
└── .lx-composer (decorativo, aria-hidden, pointer-events:none) — "Escribe un mensaje" + mic
```

- **Autoscroll:** `useEffect([messages, typing])` hace `scrollTo` al fondo — instantáneo en el primer render (abrir conversación) y suave después; con reduced-motion siempre instantáneo.
- **Alturas:** `.lx-chat` 380 px por defecto (hero), `lx-chat-demo` 340 px, `lx-chat-inbox` 300 px.
- **Colores:** burbuja cliente = fondo `--lx-sf2` a la izquierda; IA = `--lx-ia` (cyan) a la derecha; humano = `--lx-hu` (blanco) a la derecha; switch off usa `--lx-hu`.

---

## 6. Diseño visual del chat (`landing.css`)

Todo el chat vive bajo el scope `.landing-root` con prefijo `lx-`; es **siempre dark** y no toca los tokens de la app.

### Tokens

| Token | Valor | Uso |
|---|---|---|
| `--lx-bg` | `#080a0c` | fondo de página, fondo del input del composer |
| `--lx-sf` | `#101417` | shell del teléfono, `.lx-qbtn` |
| `--lx-sf2` | `#171c20` | header/composer, burbuja cliente, píldora "Hoy", avatar, hover de filas |
| `--lx-ln` | `#262d33` | bordes |
| `--lx-tx` | `#f5f7f8` | texto principal |
| `--lx-mu` | `#9aa6ad` | texto secundario, notas system, preview de filas |
| `--lx-ia` | `#22c5ea` | cyan marca: burbuja IA, switch on, play/mic, badge IA, unread |
| `--lx-hu` | `#ffffff` | humano: burbuja human, switch off, badge Humano, outline focus |
| `--lx-ink` | `#031014` | texto sobre cyan/blanco, knob del switch, ticks IA |
| `--lx-hd` / `--lx-bd` | Montserrat / Instrument Sans | títulos / cuerpo (17 px base, line-height 1.6) |

### Teléfono (`.lx-phone`)

- Base: fondo `--lx-sf`, borde `1px --lx-ln`, `border-radius: 6px`, `overflow: hidden`, sombra `0 30px 60px -30px #000a`.
- **Variante hero (`.lx-hero .lx-phone`): glass** — fondo `--lx-sf` al 62 % + `backdrop-filter: blur(18px) saturate(140%)`, borde `--lx-tx` al 20 %, highlight inset superior. Detrás, dos orbes difuminados (`::before` cyan 380 px op. 0.3, `::after` blanco 300 px op. 0.1). Header y composer heredan translucidez (`--lx-sf2` al 55 %).

### Header (`.lx-ph`)

Flex `space-between`, padding `14/16`, borde inferior `--lx-ln`, fondo `--lx-sf2`. Título `500 1rem` Montserrat; estado `<small>` muted 0.78 rem. En conversación abierta precede el `←` (`lx-back`, 1.3 rem, padding 6/8).

### Switch IA/humano (`.lx-switch`)

Píldora `34×20` pill-radius con knob `16px` circular `--lx-ink` (`left: 16px` on → `2px` off; transiciones `background`/`left` 0.3 s). Pista `--lx-ia` encendida, `--lx-hu` apagada (`data-off`). Etiqueta `lx-switch-label` 0.8 rem muted. `role="switch"` → `cursor: pointer`; sin handler es `<div>` decorativo.

### Área de mensajes (`.lx-chat`)

Columna flex `gap: 10`, padding 16, `overflow-y: auto` con scrollbar oculta (`scrollbar-width: none` + `::-webkit-scrollbar`). Fondo punteado: `radial-gradient` de puntos `--lx-tx` al 9 % cada 18 px.

### Burbujas (`.lx-msg`)

`max-width: 82 %`, padding `9/13`, `border-radius: 8px`, 0.93 rem/1.4, **animación de entrada `lx-in` 0.3 s** (fade + translateY 6 px).

| Kind | Alineación | Fondo | Detalle |
|---|---|---|---|
| `client` | izquierda | `--lx-sf2` | esquina inf-izquierda cuadrada (2 px) |
| `ia` | derecha | `--lx-ia` cyan | texto `--lx-ink`, esquina inf-derecha cuadrada, ticks `--lx-ink` |
| `human` | derecha | `--lx-hu` blanco | texto `--lx-ink`, esquina inf-derecha cuadrada, ticks `#0a8fb0` |
| `system` | centrada | sin fondo | muted 0.78 rem — notas ("IA pausada…", transcripciones) |
| `day` | centrada | `--lx-sf2` | píldora 0.72 rem ("Hoy") |

`lx-msg-who` = nombre 600 0.68 rem al 70 % sobre la burbuja (ia/human). `lx-meta` = hora 0.66 rem al 75 % + doble tick SVG 16×11.

### Voice note (`.lx-voice`)

`min-width: 210px`: botón play circular 30 px cyan + onda `lx-wave` de 20 barras de 3 px (muted → cyan `--lx-ia` al encenderse, `b.on`) + duración 0.78 rem muted.

### Typing (`.lx-typing`)

"{who} escribiendo" + 3 puntos de 6 px `--lx-ink` con `lx-bl` 1 s infinito (opacity + translateY −2 px), delays escalonados 0/.15/.3 s. Hereda el color de la burbuja por `lx-msg-{kind}`.

### Composer (`.lx-composer`)

Decorativo (`aria-hidden`, `pointer-events: none`, `user-select: none`): icono sonrisa + input pill "Escribe un mensaje" (fondo `--lx-bg`, radius 4) + mic circular 38 px cyan. Borde superior `--lx-ln`, fondo `--lx-sf2`.

### Inbox (lista del showcase)

`lx-ibh` = cabecera "Conversaciones" (mismo estilo que `.lx-ph`). `lx-row` = fila full-width `13/16` con `gap: 12`, borde inferior `--lx-ln`, hover `--lx-sf2`. `lx-avatar` = círculo 40 px `--lx-sf2` con inicial 600 0.95 rem Montserrat. Badges `lx-badge` (3×11, 0.72 rem 600): IA cyan · `lx-badge-h` blanca (Humano) · `lx-badge-p` outline blanca sin fondo (Pendiente). `lx-unread` = contador pill cyan `min-width 20`, radius 10.

### Motion y fallbacks

- Animaciones propias: `lx-in` (entrada de burbujas), `lx-bl` (puntos de typing), transición 0.3 s del switch.
- `prefers-reduced-motion`: desactiva `lx-in`, `lx-bl` y el smooth-scroll global (además del render instantáneo del motor).
- `prefers-reduced-transparency` / sin `backdrop-filter`: el glass del hero, header, nav, diálogo y botón WhatsApp caen a fondos sólidos; los orbes bajan a op. 0.15.
- Focus visible global: `outline: 2px --lx-hu` offset 3 px (en `.lx-final` cyan pasa a `--lx-ink`).

---

## 7. Los tres usos concretos

### Hero (`hero-section.tsx`)

- `useChatPlayback(HERO_START_MINUTES)`; `useOnViewOnce(chatRef, run)` dispara `play(heroScript)` la primera vez que `.lx-chat` supera el 35 % del viewport; `useOnView` pausa/reanuda con `"viewport"` al salir/entrar.
- `switchLabel` = "IA activa" ↔ "Humano al mando" según `aiActive`; `onToggleSwitch` → `setAiActive(!aiActive)`.
- `Ver de nuevo` (`lx-replay`) visible solo cuando `finished`; vuelve a `play(heroScript)`.
- `heroScript` cuenta: saludo dental → agendamiento → voice note del cliente → transcripción → derivación ("IA pausada. Atiende una persona" + `{switch:"off"}`) → mensaje humano de "Mariana, equipo".

### Demo (`demo-section.tsx`)

- Mismo motor con `DEMO_START_MINUTES`. Autoplay decorativo del preset 0 al entrar en vista (`aria-live="off"`); al hacer clic en un `.lx-qbtn` se reproduce ese guion con `aria-live="polite"` (los mensajes se anuncian a lectores de pantalla solo tras interacción).
- Presets: agendamiento con nota "Lead guardado en GoHighLevel"; voice note con transcripción; handoff a "Sofía, equipo" (system + `{switch:"off"}` + mensaje humano).
- El switch manual pausa la IA y muestra la respuesta "Tú" igual que en el hero.

### Inbox del showcase (`showcase-section.tsx`)

- Estado local `convos` sobre `conversations`; `openIdx` controla lista ↔ chat.
- **Lista:** `.lx-ibh` "Conversaciones" + `ConversationRow` por fila: avatar (inicial), nombre, `lastMessagePreview`, hora, badge `unread` y badge de `responder` (IA/Humano/Pendiente). `aria-label` completo por fila.
- **Chat abierto:** `ChatFrame` con `title = convo.name`, `statusText="en línea"`, switch según `responder`, mensajes vía `renderConversationMessages` (instantáneos), `onBack` y `backRef`.
- **Toggle:** `toggleSwitch` aplica `switchResult(c.responder)` — cambia el responder y añade la nota system al hilo (sin respuesta simulada: es historial estático).
- **Foco:** al abrir → botón ←; al cerrar → la fila de origen (`prevOpenRef` + `rowRefs`). Abrir limpia `unread`.

---

## 8. Accesibilidad

- `role="group"` + `aria-label` en cada teléfono; `role="switch"` + `aria-checked`/`aria-label` en switches interactivos.
- `aria-live="off"` en contenido decorativo/autoplay; `"polite"` en la demo solo tras clic del usuario.
- Indicador "escribiendo" y composer son `aria-hidden` (decorativos); las notas de voz llevan `role="img"` + `aria-label` con la duración.
- `prefers-reduced-motion`: guiones completos al instante, handoff manual sin typing, autoscroll instantáneo.
- La cadena se congela con pestaña oculta (`visibilitychange`) y fuera de viewport — no corre animaciones que nadie ve.
- Foco gestionado en el inbox (abrir → ←; cerrar → fila origen).

---

## 9. Tests

`src/features/landing/data/scripts.test.ts` (node:test + assert): integridad de `heroScript`/`demoPresets`/`conversations` (kinds válidos, `who` solo en ia/human, voice con duración `m:ss` y kind client), `formatStamp`/`minutesOf` (cruce de medianoche), `clientDelay`/`typingDelay` (topes), alineación `startMinutes`↔hora de fila, `lastMessagePreview`, `renderConversationMessages` (sellos en secuencia, system sin sello, voice encendidas, ids), `switchResult` (las 3 transiciones del HTML) e integridad de `HUMAN_TAKEOVER_MESSAGE`. Comando: `npm run test:unit`.

---

## 10. Lo que el chat NO hace

- **Nada persiste ni sale del navegador**: guiones, inbox y respuestas son datos locales; el composer es decorativo (`aria-hidden`, `pointer-events: none`) — el visitante no puede escribir.
- **El handoff es teatro**: "Tú escribiendo" / "Mariana, equipo" son mensajes predefinidos; no hay humano real ni integración con el inbox del producto.
- **Los teléfonos no comparten estado**: hero, demo y showcase tienen instancias independientes; apagar la IA en uno no afecta a los demás.
- **Los sellos de hora no son reales**: corren +1 min por mensaje para la narrativa.
