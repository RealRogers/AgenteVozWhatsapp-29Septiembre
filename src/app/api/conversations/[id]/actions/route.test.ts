import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { NextRequest, NextResponse } from "next/server";

const WS = "11111111-1111-1111-1111-111111111111";
const CONV = "22222222-2222-2222-2222-222222222222";
// Must be RFC-4122 well-formed uuids — the route validates assigneeId with
// z.string().uuid(), so plain ids like "user_1" would 400 before any authz.
const OTHER = "55555555-5555-4555-8555-555555555555";
const SELF = "66666666-6666-4666-8666-666666666666";
const VIEWER = "77777777-7777-4777-8777-777777777777";

let currentUser: { id: string } | null = { id: "user_1" };
let convRow: Record<string, unknown> | null = {
  workspace_id: WS,
  state: "ai_active",
  assigned_to: null,
  archived: false,
  priority: "normal",
};

const fakeSupabase = {
  auth: { getUser: async () => ({ data: { user: currentUser } }) },
  from: () => ({
    select: () => ({
      eq: () => ({ single: async () => ({ data: convRow, error: null }) }),
    }),
  }),
};
mock.module("@/lib/supabase/server.ts", {
  exports: { createClient: async () => fakeSupabase },
});

// requireConversationUpdate mirrors the conversations UPDATE policy: admin,
// manager, or the assigned member. The fake below reproduces exactly that.
let memberResult: { ok: true; userId: string; role: string } = {
  ok: true,
  userId: "user_1",
  role: "agent",
};
const forbidden = () =>
  ({
    ok: false,
    response: NextResponse.json(
      { error: "No tienes permiso para modificar esta conversación" },
      { status: 403 },
    ),
  }) as const;

mock.module("@/lib/auth/workspace-access.ts", {
  exports: {
    requireWorkspaceMember: async (
      _ws: string,
      opts?: { minRole?: string },
    ) => {
      if (!memberResult.ok) return memberResult;
      const rank = { admin: 4, manager: 3, agent: 2, viewer: 1 };
      const need =
        rank[(opts?.minRole ?? "viewer") as keyof typeof rank] ?? 0;
      if (rank[memberResult.role as keyof typeof rank] < need) {
        return forbidden();
      }
      return memberResult;
    },
    requireConversationUpdate: async (conv: {
      workspace_id: string;
      assigned_to?: string | null;
    }) => {
      if (!memberResult.ok) return memberResult;
      if (
        memberResult.role === "admin" ||
        memberResult.role === "manager" ||
        conv.assigned_to === memberResult.userId
      ) {
        return memberResult;
      }
      return forbidden();
    },
    readJsonBody: async (req: Request) => ({
      ok: true,
      body: await req.json(),
    }),
  },
});

class ConversationActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConversationActionError";
  }
}

const actionCalls: unknown[] = [];
let nextError: Error | null = null;
mock.module("@/features/inbox/services/conversation-actions.ts", {
  exports: {
    ConversationActionError,
    applyConversationAction: async (...args: unknown[]) => {
      actionCalls.push(args);
      if (nextError) {
        const err = nextError;
        nextError = null;
        throw err;
      }
    },
  },
});

const { POST } = await import("./route.ts");

