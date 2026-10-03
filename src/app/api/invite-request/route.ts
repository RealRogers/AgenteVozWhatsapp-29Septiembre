import { NextRequest, NextResponse } from "next/server";
import { createClient as svcClient } from "@supabase/supabase-js";
import { z } from "zod";

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/invite-request — public "request access" intake.
//
// Public signup is closed once the super admin exists; this route is the real
// channel the login footer points at. It runs unauthenticated (the /api/*
// matcher is outside middleware) and writes via the service role — the table
// has RLS with no policies, so nothing here is readable by clients.
//
// Spam posture: honeypot field + one pending request per email + zod length
// caps. The response is always neutral — it never reveals whether the email
// already requested access, already has an account, or was just written.
// ──────────────────────────────────────────────────────────────────────────────

const RequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(320),
  note: z.string().trim().max(500).optional(),
  // Honeypot: real users never see or fill this field. Any value parses —
  // bots get the same neutral ok below, silently.
  website: z.string().max(200).optional(),
});

function svc() {
  return svcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const OK = () => NextResponse.json({ ok: true });

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Bots that fill the honeypot get the same success as humans — silently.
  if (parsed.data.website) return OK();

  const { name, email, note } = parsed.data;
  const db = svc();

  // One pending request per email: a repeat request refreshes the row instead
  // of piling up (the partial unique index backs this up under races).
  const { data: existing, error: lookupError } = await db
    .from("invite_requests")
    .select("id")
    .eq("status", "pending")
    .ilike("email", email)
    .maybeSingle();

  if (lookupError) {
    console.error("[invite-request] lookup failed:", lookupError.message);
    return NextResponse.json(
      { error: "No se pudo registrar la solicitud. Intenta de nuevo." },
      { status: 500 },
    );
  }

  const write = existing
    ? db
        .from("invite_requests")
        .update({
          name,
          note: note ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
    : db.from("invite_requests").insert({ name, email, note: note ?? null });

  const { error } = await write;
  if (error) {
    console.error("[invite-request] write failed:", error.message);
    return NextResponse.json(
      { error: "No se pudo registrar la solicitud. Intenta de nuevo." },
      { status: 500 },
    );
  }

  return OK();
}
