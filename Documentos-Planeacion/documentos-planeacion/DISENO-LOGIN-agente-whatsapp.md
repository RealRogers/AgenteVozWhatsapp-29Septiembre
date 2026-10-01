# Diseño actual del Login

Documento de referencia: cómo está construido hoy el login (y el flujo de auth completo) en esta base de código.

## Resumen

El login vive en un route group `(auth)` de Next.js App Router. Es una **Server Action** + formulario client-side con validación Zod, sesión por cookies vía Supabase Auth (`@supabase/ssr`), y un diseño tipo **glassmorphism** (`.glass-strong`) sobre fondo ambiental con malla técnica y halos de luz. En desktop (≥lg) es un **split de dos columnas**: formulario a la izquierda y un chat demo auto-animado a la derecha. No hay OAuth ni magic links: solo email + contraseña.

## Mapa de archivos

| Archivo | Rol |
|---|---|
| `src/app/(auth)/layout.tsx` | Layout compartido: fondo ambiental (malla + glows), badge de marca, footer con propuesta de valor, y el split `lg:grid-cols-[28rem_1fr]` que monta `<AuthChatDemo />` |
| `src/features/auth/components/auth-chat-demo.tsx` | Chat fake auto-animado en loop (solo ≥lg, respeta `prefers-reduced-motion`): cliente escribe → IA responde y agenda → humano toma el control |
| `src/app/(auth)/login/page.tsx` | Server Component: define `metadata` ("Iniciar sesión — Agente WhatsApp"), lee `searchParams.message` y renderiza `<LoginForm message={...}>` |
| `src/features/auth/components/login-form.tsx` | Client Component con todo el UI del login (inputs controlados, errores inline, hint de Bloq Mayús, toggle de contraseña) |
| `src/features/auth/services/actions.ts` | Server Actions: `login`, `signup`, `logout`, `requestPasswordReset`, `updatePassword` |
| `src/features/auth/services/signup-gate.ts` | Control de registro (solo primer usuario / por invitación) |
| `middleware.ts` (raíz) | Guard de rutas: refresca la sesión y redirige |
| `src/lib/supabase/server.ts` | Cliente Supabase SSR con cookies de Next |
| `src/lib/supabase/client.ts` | Cliente browser (no lo usa el login) |
| `src/app/globals.css` | Tokens del design system + clases `.glass` / `.glass-strong` |
| `tailwind.config.ts` | Mapeo de tokens CSS → utilidades Tailwind, fuentes |
| `src/features/ui-kit/motion.ts` | Duraciones/easings canónicos y `motionClasses` (Regla 5) |
| `src/components/ui/{button,input,label}.tsx` | Primitivas shadcn/ui usadas por el formulario |

## Flujo del login (end-to-end)

1. **Middleware** (`middleware.ts`): crea cliente Supabase con cookies, llama `auth.getUser()`. Sin sesión y ruta no pública → redirect a `/login`. Con sesión y ruta `/login` | `/signup` | `/forgot-password` → redirect a `/inbox`. `/reset-password` sigue accesible con sesión de recovery. Matcher excluye `_next/static`, `_next/image`, `favicon.ico`, `api/`.
2. **Página** `login/page.tsx`: Server Component async; extrae `message` de `searchParams` (ej. `?message=Revisa%20tu%20email` tras signup) y la pasa al form.
3. **Form** `login-form.tsx`: `useActionState(login, null)` + `useFormStatus()` para pending. Inputs **controlados** (`useState`) — el botón queda deshabilitado mientras email o password estén vacíos.
4. **Action** `login()` en `actions.ts` — retorna `LoginState = { error?: string; fieldErrors?: { email?, password? } }`:
   - Zod falla → `fieldErrors` por campo (se muestran inline bajo cada input con `aria-invalid`/`aria-describedby`).
   - `supabase.auth.signInWithPassword()` con el cliente SSR (escribe cookies de sesión).
   - Error de credenciales → `localizeAuthError()` al español; "Invalid login credentials" → "Ese correo o contraseña no coincide. Revisa tus datos o recupera tu acceso."
   - Éxito → `redirect("/inbox")`.
5. **Workspace tras login**: no hay pantalla de selección — `getActiveWorkspace()` resuelve por cookie `active_workspace_id` (fallback: primer membership activo) y el header de `(main)` muestra `WorkspaceSwitcher` cuando hay más de uno.

