import { NextResponse } from "next/server";
import { createSessionCookie } from "@/lib/auth";
import { ensureAccountForAuthUser } from "@/lib/cloud-store";
import { signInWithNeonAuth } from "@/lib/neon-auth";
import { authEnabled, cloudEnabled, friendlyDatabaseError } from "@/lib/platform";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!cloudEnabled() || !authEnabled()) {
    return NextResponse.json({ error: "Neon database or authentication is not configured." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  try {
    const identity = await signInWithNeonAuth(email, password, new URL(request.url).origin);
    const account = await ensureAccountForAuthUser(identity);

    if (!account.active) {
      return NextResponse.json({ error: "This ScopeFlow account has been disabled." }, { status: 403 });
    }

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
  } catch (error: any) {
    const message = friendlyDatabaseError(error);
    const status = Number(error?.status) || (/incorrect email or password/i.test(message) ? 401 : 500);
    return NextResponse.json({ error: message }, { status });
  }
}
