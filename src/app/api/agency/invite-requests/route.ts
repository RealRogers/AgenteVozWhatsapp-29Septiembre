import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import {
  listInviteRequests,
  updateInviteRequestStatus,
} from "@/features/agency/services/invite-requests";

async function assertSuperAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("users")
    .select("is_super_admin")
    .eq("id", user.id)
    .single();

  return data?.is_super_admin === true;
}

// GET /api/agency/invite-requests — pending first, newest first
export async function GET() {
  if (!(await assertSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await listInviteRequests();
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ requests: result.requests });
}

const PatchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["approved", "dismissed"]),
});

// PATCH /api/agency/invite-requests — close a request as approved/dismissed
export async function PATCH(req: NextRequest) {
  if (!(await assertSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const result = await updateInviteRequestStatus(
    parsed.data.id,
    parsed.data.status,
  );
  if (result.error) {
    return NextResponse.json(
      { error: result.error },
      { status: result.conflict ? 409 : 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
