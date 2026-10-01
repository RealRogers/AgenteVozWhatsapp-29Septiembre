# Diseño actual del Login

Documento de referencia: cómo está construido hoy el login (y el flujo de auth completo) en esta base de código.

## Resumen

El login vive en un route group `(auth)` de Next.js App Router. Es una **Server Action** + formulario client-side con validación Zod, sesión por cookies vía Supabase Auth (`@supabase/ssr`), y un diseño tipo **glassmorphism** (clase `.glass`) sobre un fondo oscuro con glow "Electric Lime". No hay OAuth ni magic links: solo email + contraseña.

## Mapa de archivos

| Archivo | Rol |
|---|---|
| `src/app/(auth)/layout.tsx` | Layout compartido: centra el contenido (`min-h-screen flex items-center justify-center px-4`) sobre `bg-background` |
| `src/app/(auth)/login/page.tsx` | Server Component: define `metadata` ("Iniciar sesión — Agente WhatsApp"), lee `searchParams.message` y renderiza `<LoginForm message={...}>` |
| `src/features/auth/components/login-form.tsx` | Client Component con todo el UI del login |
| `src/features/auth/services/actions.ts` | Server Actions: `login`, `signup`, `logout`, `requestPasswordReset`, `updatePassword` |
| `src/features/auth/services/signup-gate.ts` | Control de registro (solo primer usuario / por invitación) |
| `middleware.ts` (raíz) | Guard de rutas: refresca la sesión y redirige |
| `src/lib/supabase/server.ts` | Cliente Supabase SSR con cookies de Next |
| `src/lib/supabase/client.ts` | Cliente browser (no lo usa el login) |
| `src/app/globals.css` | Tokens del design system + clases `.glass` / `.glass-strong` |
| `tailwind.config.ts` | Mapeo de tokens CSS → utilidades Tailwind, fuentes |
| `src/components/ui/{button,input,label}.tsx` | Primitivas shadcn/ui usadas por el formulario |

## Flujo del login (end-to-end)

1. **Middleware** (`middleware.ts`): crea cliente Supabase con cookies, llama `auth.getUser()`. Sin sesión y ruta no pública → redirect a `/login`. Con sesión y ruta `/login` | `/signup` | `/forgot-password` → redirect a `/inbox`. `/reset-password` sigue accesible con sesión de recovery. Matcher excluye `_next/static`, `_next/image`, `favicon.ico`, `api/`.
2. **Página** `login/page.tsx`: Server Component async; extrae `message` de `searchParams` (ej. `?message=Revisa%20tu%20email` tras signup, o mensaje de registro-cerrado) y la pasa al form.
3. **Form** `login-form.tsx`: `useActionState(login, null)` + `useFormStatus()` para el estado pending del botón.
4. **Action** `login()` en `actions.ts`:
   - Valida con Zod: `email` válido, `password` min 6 chars → devuelve `{ error }` con el primer issue.
   - `supabase.auth.signInWithPassword()` con el cliente SSR (escribe cookies de sesión).
   - Error → `localizeAuthError()` traduce mensajes de Supabase al español ("Invalid login credentials" → "Correo o contraseña incorrectos", etc.).
   - Éxito → `redirect("/inbox")`.

## Diseño visual

- **Sistema**: "Glass + Electric Lime" (documentado en `globals.css` y `COMPONENT_RULES.md`). Tokens OKLch crudos en CSS vars; Tailwind inyecta alpha (`oklch(var(--token) / <alpha-value>)`).
- **Contenedor**: `glass rounded-xl p-8 w-full max-w-md space-y-6` → tarjeta translúcida con `backdrop-filter: blur(20px) saturate(140%)`, borde 1px semitransparente. En dark mode el glass es blanco al 4% de alpha.
- **Fondo**: `body` tiene glow ambiental lime (dos `radial-gradient` OKLch `0.9 0.21 126` a 6% y 3%, `background-attachment: fixed`) para que el vidrio "lea".
- **Tema**: `next-themes` con `defaultTheme="dark"`, `enableSystem`, atributo `class`. Dark es el default.
- **Tipografía**: título `font-display` = Space Grotesk (cargada en root layout vía `next/font/google`, `--font-display`); cuerpo = Geist Sans (`--font-geist-sans`).
- **Estructura del form**:
  - Encabezado: `h1` "Bienvenido de vuelta" (text-2xl semibold) + subtítulo muted "Ingresa a tu cuenta para continuar".
  - Banner de `message` (si viene en URL): `text-primary bg-primary/10 rounded-md px-3 py-2`, `role="status"`.
  - Campos: `Label` + `Input` para Email (`type=email`, `autoComplete="email"`) y Contraseña (`type=password`, `autoComplete="current-password"`), ambos `required` con `aria-required`.
  - Error del action: `text-sm text-destructive`, `role="alert"`.
  - Submit: `Button` `w-full` variante `default` (bg-primary lime); en pending muestra `Loader2` animado + "Iniciando sesión...", `disabled` + `aria-busy`.
  - Footer: "¿No tienes cuenta? Crear cuenta" → `Link` a `/signup` en `text-primary` con underline on hover.
- **Observación**: el login **no** tiene enlace a `/forgot-password` (la ruta existe, pero no se enlaza desde el form).

## Pantallas hermanas (mismo patrón visual)

- `/signup` (`signup-form.tsx`): mismo card glass; el page gate-ea con `isSignupOpen()` — solo abierto si hay 0 usuarios en `public.users` (fail-closed); el primer registro se marca `is_super_admin` y redirige a `/login?message=Revisa tu email`.
- `/forgot-password` (`forgot-password-form.tsx`): `requestPasswordReset()` → `resetPasswordForEmail` con `redirectTo: {origin}/reset-password`; respuesta neutra (no revela si el email existe) y sustituye el form por el mensaje.
- `/reset-password` (`reset-password-form.tsx`): `updatePassword()` → `auth.updateUser`; éxito → `/login?message=Contraseña actualizada. Inicia sesión.`
- `logout` se invoca como `<form action={logout}>` desde los headers de `(main)/layout.tsx` y `(agency)/layout.tsx`; hace `signOut()` + redirect a `/login`.

## Decisiones de modelo de cuentas

- **Sin SMTP requerido**: `src/lib/auth/provision-user.ts` crea usuarios con `admin.createUser` + `email_confirm: true` y password generada (`randomBytes(16).base64url`) — la agencia entrega credenciales al cliente.
- **Roles de workspace**: `src/lib/auth/workspace-access.ts` (`admin|manager|agent|viewer`) se usa en API routes, no en el propio login.
- **Brand override por deploy**: `src/lib/branding.ts` permite retintar `--primary`/`--ring` vía env vars (`NEXT_PUBLIC_BRAND_*`), inyectado inline en el `<head>` del root layout.

## Stack relevante

Next 16 (Turbopack en dev), React 19 (`useActionState`, `useFormStatus`), Tailwind 3.4 + `tailwindcss-animate`, Radix Label/Slot + CVA (shadcn/ui), `lucide-react`, `@supabase/ssr` + `supabase-js`, Zod, `next-themes`, fuentes Geist + Space Grotesk.
