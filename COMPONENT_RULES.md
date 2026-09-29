# Component Rules — Agente WhatsApp

Agentes: leer este archivo antes de crear o modificar cualquier componente UI.
Última actualización: 2026-06-08

Design system: **Glass + Electric Lime** (glassmorphism estilo Apple/visionOS).
Fuente de verdad visual: `http://localhost:3000/ui` (solo desarrollo).

---

## Regla 1 — Referencia el showcase primero

Antes de crear cualquier componente, abre `/ui`.
Si el componente que necesitas ya existe ahí, usa esa variante exacta.
No crear variantes nuevas sin actualizar el showcase primero.

## Regla 2 — Tokens de color, nunca hex

Correcto: `className="bg-primary text-primary-foreground"`
Incorrecto: `className="bg-[#B5F23D] text-black"`

Tokens (OKLch via CSS vars, soportan opacidad — `bg-primary/10`):
`bg-background, bg-card, bg-muted, bg-primary, bg-secondary, bg-accent,`
`bg-destructive, bg-success, bg-warning, bg-info, bg-border, bg-input`
`text-foreground, text-muted-foreground, text-primary, text-destructive`

El acento lime (`--primary`) es raro a propósito: úsalo para EL CTA, no para todo.

## Regla 3 — Fuentes del proyecto

- Display/headings: **Space Grotesk** → `font-display`
- Body/UI: **Geist Sans** → `font-body` (default)
- Datos (teléfonos, wamid, IDs, código): **Geist Mono** → `font-mono`

Nunca Inter, Roboto ni Arial.

## Regla 4 — Glassmorphism

Usa la utilidad `.glass` (o `.glass-strong`) para superficies hero, navs sticky y overlays.
NO anidar glass dentro de glass. El glass necesita el glow ambiental del fondo (ya en `body`).

## Regla 5 — Motion system

Importar de: `@/features/ui-kit/motion`
Duraciones: instant(75ms), sm(150ms), md(200ms), lg(350ms), xl(500ms)
Easing default: `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out-expo)
Animar solo: transform, opacity, filter, color, background-color, border-color, box-shadow
NUNCA animar: width, height, padding, margin, top, left

## Regla 6 — Los 4 estados obligatorios

Todo componente que carga datos implementa los 4:

1. Loading: skeleton que imita el layout real (no spinner genérico)
2. Error: mensaje + botón retry
3. Empty: ilustración/ícono + heading + CTA
4. Data: el render principal

## Regla 7 — Iconografía

Solo Lucide React (outline). h-4 w-4 (inline), h-5 w-5 (sidebar/nav), h-6 w-6 (standalone).
Nunca mezclar con otras librerías de íconos.

## Regla 8 — Accesibilidad no negociable

- Botones icon-only → `aria-label`
- Inputs → `<Label htmlFor>` ↔ `id`
- Focus visible siempre (nunca `outline-none` sin ring equivalente)
- Botones en loading → `disabled` + `aria-busy`

## Regla 9 — Variantes canónicas de Button

Solo: default, secondary, outline, ghost, destructive, link.
Jerarquía por pantalla: máximo 1 default (CTA primario), resto secondary/outline/ghost.

## Regla 10 — Cards

Default (borde): listas, contenido estático.
Elevated (shadow-md, sin borde): elementos destacados.
Accent (border-primary/20 bg-primary/5): KPIs, info de marca.
Glass (.glass): superficies hero/sticky.
No anidar Cards elevadas ni glass dentro de otra del mismo tipo.

## Regla 11 — Theming (dark default)

Dark es el tema por defecto (`defaultTheme="dark"`). El light existe vía toggle.
Nunca uses `bg-white`, `text-black`, `bg-gray-*` — rompen el dark mode.
Usa siempre los tokens semánticos (cambian solos con `.dark`).
