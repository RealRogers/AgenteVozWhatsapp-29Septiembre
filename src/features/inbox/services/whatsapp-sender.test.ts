import assert from "node:assert/strict";
import { test } from "node:test";
import { whatsappSender } from "./whatsapp-sender.ts";

// A sender without the id it sends from must say so — before calling the
// provider, whose answer to an empty id is opaque.

let fetchCalls = 0;
globalThis.fetch = (async () => {
  fetchCalls++;
  return new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 });
}) as typeof fetch;

test("Kapso without phone_number_id names the missing setting", async () => {
  fetchCalls = 0;
  const sender = whatsappSender("kapso", { kapso_api_key: "kp" }, { phone_number_id: "" });
  await assert.rejects(sender.sendText("+15550001111", "hola"), /Falta el Phone Number ID de Kapso/);
  await assert.rejects(
    sender.sendTemplate({ to: "+15550001111", templateName: "t" }),
    /Falta el Phone Number ID de Kapso/,
  );
  assert.equal(fetchCalls, 0, "the provider is never called");
});

test("YCloud without its number names the missing setting", async () => {
  fetchCalls = 0;
  const sender = whatsappSender("ycloud", { ycloud_api_key: "yk" }, {});
  await assert.rejects(sender.sendText("+5215550001111", "hola"), /Falta el número de WhatsApp de YCloud/);
  assert.equal(fetchCalls, 0);
});

test("a configured Kapso sender still sends", async () => {
  fetchCalls = 0;
  const sender = whatsappSender("kapso", { kapso_api_key: "kp" }, { phone_number_id: "pn_1" });
  const sent = await sender.sendText("+15550001111", "hola");
  assert.equal(sent.wamid, "wamid.1");
  assert.equal(fetchCalls, 1);
});

test("media posts Meta's shape through Kapso, caption gated by kind", async () => {
  const calls: Array<{ url: string; body: Record<string, any> }> = [];
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ messages: [{ id: "wamid.m1" }] }), { status: 200 });
  }) as typeof fetch;

  const sender = whatsappSender("kapso", { kapso_api_key: "kp" }, { phone_number_id: "pn_1" });
  const sent = await sender.sendMedia({
    to: "+15550001111",
    type: "image",
    link: "https://files.example/photo.jpg",
    caption: "mira esto",
  });
  assert.equal(sent.wamid, "wamid.m1");
  assert.equal(calls.length, 1, "fetch was called");
  assert.ok(calls[0].url.endsWith("/pn_1/messages"), "sends from the phone_number_id");
  assert.equal(calls[0].body.type, "image");
  assert.equal(calls[0].body.image.link, "https://files.example/photo.jpg");
  assert.equal(calls[0].body.image.caption, "mira esto");
  assert.equal(calls[0].body.image.filename, undefined);

  await sender.sendMedia({
    to: "+15550001111",
    type: "audio",
    link: "https://files.example/note.ogg",
    caption: "audio no lleva caption",
    filename: "note.ogg",
  });
  assert.equal(calls[1].body.type, "audio");
  assert.deepEqual(calls[1].body.audio, { link: "https://files.example/note.ogg" },
    "caption and filename would make WhatsApp reject the audio send");
});

test("media posts YCloud's shape with from + document filename", async () => {
  const calls: Array<Record<string, any>> = [];
  globalThis.fetch = (async (_url: any, init: any) => {
    calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ id: "ycm_1", wamid: "wamid.y1", status: "queued" }), { status: 200 });
  }) as typeof fetch;

  const sender = whatsappSender("ycloud", { ycloud_api_key: "yk" }, { phone_number: "+15559990000" });
  const sent = await sender.sendMedia({
    to: "+5215550001111",
    type: "document",
    link: "https://files.example/reporte.pdf",
    caption: "aquí está",
    filename: "reporte.pdf",
  });
  assert.equal(sent.wamid, "wamid.y1");
  assert.equal(sent.providerMessageId, "ycm_1");
  assert.equal(calls.length, 1, "fetch was called");
  assert.equal(calls[0].type, "document");
  assert.equal(calls[0].from, "+15559990000");
  assert.deepEqual(calls[0].document, {
    link: "https://files.example/reporte.pdf",
    caption: "aquí está",
    filename: "reporte.pdf",
  });
});
