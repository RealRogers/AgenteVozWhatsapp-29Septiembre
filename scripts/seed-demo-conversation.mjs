#!/usr/bin/env node
// ============================================================================
// scripts/seed-demo-conversation.mjs — demo conversation for the inbox UI
//
// Seeds ONE realistic conversation (contact + thread) so the inbox can be
// demoed without a live WhatsApp webhook. Everything it writes is marked:
//   contact.tags / conversation.tags → ["demo"]
//   message.meta.demo_seed           → true
// so it can be found and wiped later.
//
// Idempotent: re-running resets the same demo thread (contact is matched by
// phone; the conversation's messages are deleted and re-inserted).
//
// Uses the Supabase service_role key (bypasses RLS) via REST.
//
// Usage:
//   node scripts/seed-demo-conversation.mjs [workspace-slug]
//
// With no argument it uses the first workspace. The slug argument selects one
// when the account has several.
//
// Config (env vars; fall back to .env.local):
//   NEXT_PUBLIC_SUPABASE_URL     Supabase project URL          (required)
//   SUPABASE_SERVICE_ROLE_KEY    service_role key              (required)
// ============================================================================

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = resolve(ROOT, ".env.local");

const ok = (m) => console.log(`✅ ${m}`);
const log = (m) => console.log(m);
function fail(m) {
  console.error(`❌ ${m}`);
  process.exit(1);
}

function envFile() {
  if (!existsSync(ENV_PATH)) return {};
  const out = {};
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/\r$/, "");
  }
  return out;
}

const FILE = envFile();
const cfg = (k) => process.env[k] || FILE[k];

