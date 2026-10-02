"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSignupOpen, claimBootstrapProfile } from "./signup-gate";

// Map Supabase auth error messages (English) to Spanish for the UI.
// Falls back to the original message when there is no known translation.
function localizeAuthError(msg: string): string {
  const map: Record<string, string> = {
    "Invalid login credentials":
      "Ese correo o contraseña no coincide. Revisa tus datos o recupera tu acceso.",
    "Email not confirmed": "Email no confirmado",
    "User already registered": "Este correo ya está registrado",
    // /signup only renders while there is no user yet, i.e. on a fresh
    // install — where the first account comes from scripts/seed-admin.mjs.
    "Signups not allowed for this instance":
      "El registro público está cerrado. Si estás instalando la plataforma, crea tu super admin con scripts/seed-admin.mjs (INSTALAR.md, paso 8).",
  };
  return map[msg] ?? msg;
}

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

const signupSchema = z.object({
  email: z.string().email("Email inválido"),
  // 8 chars to match seed-admin.mjs — tighter than login's 6 because this
  // sets a NEW password, it doesn't validate an existing one.
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export interface LoginState {
  error?: string;
  fieldErrors?: { email?: string; password?: string };
}

export async function login(
  _prevState: LoginState | null,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const fieldErrors: { email?: string; password?: string } = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (
        (field === "email" || field === "password") &&
        !fieldErrors[field]
      ) {
        fieldErrors[field] = issue.message;
      }
    }
    return { fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: localizeAuthError(error.message) };
  }

  redirect("/inbox");
}

export async function signup(
  _prevState: { error: string } | null,
  formData: FormData,
): Promise<{ error: string }> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // Invite-only: only the first user (agency super admin) may self-register.
  if (!(await isSignupOpen())) {
    return {
      error:
        "El registro está cerrado. Pide al administrador que te invite a tu cuenta.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: localizeAuthError(error.message) };
  }

  if (!data.user) {
    return { error: "No se pudo crear la cuenta. Intenta de nuevo." };
  }

  // signUp returns an obfuscated user with empty identities when the email is
  // already registered (it doesn't error, to avoid leaking account existence).
  if (data.user.identities?.length === 0) {
    return { error: localizeAuthError("User already registered") };
  }

  // No signup trigger creates public.users rows — the profile + super-admin
  // flag are written here. If another bootstrap won the gate meanwhile, the
  // orphaned auth user is rolled back inside claimBootstrapProfile.
  const claimed = await claimBootstrapProfile(data.user.id, parsed.data.email);
  if (!claimed) {
    return {
      error:
        "El registro está cerrado. Pide al administrador que te invite a tu cuenta.",
    };
  }

  redirect("/login?message=Revisa%20tu%20email");
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const emailSchema = z.object({
  email: z.string().email("Email inválido"),
});

export async function requestPasswordReset(
  _prevState: { error?: string; message?: string } | null,
  formData: FormData,
): Promise<{ error?: string; message?: string }> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const origin =
    (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "";

  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    { redirectTo: `${origin}/reset-password` },
  );

  if (error) {
    return { error: localizeAuthError(error.message) };
  }

  // Neutral message — never reveal whether the email exists.
  return {
    message:
      "Si el email existe, te enviamos un enlace para restablecer tu contraseña.",
  };
}

const passwordSchema = z.object({
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

export async function updatePassword(
  _prevState: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const parsed = passwordSchema.safeParse({
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return { error: localizeAuthError(error.message) };
  }

  redirect("/login?message=Contraseña%20actualizada.%20Inicia%20sesión.");
}
