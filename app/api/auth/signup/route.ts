import { NextResponse } from "next/server";
import { createSessionCookie } from "@/lib/auth";
import { ensureAccountForAuthUser } from "@/lib/cloud-store";
import { signUpWithNeonAuth } from "@/lib/neon-auth";
import { authEnabled, cloudEnabled, friendlyDatabaseError } from "@/lib/platform";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!cloudEnabled() || !authEnabled()) {
    return NextResponse.json({ error: "Neon database or authentication is not configured." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const businessName = String(body.businessName || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!name || !businessName || !email || !password) {
    return NextResponse.json({ error: "Name, business name, email and password are required." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  try {
    const identity = await signUpWithNeonAuth(name, email, password, new URL(request.url).origin);
    const account = await ensureAccountForAuthUser(identity, businessName);

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
    return NextResponse.json(
      { error: friendlyDatabaseError(error) },
      { status: Number(error?.status) || 500 },
    );
  }
}
