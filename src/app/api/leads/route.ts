import { NextRequest, NextResponse } from "next/server";
import { createClient as svcClient } from "@supabase/supabase-js";
import { z } from "zod";
import { normalizePhone } from "@/features/inbox/services/phone";

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/leads — landing "solicitar demo" intake.
//
// Public (unauthenticated — /api/* sits outside the middleware matcher). The
// lead lands where the team actually reads: the workspace's own inbox. We
// upsert contact + conversation and insert one inbound message carrying the
// form data, so a submission shows up as an unread thread — dogfooding.
//
// WhatsApp is required, not email: the inbox is keyed by contact.phone, and a
// demo you can't reply to on the channel being sold isn't much of a demo.
//
// Spam posture: honeypot field + zod caps, same as /api/invite-request.
// Target workspace: LEADS_WORKSPACE_ID env, else the first active workspace.
// ──────────────────────────────────────────────────────────────────────────────

const LeadSchema = z.object({
  name: z.string().trim().min(1).max(100),
  whatsapp: z.string().trim().min(5).max(25),
  email: z.string().trim().email().max(320).optional().or(z.literal("")),
  industry: z.string().trim().max(60).optional().or(z.literal("")),
  // Honeypot: real users never see or fill this field. Bots get the same
  // neutral ok below, silently.
  website: z.string().max(200).optional(),
});

function svc() {
  return svcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const OK = () => NextResponse.json({ ok: true });
const ERR = () =>
  NextResponse.json(
    { error: "No se pudo enviar. Intenta de nuevo." },
    { status: 500 },
  );

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const parsed = LeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (parsed.data.website) return OK();

  const { name, whatsapp, email, industry } = parsed.data;
  const db = svc();

  // Target workspace: env override, else the first active one.
  const workspaceId = process.env.LEADS_WORKSPACE_ID;
  let workspace: { id: string } | null = null;
  if (workspaceId) {
    const { data } = await db
      .from("workspaces")
      .select("id")
      .eq("id", workspaceId)
      .eq("is_active", true)
      .maybeSingle();
    workspace = data;
  } else {
    const { data } = await db
      .from("workspaces")
      .select("id")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1);
    workspace = data?.[0] ?? null;
  }
  if (!workspace) {
    console.error("[leads] no active workspace found");
    return ERR();
  }
  const wsId = workspace.id;

  // Same default country code the inbound normalizer uses.
  const { data: bi } = await db
    .from("business_info")
    .select("structured")
    .eq("workspace_id", wsId)
    .maybeSingle();
  const defaultCc =
    (bi?.structured as { default_country_code?: string } | null)
      ?.default_country_code ?? "52";

  const phone = normalizePhone(whatsapp, defaultCc);
  if (phone.replace(/\D/g, "").length < 8) {
    return NextResponse.json(
      { error: "Revisa tu número de WhatsApp." },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const emailOrNull = email || null;

  // 1. Contact by (workspace_id, phone). An update refreshes name/opt-in only —
  //    it never clobbers stage, tags or an existing email.
  const { data: existingContact } = await db
    .from("contacts")
    .select("id")
    .eq("workspace_id", wsId)
    .eq("phone", phone)
    .maybeSingle();

  let contactId: string;
  if (existingContact) {
    contactId = existingContact.id;
    const { error } = await db
      .from("contacts")
      .update({
        name,
        opt_in: true,
        opt_in_at: now,
        ...(emailOrNull ? { email: emailOrNull } : {}),
      })
      .eq("id", contactId);
    if (error) {
      console.error("[leads] contact update failed:", error.message);
      return ERR();
    }
  } else {
    const { data, error } = await db
      .from("contacts")
      .insert({
        workspace_id: wsId,
        phone,
        name,
        email: emailOrNull,
        source: "landing",
        tags: ["lead"],
        opt_in: true,
        opt_in_at: now,
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error("[leads] contact insert failed:", error?.message);
      return ERR();
    }
    contactId = data.id;
  }

  // 2. Conversation by (workspace_id, contact_id, channel) — refresh activity
  //    on repeat submissions without touching its state.
  const convFields = {
    last_message_at: now,
    window_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    unread_count: 1,
    archived: false,
  };
  const { data: existingConv } = await db
    .from("conversations")
    .select("id")
    .eq("workspace_id", wsId)
    .eq("contact_id", contactId)
    .eq("channel", "whatsapp")
    .maybeSingle();

  let conversationId: string;
  if (existingConv) {
    conversationId = existingConv.id;
    const { error } = await db
      .from("conversations")
      .update(convFields)
      .eq("id", conversationId);
    if (error) {
      console.error("[leads] conversation update failed:", error.message);
      return ERR();
    }
  } else {
    const { data, error } = await db
      .from("conversations")
      .insert({
        ...convFields,
        workspace_id: wsId,
        contact_id: contactId,
        channel: "whatsapp",
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error("[leads] conversation insert failed:", error?.message);
      return ERR();
    }
    conversationId = data.id;
  }

  // 3. The lead itself as an inbound message in the thread.
  const lines = [
    "📩 Nuevo lead del landing",
    `Nombre: ${name}`,
    `WhatsApp: ${phone}`,
    emailOrNull ? `Correo: ${emailOrNull}` : null,
    industry ? `Industria: ${industry}` : null,
  ].filter(Boolean);

  const { error: msgError } = await db.from("messages").insert({
    workspace_id: wsId,
    conversation_id: conversationId,
    direction: "in",
    type: "text",
    body: lines.join("\n"),
    status: "delivered",
    meta: {
      source: "landing_form",
      from_name: name,
      lead: { name, whatsapp: phone, email: emailOrNull, industry },
    },
  });
  if (msgError) {
    console.error("[leads] message insert failed:", msgError.message);
    return ERR();
  }

  return OK();
}