const SUPABASE_URL = cfg("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY = cfg("SUPABASE_SERVICE_ROLE_KEY");
if (!SUPABASE_URL || !SERVICE_KEY) {
  fail("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
}

const H = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function req(method, path, body, prefer) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { ...H, ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    fail(`${method} ${path} → ${res.status}: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();
const hoursAhead = (h, from) =>
  new Date(from.getTime() + h * 3_600_000).toISOString();

// ── Demo content ────────────────────────────────────────────────────────────
// The human-written reply carries sender_user_id so the thread also demos
// operator styling; the rest of the outbound bubbles are the AI's (null).
const CONTACT = {
  phone: "+525512345678",
  name: "María González",
  email: "maria.gonzalez@ejemplo.com",
  stage: "engaged",
  source: "demo",
  tags: ["demo"],
  opt_in: true,
};

const SCRIPT = [
  { dir: "in", at: 42, body: "Hola, buenas tardes 👋 ¿Me pueden ayudar con una cita?" },
  { dir: "out", at: 41, body: "¡Hola, María! 👋 Bienvenida a Clínica Dental. Claro que sí, ¿qué tratamiento necesitas?" },
  { dir: "in", at: 40, body: "Quisiera una limpieza dental, ¿tienen disponibilidad esta semana?" },
  { dir: "out", at: 39, body: "¡Por supuesto! Para limpieza dental tengo estos horarios:\n\n• Martes 10:00 AM\n• Miércoles 9:30 AM\n• Jueves 11:00 AM\n\n¿Cuál te conviene más?" },
  { dir: "in", at: 35, body: "El miércoles a las 9:30 por favor" },
  { dir: "out", at: 34, body: "Perfecto ✅ Tu cita quedó agendada para el *miércoles a las 9:30 AM* con la Dra. Ramírez.\n\nTe enviaremos un recordatorio un día antes. ¿Algo más en lo que pueda ayudarte?" },
  { dir: "in", at: 20, body: "Sí, ¿dónde están ubicados?" },
  { dir: "out", at: 18, human: true, body: "Estamos en Av. Insurgentes Sur 1234, Col. Del Valle, CDMX. El edificio tiene estacionamiento en el sótano 🅿️" },
  { dir: "in", at: 15, body: "Perfecto, muchas gracias" },
  { dir: "out", at: 14, body: "¡A ti, María! Te esperamos el miércoles. Que tengas un excelente día 😊" },
  { dir: "in", at: 2, body: "Una pregunta más: ¿aceptan pagos con tarjeta?" },
];

// ── Seed ────────────────────────────────────────────────────────────────────
const slug = process.argv[2];

const workspaces = await req(
  "GET",
  `workspaces?select=id,name,slug,is_active&is_active=eq.true${slug ? `&slug=eq.${slug}` : ""}&order=created_at.asc`,
);
if (!Array.isArray(workspaces) || workspaces.length === 0) {
  fail(slug ? `No hay workspace activo con slug "${slug}"` : "No hay workspaces activos");
}
if (!slug && workspaces.length > 1) {
  log("Hay varios workspaces; pasa el slug como argumento:");
  for (const w of workspaces) log(`  • ${w.slug} — ${w.name}`);
  process.exit(1);
}
const workspace = workspaces[0];
log(`Workspace: ${workspace.name} (${workspace.slug})`);

// Pick an operator for the human-sent bubble (first admin/manager member).
const members = await req(
  "GET",
  `memberships?select=user_id,role&workspace_id=eq.${workspace.id}&is_active=eq.true&role=in.(admin,manager)&order=created_at.asc&limit=1`,
);
const operatorId = members?.[0]?.user_id ?? null;

// Contact: match by (workspace_id, phone) — refresh its fields either way.
const existingContacts = await req(
  "GET",
  `contacts?select=id&workspace_id=eq.${workspace.id}&phone=eq.${encodeURIComponent(CONTACT.phone)}`,
);
let contactId;
if (existingContacts.length > 0) {
  contactId = existingContacts[0].id;
  await req(
    "PATCH",
    `contacts?id=eq.${contactId}`,
    { ...CONTACT, opt_in_at: minutesAgo(45) },
    "return=minimal",
  );
} else {
  const inserted = await req(
    "POST",
    "contacts",
    { ...CONTACT, workspace_id: workspace.id, opt_in_at: minutesAgo(45) },
    "return=representation",
  );
  contactId = inserted[0].id;
}
ok(`Contacto: ${CONTACT.name} ${CONTACT.phone}`);

// Conversation: match by (workspace_id, contact_id, channel).
const lastInboundAt = new Date(
  Date.now() - SCRIPT.filter((m) => m.dir === "in").at(-1).at * 60_000,
);
const convFields = {
  state: "ai_active",
  ai_enabled: true,
  last_message_at: minutesAgo(SCRIPT.at(-1).at),
  window_expires_at: hoursAhead(24, lastInboundAt),
  unread_count: 1,
  archived: false,
  priority: "normal",
  tags: ["demo"],
};
const existingConvs = await req(
  "GET",
  `conversations?select=id&workspace_id=eq.${workspace.id}&contact_id=eq.${contactId}&channel=eq.whatsapp`,
);
let conversationId;
if (existingConvs.length > 0) {
  conversationId = existingConvs[0].id;
  await req(
    "PATCH",
    `conversations?id=eq.${conversationId}`,
    convFields,
    "return=minimal",
  );
} else {
  const inserted = await req(
    "POST",
    "conversations",
    {
      ...convFields,
      workspace_id: workspace.id,
      contact_id: contactId,
      channel: "whatsapp",
    },
    "return=representation",
  );
  conversationId = inserted[0].id;
}

// Reset the thread so re-runs don't pile up duplicates.
await req(
  "DELETE",
  `messages?conversation_id=eq.${conversationId}`,
  undefined,
  "return=minimal",
);

const rows = SCRIPT.map((m, i) => ({
  workspace_id: workspace.id,
  conversation_id: conversationId,
  direction: m.dir,
  type: "text",
  body: m.body,
  wamid: `wamid.demo.${i + 1}`,
  status: m.dir === "in" ? "delivered" : "read",
  sender_user_id: m.human ? operatorId : null,
  meta: {
    demo_seed: true,
    ...(m.dir === "in" ? { from_name: CONTACT.name } : {}),
  },
  created_at: minutesAgo(m.at),
}));
await req("POST", "messages", rows, "return=minimal");

ok(`Conversación demo lista: ${rows.length} mensajes`);
log(`Ábrela en /inbox/${conversationId}`);
