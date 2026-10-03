import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { NextRequest } from "next/server";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-key";

// ── invite_requests table fake ────────────────────────────────────────────────
let existingPending: { id: string } | null = null;
let writes: { op: "insert" | "update"; row: unknown }[] = [];
let dbError: { message: string } | null = null;

mock.module("@supabase/supabase-js", {
  exports: {
    createClient: () => ({
      from: (table: string) => {
        assert.equal(table, "invite_requests");
        const chain: any = {
          eq: () => chain,
          ilike: () => chain,
          maybeSingle: async () => ({ data: existingPending, error: dbError }),
        };
        return {
          select: () => chain,
          insert: (row: unknown) => {
            writes.push({ op: "insert", row });
            return Promise.resolve({ error: dbError });
          },
          update: (row: unknown) => {
            writes.push({ op: "update", row });
            const u: any = {
              eq: () => u,
              then: (r: (v: unknown) => void) => r({ error: dbError }),
            };
            return u;
          },
        };
      },
    }),
  },
});

const { POST } = await import("./route.ts");

function req(body: unknown): NextRequest {
  return new NextRequest("https://app.test/api/invite-request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const valid = {
  name: "Ana García",
  email: "ana@empresa.com",
  note: "Trabajo para Empresa X",
};

function reset(opts: { pending?: boolean; dbError?: boolean } = {}) {
  existingPending = opts.pending ? { id: "req-1" } : null;
  writes = [];
  dbError = opts.dbError ? { message: "db down" } : null;
}

test("a valid request inserts a pending row and answers neutral ok", async () => {
  reset();
  const res = await POST(req(valid));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].op, "insert");
  assert.deepEqual(writes[0].row, { ...valid });
});

test("a filled honeypot gets the same ok but writes nothing", async () => {
  reset();
  const res = await POST(req({ ...valid, website: "spam.example" }));
  assert.equal(res.status, 200);
  assert.equal(writes.length, 0);
});

test("a repeat request refreshes the pending row instead of duplicating", async () => {
  reset({ pending: true });
  const res = await POST(req(valid));
  assert.equal(res.status, 200);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].op, "update");
});

test("an invalid payload is a 400 and writes nothing", async () => {
  reset();
  const res = await POST(req({ name: "Ana", email: "not-an-email" }));
  assert.equal(res.status, 400);
  assert.equal(writes.length, 0);
});

test("malformed JSON is a 400", async () => {
  reset();
  const res = await POST(
    new NextRequest("https://app.test/api/invite-request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{oops",
    }),
  );
  assert.equal(res.status, 400);
});

test("a db failure is a 500, not a fake ok", async () => {
  reset({ dbError: true });
  const res = await POST(req(valid));
  assert.equal(res.status, 500);
});
