import { NextResponse } from "next/server";
import { createSessionCookie } from "@/lib/auth";
import { ensureAccountForAuthUser } from "@/lib/cloud-store";
import { cloudEnabled, friendlyDatabaseError, publicAuthEnabled, supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!cloudEnabled() || !publicAuthEnabled()) {
    return NextResponse.json({ error: "Authentication is not fully configured." }, { status: 503 });
  }
  try {
    const authorization = request.headers.get("authorization") || "";
    const body = await request.json().catch(() => ({}));
    const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : String(body.accessToken || "");
    if (!accessToken) return NextResponse.json({ error: "Missing authentication token." }, { status: 401 });

    const { data, error } = await supabaseAdmin().auth.getUser(accessToken);
    if (error || !data.user?.email) return NextResponse.json({ error: "Your sign-in session is invalid or expired." }, { status: 401 });
    if (!data.user.email_confirmed_at) return NextResponse.json({ error: "Confirm your email address before signing in." }, { status: 403 });

    const account = await ensureAccountForAuthUser(data.user);
    if (!account.active) return NextResponse.json({ error: "This account has been disabled. Contact ScopeFlow support." }, { status: 403 });

    const user = {
      id: account.id,
      name: account.name,
      email: account.email,
      businessName: account.businessName,
      source: "database" as const,
      isAdmin: account.isAdmin,
    };
    await createSessionCookie(user);
    return NextResponse.json({ ok: true, user });
  } catch (error) {
    return NextResponse.json({ error: friendlyDatabaseError(error) }, { status: 500 });
  }
}
