import assert from "node:assert/strict";
import { test } from "node:test";
import { isSignupOpen, claimBootstrapProfile } from "./signup-gate.ts";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-key";

function headResponse(status: number, contentRange?: string): Response {
  const headers: Record<string, string> = {};
  if (contentRange) headers["content-range"] = contentRange;
  return new Response(null, { status, headers });
}

test("signup is open when there are zero users", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => headResponse(200, "0-0/0")) as typeof fetch;
  try {
    assert.equal(await isSignupOpen(), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("signup is closed once at least one user exists", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => headResponse(200, "0-0/1")) as typeof fetch;
  try {
    assert.equal(await isSignupOpen(), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fails closed (reports signup as closed) when the users count query errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => headResponse(500)) as typeof fetch;
  try {
    assert.equal(await isSignupOpen(), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fails closed (reports signup as closed) when the response is OK but the count header is missing", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => headResponse(200)) as typeof fetch; // sin content-range
  try {
    assert.equal(await isSignupOpen(), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// claimBootstrapProfile issues, in order: HEAD users (the gate recount) →
// POST upsert to users on success, or DELETE auth admin user on rollback.
// deleteUser validates the id is a UUID, so the fixtures use a real one.
const USER_ID = "11111111-1111-4111-8111-111111111111";

test("writes the profile row flagged super admin via an upsert (no signup trigger exists)", async () => {
  const originalFetch = globalThis.fetch;
  let upsertedBody: unknown = null;
  let upsertedUrl: string | null = null;
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input);
    if (init?.method === "HEAD" && url.includes("/rest/v1/users")) {
      return headResponse(200, "0-0/0");
    }
    if (init?.method === "POST" && url.includes("/rest/v1/users")) {
      upsertedUrl = url;
      upsertedBody = JSON.parse(String(init.body));
      return new Response(null, { status: 201 });
    }
    throw new Error(`unexpected fetch call: ${init?.method} ${url}`);
  }) as typeof fetch;
  try {
    assert.equal(
      await claimBootstrapProfile(USER_ID, "dueno@agencia.com"),
      true,
    );
    assert.match(upsertedUrl!, /\/rest\/v1\/users\?on_conflict=id/);
    assert.deepEqual(upsertedBody, {
      id: USER_ID,
      email: "dueno@agencia.com",
      full_name: "dueno",
      is_super_admin: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("loses the claim when a profile landed first — deletes the orphan auth user", async () => {
  const originalFetch = globalThis.fetch;
  let deletedAuthUser = false;
  let wroteProfile = false;
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input);
    if (init?.method === "HEAD" && url.includes("/rest/v1/users")) {
      return headResponse(200, "0-0/1");
    }
    if (init?.method === "POST" && url.includes("/rest/v1/users")) {
      wroteProfile = true;
      return new Response(null, { status: 201 });
    }
    if (
      init?.method === "DELETE" &&
      url.includes(`/auth/v1/admin/users/${USER_ID}`)
    ) {
      deletedAuthUser = true;
      return new Response("{}", { status: 200 });
    }
    throw new Error(`unexpected fetch call: ${init?.method} ${url}`);
  }) as typeof fetch;
  try {
    assert.equal(await claimBootstrapProfile(USER_ID, "x@y.com"), false);
    assert.ok(deletedAuthUser, "the just-created auth user must be rolled back");
    assert.ok(!wroteProfile, "no second profile may be written");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a failed profile write rolls back the auth user as well", async () => {
  const originalFetch = globalThis.fetch;
  let deletedAuthUser = false;
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input);
    if (init?.method === "HEAD" && url.includes("/rest/v1/users")) {
      return headResponse(200, "0-0/0");
    }
    if (init?.method === "POST" && url.includes("/rest/v1/users")) {
      return new Response("db down", { status: 500 });
    }
    if (
      init?.method === "DELETE" &&
      url.includes(`/auth/v1/admin/users/${USER_ID}`)
    ) {
      deletedAuthUser = true;
      return new Response("{}", { status: 200 });
    }
    throw new Error(`unexpected fetch call: ${init?.method} ${url}`);
  }) as typeof fetch;
  try {
    assert.equal(await claimBootstrapProfile(USER_ID, "x@y.com"), false);
    assert.ok(deletedAuthUser);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
