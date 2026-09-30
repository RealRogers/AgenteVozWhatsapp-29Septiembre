import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { NextRequest, NextResponse } from "next/server";

// UUIDs — the route's storagePath regex only accepts that shape.
const WS = "11111111-1111-1111-1111-111111111111";
const CONV = "22222222-2222-2222-2222-222222222222";
const OTHER_WS = "33333333-3333-3333-3333-333333333333";
const OTHER_CONV = "44444444-4444-4444-4444-444444444444";

let currentUser: { id: string } | null = { id: "user_1" };
let convRow = { workspace_id: WS, ai_enabled: false };

const fakeSupabase = {
  auth: { getUser: async () => ({ data: { user: currentUser } }) },
  from: () => ({
    select: () => ({ eq: () => ({ single: async () => ({ data: convRow, error: null }) }) }),
  }),
};
mock.module("@/lib/supabase/server.ts", {
  exports: { createClient: async () => fakeSupabase },
});

const memberCalls: unknown[] = [];
let memberResult: unknown = { ok: true, userId: "user_1", role: "agent" };
mock.module("@/lib/auth/workspace-access.ts", {
  exports: {
    requireWorkspaceMember: async (...args: unknown[]) => {
      memberCalls.push(args);
      return memberResult;
    },
    readJsonBody: async (req: Request) => ({ ok: true, body: await req.json() }),
  },
});

const dispatchCalls: unknown[] = [];
let dispatchResult: unknown = { ok: true, wamid: "wamid.1" };
mock.module("@/features/inbox/services/dispatch.ts", {
  exports: {
    dispatchMedia: async (opts: unknown) => {
      dispatchCalls.push(opts);
      return dispatchResult;
    },
  },
});
const transitions: unknown[] = [];
mock.module("@/features/inbox/services/decision-engine.ts", {
  exports: {
    applyTransition: async (...args: unknown[]) => {
      transitions.push(args);
    },
  },
});
mock.module("@/features/agents/services/active-agent.ts", {
  exports: { getActiveAgent: async () => null },
});

const { POST } = await import("./route.ts");

function makeReq(body: unknown) {
  return new NextRequest(`http://localhost/api/conversations/${CONV}/media`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
const params = { params: Promise.resolve({ id: CONV }) };

const VALID = {
  storagePath: `${WS}/${CONV}/1770000000000-photo.jpg`,
  mediaType: "image",
  mimeType: "image/jpeg",
};

test("requires at least the agent role on the conversation's workspace", async () => {
  memberCalls.length = 0;
  dispatchCalls.length = 0;
  memberResult = {
    ok: false,
    response: NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 }),
  };
  const res = await POST(makeReq(VALID), params);
  assert.equal(res.status, 403);
  assert.equal(dispatchCalls.length, 0, "a viewer must not send media");
  assert.deepEqual(memberCalls[0], [WS, { minRole: "agent" }]);
  memberResult = { ok: true, userId: "user_1", role: "agent" };
});

test("rejects a path outside this conversation", async () => {
  dispatchCalls.length = 0;
  for (const storagePath of [
    `${OTHER_WS}/${CONV}/1-x.jpg`,
    `${WS}/${OTHER_CONV}/1-x.jpg`,
    `${WS}/1-x.jpg`,
    `../${CONV}/1-x.jpg`,
  ]) {
    const res = await POST(makeReq({ ...VALID, storagePath }), params);
    assert.ok(res.status === 400 || res.status === 404, `${storagePath} → ${res.status}`);
  }
  assert.equal(dispatchCalls.length, 0);
});

test("rejects a mime type that does not match the media kind", async () => {
  dispatchCalls.length = 0;
  const res = await POST(
    makeReq({ ...VALID, mimeType: "application/pdf" }),
    params,
  );
  assert.equal(res.status, 400);
  assert.equal(dispatchCalls.length, 0);
});

test("an agent's media send reaches dispatch, scoped to its workspace", async () => {
  dispatchCalls.length = 0;
  dispatchResult = { ok: true, wamid: "wamid.m1" };
  const res = await POST(
    makeReq({ ...VALID, caption: "mira", sizeBytes: 42 }),
    params,
  );
  assert.equal(res.status, 200);
  assert.equal(dispatchCalls.length, 1);
  const call = dispatchCalls[0] as Record<string, unknown>;
  assert.equal(call.workspaceId, WS);
  assert.equal(call.conversationId, CONV);
  assert.equal(call.mediaType, "image");
  assert.equal(call.storagePath, VALID.storagePath);
  assert.equal(call.caption, "mira");
  assert.equal(call.senderUserId, "user_1");
});

test("sending media from an AI-active conversation sleeps the bot", async () => {
  transitions.length = 0;
  convRow = { workspace_id: WS, ai_enabled: true };
  const res = await POST(makeReq(VALID), params);
  assert.equal(res.status, 200);
  assert.deepEqual(transitions[0], [
    CONV,
    "human_active",
    { userId: "user_1", workspaceId: WS },
  ]);
  convRow = { workspace_id: WS, ai_enabled: false };
});

test("a dispatch failure surfaces as 422 with the Spanish message", async () => {
  dispatchCalls.length = 0;
  dispatchResult = { ok: false, error: "La ventana de 24 horas cerró", errorCode: "WINDOW_EXPIRED" };
  const res = await POST(makeReq(VALID), params);
  assert.equal(res.status, 422);
  const body = (await res.json()) as { error?: string };
  assert.match(body.error ?? "", /ventana/);
  dispatchResult = { ok: true, wamid: "wamid.1" };
});

test("unauthenticated requests never reach dispatch", async () => {
  dispatchCalls.length = 0;
  currentUser = null;
  const res = await POST(makeReq(VALID), params);
  assert.equal(res.status, 401);
  assert.equal(dispatchCalls.length, 0);
  currentUser = { id: "user_1" };
});