## Diseño visual

- **Sistema**: "Glass + Electric Lime" (tokens OKLch en CSS vars; Tailwind inyecta alpha).
- **Layout**: `bg-background` + malla técnica `1px` con máscara radial + halos `bg-primary/10` y `bg-info/10` difusos (`blur-[128px]`) + halo lime extra detrás de la tarjeta. El glass refracta porque hay luz detrás.
- **Badge de marca**: pill `border-border/60 bg-card/40 backdrop-blur-md` con `MessageSquareText` en chip lime → link a `/` (redirect a `/inbox` o `/login` según sesión).
- **Tarjeta**: `glass-strong rounded-2xl p-8` + `shadow-2xl shadow-black/50` + borde `white/10`–`white/[0.08]` (alpha blanco, igual que el borde interno de `.glass`).
- **Tipografía**: `font-display` (Space Grotesk) en títulos y badge; `font-body` (Geist Sans) en UI.
- **Copy**:
  - Título: "Tu inbox te está esperando"
  - Subtítulo: "Mira qué atendió la IA mientras no estabas" (`text-foreground/70`)
  - Footer de página: "Conexión oficial con la API de WhatsApp Business"
  - Footer de tarjeta: "¿Aún no tienes acceso? Solicítalo" → `/signup`
- **Inputs**: iconos Lucide (`Mail`, `Lock`) a la izquierda, `bg-background/50` (más oscuro que la tarjeta en dark), `border-foreground/15`, placeholder `text-foreground/40`, focus `border-primary/60` + `ring-primary/30`. Contraseña: toggle `Eye`/`EyeOff` con `aria-label`, e hint de **Bloq Mayús** (`getModifierState("CapsLock")`, token `warning`).
- **Errores**: inline por campo (`text-xs text-destructive`, `role="alert"`) + banner `AlertCircle` `bg-destructive/10` para credenciales inválidas.
- **Botón**: `w-full h-10` lime, `disabled` con campos vacíos o pending, spinner `Loader2` + "Entrando…", `motion-safe:active:scale-[0.99]`.
- **Chat demo** (solo `lg+`): panel `glass` con header fake (avatar "AG", "Ana García", "En línea", chip "IA activa"), columna de burbujas estilo inbox (inbound `bg-muted/50 rounded-tl-sm`; outbound IA `bg-primary/10 border-primary/30 rounded-tr-sm` + badge `IA`; divider centrado para el handoff humano) y composer fake. Loop por timers con indicador "escribiendo" (3 dots); `motion-safe:` en todo; `prefers-reduced-motion` → render estático completo. `aria-hidden` (decorativo).
- **Tema**: `next-themes`, `defaultTheme="dark"`, `enableSystem`.

## Pantallas hermanas

Comparten el nuevo layout (fondo, badge, footer, chat demo) pero conservan su estilo interno anterior (`.glass`, sin iconos ni errores inline):

- `/signup` (`signup-form.tsx`): gate `isSignupOpen()` — solo con 0 usuarios; el primero queda `is_super_admin` → `/login?message=Revisa tu email`.
- `/forgot-password` (`forgot-password-form.tsx`): `resetPasswordForEmail` → `{origin}/reset-password`; respuesta neutra.
- `/reset-password` (`reset-password-form.tsx`): `auth.updateUser` → `/login?message=Contraseña actualizada`.
- `logout`: `<form action={logout}>` en headers de `(main)` y `(agency)`; `signOut()` → `/login`.

## Decisiones de modelo de cuentas

- **Sin SMTP requerido**: `provision-user.ts` crea usuarios con `admin.createUser` + `email_confirm: true` y password generada — la agencia entrega credenciales.
- **Roles de workspace**: `workspace-access.ts` (`admin|manager|agent|viewer`) en API routes, no en el login.
- **Brand override por deploy**: `lib/branding.ts` retinta `--primary`/`--ring` vía env `NEXT_PUBLIC_BRAND_*`, inline en `<head>`.

## Stack relevante

Next 16 (Turbopack en dev), React 19 (`useActionState`, `useFormStatus`), Tailwind 3.4 + `tailwindcss-animate` (`animate-in`, `fade-in`, `slide-in-from-bottom-2`), Radix Label/Slot + CVA (shadcn/ui), `lucide-react`, `@supabase/ssr` + `supabase-js`, Zod, `next-themes`, fuentes Geist + Space Grotesk.
