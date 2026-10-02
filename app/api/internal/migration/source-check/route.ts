import crypto from "crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const EXPECTED_HASH = "d5d3376ac643349e780bcba6d141b8becae7731724dc0fb678c38292285a2497";

function authorized(request: Request) {
  const token = request.headers.get("x-migration-token") || "";
  const actual = crypto.createHash("sha256").update(token).digest("hex");
  return token.length > 20 && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(EXPECTED_HASH));
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const client = supabaseAdmin();
    const [accounts, workspaces, proposals, users] = await Promise.all([
      client.from("sf_accounts").select("id", { count: "exact", head: true }),
      client.from("sf_workspaces").select("owner_id", { count: "exact", head: true }),
      client.from("sf_proposals").select("id", { count: "exact", head: true }),
      client.auth.admin.listUsers({ page: 1, perPage: 1 }),
    ]);

    return NextResponse.json({
      reachable: true,
      counts: {
        accounts: accounts.count ?? null,
        workspaces: workspaces.count ?? null,
        proposals: proposals.count ?? null,
        authUsersAtLeast: users.data?.users?.length || 0,
      },
      errors: {
        accounts: accounts.error?.message || null,
        workspaces: workspaces.error?.message || null,
        proposals: proposals.error?.message || null,
        auth: users.error?.message || null,
      },
    });
  } catch (error: any) {
    return NextResponse.json({
      reachable: false,
      error: String(error?.message || error || "Unknown source connection error"),
    }, { status: 502 });
  }
}
