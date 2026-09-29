import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Workspace-agnostic YCloud key tester. Used during onboarding (before a
// workspace exists) so the API key is never exposed to the browser and the
// call is not CORS-blocked. Auth-gated: any signed-in user may validate a key.

type YCloudBalanceResponse = {
  balance?: number;
  currency?: string;
  [key: string]: unknown;
};

const bodySchema = z.object({
  apiKey: z.string().min(1, "API key requerida"),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  try {
    const res = await fetch("https://api.ycloud.com/v2/balance", {
      headers: { "X-API-Key": parsed.data.apiKey },
    });

    if (res.ok) {
      const balance = (await res.json()) as YCloudBalanceResponse;
      return NextResponse.json({ ok: true, balance });
    }

    return NextResponse.json({
      ok: false,
      error: "API Key inválida o sin acceso",
    });
  } catch (err) {
    console.error(
      "[integrations/ycloud/test] YCloud fetch error:",
      err instanceof Error ? err.message : "unknown",
    );
    return NextResponse.json({
      ok: false,
      error: "No se pudo conectar con YCloud",
    });
  }
}
