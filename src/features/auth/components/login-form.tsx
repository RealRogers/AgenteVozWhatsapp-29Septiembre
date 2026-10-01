"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Mail, Lock, Eye, EyeOff, AlertCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/features/auth/services/actions";
import { cn } from "@/lib/utils";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="default"
      className="w-full h-10 font-medium transition-all duration-200 active:scale-[0.99]"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>Iniciando sesión...</span>
        </>
      ) : (
        "Iniciar sesión"
      )}
    </Button>
  );
}

export function LoginForm({ message }: { message?: string }) {
  const [state, formAction] = useActionState(login, null);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div
      className={cn(
        "glass-strong relative w-full rounded-2xl p-8 shadow-2xl shadow-black/50 border border-white/10 dark:border-white/[0.08] space-y-6"
      )}
    >
      {/* Header del Formulario */}
      <div className="space-y-1.5 text-center">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Bienvenido de vuelta
        </h1>
        <p className="text-sm text-muted-foreground font-body">
          Ingresa tus credenciales para acceder al inbox
        </p>
      </div>

      {/* Banner de mensaje informativo (?message=...) */}
      {message && (
        <div
          className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/10 px-3.5 py-2.5 text-sm text-primary"
          role="status"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          <p className="font-body text-xs font-medium">{message}</p>
        </div>
      )}

      {/* Banner de error de autenticación */}
      {state?.error && (
        <div
          className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="font-body text-xs font-medium">{state.error}</p>
        </div>
      )}

      <form action={formAction} className="space-y-4">
        {/* Campo Email */}
        <div className="space-y-2">
          <Label htmlFor="email" className="text-xs font-medium text-muted-foreground">
            Correo electrónico
          </Label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60"
              aria-hidden="true"
            />
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="tu@agencia.com"
              autoComplete="email"
              aria-required="true"
              required
              className="pl-9 bg-card/30 border-border/80 focus-visible:ring-primary/40 focus-visible:border-primary/50 placeholder:text-muted-foreground/40 transition-colors"
            />
          </div>
        </div>

        {/* Campo Contraseña con '¿Olvidaste tu contraseña?' */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">
              Contraseña
            </Label>
            <Link
              href="/forgot-password"
              className="text-xs text-muted-foreground hover:text-primary transition-colors duration-150"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60"
              aria-hidden="true"
            />
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              autoComplete="current-password"
              aria-required="true"
              required
              className="pl-9 pr-10 bg-card/30 border-border/80 focus-visible:ring-primary/40 focus-visible:border-primary/50 placeholder:text-muted-foreground/40 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm transition-colors"
              aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        <div className="pt-2">
          <SubmitButton />
        </div>
      </form>

      {/* Footer del card */}
      <div className="pt-2 border-t border-border/40 text-center">
        <p className="text-xs text-muted-foreground font-body">
          ¿No tienes cuenta?{" "}
          <Link
            href="/signup"
            className="text-primary font-medium underline-offset-4 hover:underline transition-colors duration-150"
          >
            Crear cuenta
          </Link>
        </p>
      </div>
    </div>
  );
}
