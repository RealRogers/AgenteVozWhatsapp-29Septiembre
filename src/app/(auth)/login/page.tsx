import type { Metadata } from "next";
import { LoginForm } from "@/features/auth/components/login-form";
import { isSignupOpen } from "@/features/auth/services/signup-gate";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Iniciar sesión — Agente WhatsApp",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;
  // Gate state decides whether the footer offers a real signup link or just
  // invite-only copy — the link would only bounce back here otherwise.
  const signupOpen = await isSignupOpen();
  return <LoginForm message={message} signupOpen={signupOpen} />;
}
