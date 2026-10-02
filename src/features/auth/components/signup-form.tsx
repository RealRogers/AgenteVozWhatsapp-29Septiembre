"use client";

import { useActionState, useState, type KeyboardEvent } from "react";
import { useFormStatus } from "react-dom";
import {
  Loader2,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowBigUpDash,
  User,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signup } from "@/features/auth/services/actions";
import { cn } from "@/lib/utils";

const inputClasses = cn(
  "bg-background/50 border-foreground/15 placeholder:text-foreground/40",
  "transition-colors focus-visible:border-primary/60 focus-visible:ring-primary/30",
);

function SubmitButton({ fieldsInvalid }: { fieldsInvalid: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="default"
      className="w-full h-10 font-medium motion-safe:transition-all motion-safe:duration-200 motion-safe:active:scale-[0.99]"
      disabled={pending || fieldsInvalid}
      aria-busy={pending}
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>Creando cuenta…</span>
        </>
      ) : (
        "Crear cuenta"
      )}
    </Button>
  );
}

function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p id={id} role="alert" className="text-xs text-destructive font-body">
      {message}
    </p>
  );
}

export function SignupForm() {
  const [state, formAction] = useActionState(signup, null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  const confirmMismatch = confirm.length > 0 && confirm !== password;
  const fieldsInvalid =
    !name.trim() || !email.trim() || !password || !confirm || confirmMismatch;

  const trackCapsLock = (e: KeyboardEvent) =>
    setCapsLock(e.getModifierState("CapsLock"));

  return (
    <div
      className={cn(
        "glass-strong relative w-full rounded-2xl p-8 shadow-2xl shadow-black/50 border border-white/10 dark:border-white/[0.08] space-y-6"
      )}
    >
      {/* Header del Formulario */}
      <div className="space-y-1.5 text-center">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Crea tu cuenta
        </h1>
        <p className="text-sm text-foreground/70 font-body">
          El primer registro queda como administrador de la plataforma
        </p>
      </div>

      {/* Banner de error de autenticación */}
      {state?.error && (
        <div
          className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 px-3.5 py-2.5"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" aria-hidden="true" />
          <p className="font-body text-xs font-medium text-destructive">{state.error}</p>
        </div>
      )}

      <form action={formAction} className="space-y-4">
        {/* Campo Nombre */}
        <div className="space-y-2">
          <Label htmlFor="name" className="text-xs font-medium text-foreground/70">
            Nombre completo
          </Label>
          <div className="relative">
            <User
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40"
              aria-hidden="true"
            />
            <Input
              id="name"
              name="name"
              type="text"
              placeholder="Ana García"
              autoComplete="name"
              aria-required="true"
              aria-invalid={!!state?.fieldErrors?.name}
              aria-describedby={
                state?.fieldErrors?.name ? "name-error" : undefined
              }
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={cn(inputClasses, "pl-9")}
            />
          </div>
          {state?.fieldErrors?.name && (
            <FieldError id="name-error" message={state.fieldErrors.name} />
          )}
        </div>

        {/* Campo Email */}
        <div className="space-y-2">
          <Label htmlFor="email" className="text-xs font-medium text-foreground/70">
            Correo electrónico
          </Label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40"
              aria-hidden="true"
            />
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="tu@agencia.com"
              autoComplete="email"
              aria-required="true"
              aria-invalid={!!state?.fieldErrors?.email}
              aria-describedby={
                state?.fieldErrors?.email ? "email-error" : undefined
              }
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={cn(inputClasses, "pl-9")}
            />
          </div>
          {state?.fieldErrors?.email && (
            <FieldError id="email-error" message={state.fieldErrors.email} />
          )}
        </div>

        {/* Campo Contraseña */}
        <div className="space-y-2">
          <Label htmlFor="password" className="text-xs font-medium text-foreground/70">
            Contraseña
          </Label>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40"
              aria-hidden="true"
            />
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
              minLength={8}
              aria-required="true"
              aria-invalid={!!state?.fieldErrors?.password}
              aria-describedby={
                [
                  state?.fieldErrors?.password && "password-error",
                  capsLock && "password-capslock",
                ]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={trackCapsLock}
              onKeyUp={trackCapsLock}
              className={cn(inputClasses, "pl-9 pr-10")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm transition-colors"
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
          {state?.fieldErrors?.password && (
            <FieldError id="password-error" message={state.fieldErrors.password} />
          )}
          {capsLock && (
            <p
              id="password-capslock"
              className="flex items-center gap-1.5 text-xs text-warning font-body"
            >
              <ArrowBigUpDash className="h-3.5 w-3.5" aria-hidden="true" />
              Bloq Mayús activado
            </p>
          )}
        </div>

        {/* Campo Confirmar contraseña */}
        <div className="space-y-2">
          <Label htmlFor="confirmPassword" className="text-xs font-medium text-foreground/70">
            Confirmar contraseña
          </Label>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40"
              aria-hidden="true"
            />
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirm ? "text" : "password"}
              placeholder="Repite tu contraseña"
              autoComplete="new-password"
              aria-required="true"
              aria-invalid={confirmMismatch || !!state?.fieldErrors?.confirmPassword}
              aria-describedby={
                confirmMismatch || state?.fieldErrors?.confirmPassword
                  ? "confirm-password-error"
                  : undefined
              }
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={trackCapsLock}
              onKeyUp={trackCapsLock}
              className={cn(inputClasses, "pl-9 pr-10")}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm transition-colors"
              aria-label={showConfirm ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {showConfirm ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
          {(confirmMismatch || state?.fieldErrors?.confirmPassword) && (
            <FieldError
              id="confirm-password-error"
              message={
                confirmMismatch
                  ? "Las contraseñas no coinciden"
                  : state!.fieldErrors!.confirmPassword!
              }
            />
          )}
        </div>

        <div className="pt-2">
          <SubmitButton fieldsInvalid={fieldsInvalid} />
        </div>
      </form>

      {/* Footer del card */}
      <div className="pt-2 border-t border-border/40 text-center">
        <p className="text-xs text-muted-foreground font-body">
          ¿Ya tienes cuenta?{" "}
          <Link
            href="/login"
            className="text-primary font-medium underline-offset-4 hover:underline transition-colors duration-150"
          >
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
