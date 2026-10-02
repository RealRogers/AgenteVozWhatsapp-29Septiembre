import assert from "node:assert/strict";
import { test, mock } from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-key";

// redirect() throws in Next — mirror that so tests can assert the target.
class RedirectSentinel extends Error {
  url: string;
  constructor(url: string) {
    super(`redirect:${url}`);
    this.name = "RedirectSentinel";
    this.url = url;
  }
}

mock.module("next/navigation", {
  exports: {
    redirect: (url: string): never => {
      throw new RedirectSentinel(url);
    },
  },
});

mock.module("next/headers", {
  exports: { headers: async () => new Map() },
});

// ── fakes ────────────────────────────────────────────────────────────────────
let gateOpen = true;
let claimResult = true;
let claimCalls: { userId: string; email: string }[] = [];
let signUpCalls: { email: string; password: string }[] = [];
let signUpResult: {
  data: { user: { id: string; identities?: { provider: string }[] } | null };
  error: { message: string } | null;
} = { data: { user: null }, error: null };

mock.module("./signup-gate.ts", {
  exports: {
    isSignupOpen: async () => gateOpen,
    claimBootstrapProfile: async (userId: string, email: string) => {
      claimCalls.push({ userId, email });
      return claimResult;
    },
  },
});

mock.module("@/lib/supabase/server.ts", {
  exports: {
    createClient: async () => ({
      auth: {
        signUp: async (args: { email: string; password: string }) => {
          signUpCalls.push(args);
          return signUpResult;
        },
      },
    }),
  },
});

const { signup } = await import("./actions.ts");

const freshSignUp = {
  data: {
    user: { id: "user_new", identities: [{ provider: "email" }] },
  },
  error: null,
};

function reset(
  opts: {
    gateOpen?: boolean;
    claimResult?: boolean;
    signUpResult?: typeof signUpResult;
  } = {},
) {
  gateOpen = opts.gateOpen ?? true;
  claimResult = opts.claimResult ?? true;
  signUpResult = opts.signUpResult ?? freshSignUp;
  claimCalls = [];
  signUpCalls = [];
}

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const validForm = () =>
  formData({ email: "dueno@agencia.com", password: "password-9" });

// ── validation ───────────────────────────────────────────────────────────────

test("rejects a password shorter than 8 chars without touching auth", async () => {
  reset();
  const res = await signup(
    null,
    formData({ email: "a@b.com", password: "1234567" }),
  );
  assert.match(res.error, /8 caracteres/);
  assert.equal(signUpCalls.length, 0);
});

test("rejects an invalid email without touching auth", async () => {
  reset();
  const res = await signup(
    null,
    formData({ email: "not-an-email", password: "password-9" }),
  );
  assert.ok(res.error);
  assert.equal(signUpCalls.length, 0);
});

// ── gate ─────────────────────────────────────────────────────────────────────

test("a closed gate returns the invite-only error before calling auth", async () => {
  reset({ gateOpen: false });
  const res = await signup(null, validForm());
  assert.match(res.error, /registro está cerrado/);
  assert.equal(signUpCalls.length, 0);
  assert.equal(claimCalls.length, 0);
});

// ── auth.signUp results ──────────────────────────────────────────────────────

test("surfaces the localized auth error from signUp", async () => {
  reset({
    signUpResult: {
      data: { user: null },
      error: { message: "Signups not allowed for this instance" },
    },
  });
  const res = await signup(null, validForm());
  assert.match(res.error, /seed-admin\.mjs/);
  assert.equal(claimCalls.length, 0);
});

test("a signUp result without a user is an error, not a redirect", async () => {
  reset({ signUpResult: { data: { user: null }, error: null } });
  const res = await signup(null, validForm());
  assert.match(res.error, /No se pudo crear la cuenta/);
  assert.equal(claimCalls.length, 0);
});

test("an obfuscated user (empty identities) means the email is taken", async () => {
  reset({
    signUpResult: {
      data: { user: { id: "user_dup", identities: [] } },
      error: null,
    },
  });
  const res = await signup(null, validForm());
  assert.match(res.error, /ya está registrado/);
  assert.equal(claimCalls.length, 0);
});

// ── bootstrap claim ──────────────────────────────────────────────────────────

test("a lost claim reports closed instead of redirecting", async () => {
  reset({ claimResult: false });
  const res = await signup(null, validForm());
  assert.match(res.error, /registro está cerrado/);
  assert.equal(claimCalls.length, 1);
});

test("happy path: profile claim runs with the new user, then redirects to login", async () => {
  reset();
  await assert.rejects(
    () => signup(null, validForm()),
    (e: unknown) =>
      e instanceof RedirectSentinel &&
      e.url === "/login?message=Revisa%20tu%20email",
  );
  // The regression the gate rewrite fixed: the profile must be written (the
  // claim does the public.users upsert) — not just the auth user left alone.
  assert.deepEqual(claimCalls, [
    { userId: "user_new", email: "dueno@agencia.com" },
  ]);
  assert.deepEqual(signUpCalls, [
    { email: "dueno@agencia.com", password: "password-9" },
  ]);
});
