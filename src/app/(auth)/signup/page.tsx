import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignupForm } from "@/features/auth/components/signup-form";
import { isSignupOpen } from "@/features/auth/services/signup-gate";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Crear cuenta — Agente WhatsApp",
};

export default async function SignupPage() {
  // Invite-only after bootstrap: once the admin account exists, no public signup.
  if (!(await isSignupOpen())) {
    redirect(
      "/login?message=El%20acceso%20es%20por%20invitaci%C3%B3n%20%E2%80%94%20contacta%20a%20tu%20administrador.",
    );
  }

  return <SignupForm />;
}