function makeReq(body: unknown) {
  return new NextRequest(`http://localhost/api/conversations/${CONV}/actions`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
const params = { params: Promise.resolve({ id: CONV }) };

function reset() {
  actionCalls.length = 0;
  nextError = null;
  currentUser = { id: "user_1" };
  memberResult = { ok: true, userId: "user_1", role: "agent" };
  convRow = {
    workspace_id: WS,
    state: "ai_active",
    assigned_to: "user_1",
    archived: false,
    priority: "normal",
  };
}

test("unauthenticated requests get 401 and never apply", async () => {
  reset();
  currentUser = null;
  const res = await POST(makeReq({ action: "close" }), params);
  assert.equal(res.status, 401);
  assert.equal(actionCalls.length, 0);
});

test("a missing conversation is 404", async () => {
  reset();
  convRow = null;
  const res = await POST(makeReq({ action: "close" }), params);
  assert.equal(res.status, 404);
  assert.equal(actionCalls.length, 0);
});

test("an unknown action is 400", async () => {
  reset();
  const res = await POST(makeReq({ action: "explode" }), params);
  assert.equal(res.status, 400);
  assert.equal(actionCalls.length, 0);
});

test("the assigned agent can close, flag and archive", async () => {
  reset();
  for (const action of ["close", "flag", "archive"] as const) {
    const res = await POST(makeReq({ action }), params);
    assert.equal(res.status, 200, `${action} → ${res.status}`);
  }
  assert.equal(actionCalls.length, 3);
  // applyConversationAction(ctx, action, assigneeId) — args land as an array.
  const ctx = (actionCalls[0] as unknown[])[0] as Record<string, unknown>;
  assert.equal(ctx.conversationId, CONV);
  assert.equal(ctx.workspaceId, WS);
  assert.equal(ctx.actorId, "user_1");
});

test("an agent NOT assigned cannot close or archive", async () => {
  reset();
  convRow = { ...convRow!, assigned_to: "someone_else" };
  for (const action of ["close", "archive", "flag"] as const) {
    const res = await POST(makeReq({ action }), params);
    assert.equal(res.status, 403, `${action} → ${res.status}`);
  }
  assert.equal(actionCalls.length, 0);
});

test("admin/manager act on conversations not assigned to them", async () => {
  reset();
  memberResult = { ok: true, userId: "boss_1", role: "manager" };
  convRow = { ...convRow!, assigned_to: "someone_else" };
  const res = await POST(makeReq({ action: "archive" }), params);
  assert.equal(res.status, 200);
  assert.equal(actionCalls.length, 1);
});

test("an agent can assign a conversation to themselves", async () => {
  reset();
  memberResult = { ok: true, userId: SELF, role: "agent" };
  convRow = { ...convRow!, assigned_to: null };
  const res = await POST(
    makeReq({ action: "assign", assigneeId: SELF }),
    params,
  );
  assert.equal(res.status, 200);
  assert.equal(actionCalls.length, 1);
});

test("an agent cannot assign to someone else; admin can", async () => {
  reset();
  // agent → other: 403
  const denied = await POST(
    makeReq({ action: "assign", assigneeId: OTHER }),
    params,
  );
  assert.equal(denied.status, 403);
  assert.equal(actionCalls.length, 0);

  // admin → other: allowed
  memberResult = { ok: true, userId: "boss_1", role: "admin" };
  const ok = await POST(
    makeReq({ action: "assign", assigneeId: OTHER }),
    params,
  );
  assert.equal(ok.status, 200);
  assert.equal(actionCalls.length, 1);
  assert.equal(actionCalls[0] && (actionCalls[0] as unknown[])[2], OTHER);
});

test("a viewer cannot do anything, including self-assign", async () => {
  reset();
  memberResult = { ok: true, userId: VIEWER, role: "viewer" };
  convRow = { ...convRow!, assigned_to: "user_1" };
  for (const action of ["close", "archive"] as const) {
    const res = await POST(makeReq({ action }), params);
    assert.equal(res.status, 403, `${action} → ${res.status}`);
  }
  const res = await POST(
    makeReq({ action: "assign", assigneeId: VIEWER }),
    params,
  );
  assert.equal(res.status, 403);
  assert.equal(actionCalls.length, 0);
});

test("invalid transitions surface as 422 with the message", async () => {
  reset();
  nextError = new Error("Invalid transition: closed → closed");
  const res = await POST(makeReq({ action: "close" }), params);
  assert.equal(res.status, 422);
});

test("a bad assignee surfaces as 422, not 500", async () => {
  reset();
  memberResult = { ok: true, userId: "boss_1", role: "admin" };
  nextError = new ConversationActionError(
    "El usuario no es miembro activo del workspace",
  );
  const res = await POST(
    makeReq({ action: "assign", assigneeId: OTHER }),
    params,
  );
  assert.equal(res.status, 422);
  const body = (await res.json()) as { error?: string };
  assert.match(body.error ?? "", /miembro/);
});
