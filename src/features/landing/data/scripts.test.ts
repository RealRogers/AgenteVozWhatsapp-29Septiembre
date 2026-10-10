import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HUMAN_TAKEOVER_MESSAGE,
  VOICE_BAR_HEIGHTS,
  clientDelay,
  conversations,
  demoPresets,
  formatStamp,
  heroScript,
  isSwitchEvent,
  lastMessagePreview,
  minutesOf,
  renderConversationMessages,
  switchResult,
  typingDelay,
  type ChatMessage,
} from "./scripts.ts";

const VALID_KINDS = new Set(["client", "ia", "human", "system", "day"]);

function assertScriptIntegrity(script: readonly unknown[], label: string) {
  assert.ok(script.length > 0, `${label}: el guion no puede estar vacío`);
  for (const e of script) {
    assert.equal(typeof e, "object", `${label}: evento inválido`);
    assert.ok(e !== null, `${label}: evento nulo`);
    if ("switch" in (e as Record<string, unknown>)) {
      const sw = (e as { switch: unknown }).switch;
      assert.ok(sw === "on" || sw === "off", `${label}: switch inválido`);
      continue;
    }
    const m = e as ChatMessage;
    assert.ok(VALID_KINDS.has(m.kind), `${label}: kind desconocido ${m.kind}`);
    assert.ok(m.text.length > 0, `${label}: mensaje sin texto`);
    if (m.who !== undefined) {
      assert.ok(
        m.kind === "ia" || m.kind === "human",
        `${label}: \`who\` solo aplica a ia/human (${m.kind})`,
      );
    }
    if (m.voice) {
      assert.match(m.text, /^\d+:\d{2}$/, `${label}: voice sin duración m:ss`);
      assert.equal(m.kind, "client", `${label}: voice notes vienen del cliente`);
    }
  }
}

test("formatStamp formatea minutos como HH:MM con padding", () => {
  assert.equal(formatStamp(642), "10:42");
  assert.equal(formatStamp(0), "00:00");
  assert.equal(formatStamp(665), "11:05");
  assert.equal(formatStamp(60 * 25 + 7), "01:07"); // cruza medianoche
});

test("minutesOf convierte HH:MM a minutos del día", () => {
  assert.equal(minutesOf("10:42"), 642);
  assert.equal(minutesOf("09:58"), 598);
  assert.equal(minutesOf("11:05"), 665);
});

test("las conversaciones arrancan para que el último sello coincida con su hora", () => {
  for (const c of conversations) {
    const nonSystem = c.messages.filter(
      (m) => m.kind !== "system" && m.kind !== "day",
    ).length;
    assert.equal(
      c.startMinutes,
      minutesOf(c.time) - nonSystem + 1,
      `${c.name}: startMinutes no alinea con la hora de la fila`,
    );
  }
});

test("clientDelay: voice notes 300ms, texto proporcional con tope 1300ms", () => {
  assert.equal(clientDelay({ kind: "client", text: "0:08", voice: true }), 300);
  assert.equal(clientDelay({ kind: "client", text: "Mejor a las 16:30" }), 450 + 17 * 16);
  const largo = "x".repeat(200);
  assert.equal(clientDelay({ kind: "client", text: largo }), 1300);
});

test("typingDelay: proporcional con tope 1800ms", () => {
  assert.equal(typingDelay({ kind: "ia", text: "Hola" }), 700 + 4 * 14);
  const largo = "x".repeat(500);
  assert.equal(typingDelay({ kind: "ia", text: largo }), 1800);
});

test("heroScript y demoPresets son íntegros", () => {
  assertScriptIntegrity(heroScript, "heroScript");
  for (const p of demoPresets) {
    assert.ok(p.question.length > 0);
    assertScriptIntegrity(p.script, `demoPreset:${p.question}`);
  }
});

test("los guiones del hero y demo terminan con el switch apagado cuando hay handoff", () => {
  const heroSwitches = heroScript.filter(isSwitchEvent);
  assert.deepEqual(
    heroSwitches.map((s) => s.switch),
    ["off"],
    "el hero pausa la IA al derivar con Mariana",
  );
  const handoff = demoPresets.find((p) => p.question === "Quiero hablar con una persona");
  assert.ok(handoff);
  assert.ok(handoff.script.some((e) => isSwitchEvent(e) && e.switch === "off"));
});

test("conversations son íntegras y con responder válido", () => {
  assert.ok(conversations.length > 0);
  for (const c of conversations) {
    assert.ok(["ia", "human", "pending"].includes(c.responder), c.name);
    assert.match(c.time, /^\d{2}:\d{2}$/, c.name);
    assert.ok(c.unread >= 0, c.name);
    assertScriptIntegrity(c.messages, `conversation:${c.name}`);
  }
});

test("lastMessagePreview ignora system y marca las voice notes", () => {
  const ana = conversations.find((c) => c.name === "Ana Torres")!;
  assert.equal(
    lastMessagePreview(ana),
    "Sí, los sábados atendemos de 9:00 a 14:00. ¿Te agendo?",
  );
  const luis = conversations.find((c) => c.name === "Luis P.")!;
  // El último no-system de Luis es la respuesta de la IA, no la transcripción.
  assert.equal(lastMessagePreview(luis), "Unos 45 minutos. ¿Quieres que te agende?");
  const soloVoz = {
    ...ana,
    messages: [
      { kind: "client", text: "0:22", voice: true },
      { kind: "system", text: "Transcrito: algo" },
    ] as ChatMessage[],
  };
  assert.equal(lastMessagePreview(soloVoz), "Nota de voz 0:22");
  const sinMensajes = { ...ana, messages: [] as ChatMessage[] };
  assert.equal(lastMessagePreview(sinMensajes), "");
});

test("renderConversationMessages sella en secuencia, salta system y enciende voice notes", () => {
  const luis = conversations.find((c) => c.name === "Luis P.")!;
  const rendered = renderConversationMessages(luis);
  assert.equal(rendered.length, luis.messages.length);
  assert.equal(rendered[0].time, "09:57"); // voice note del cliente
  assert.equal(rendered[1].time, undefined); // system sin sello
  assert.equal(rendered[2].time, "09:58"); // último mensaje = hora de la fila
  assert.equal(rendered[0].voiceLit, VOICE_BAR_HEIGHTS.length);
  assert.equal(rendered[2].voiceLit, undefined);
  // ids estables y únicos
  assert.deepEqual(rendered.map((m) => m.id), [0, 1, 2]);
});

test("HUMAN_TAKEOVER_MESSAGE es una respuesta humana con autor", () => {
  assert.equal(HUMAN_TAKEOVER_MESSAGE.kind, "human");
  assert.ok(HUMAN_TAKEOVER_MESSAGE.who);
  assertScriptIntegrity([HUMAN_TAKEOVER_MESSAGE], "HUMAN_TAKEOVER_MESSAGE");
});

test("switchResult reproduce las transiciones del HTML", () => {
  assert.deepEqual(switchResult("ia"), {
    to: "human",
    notice: "IA pausada. Tomaste el chat",
  });
  assert.deepEqual(switchResult("human"), { to: "ia", notice: "IA reactivada" });
  assert.deepEqual(switchResult("pending"), {
    to: "human",
    notice: "Tomaste el chat. IA pausada",
  });
});
