import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSessionCookie } from "@/lib/auth";
import { ensureAccountForAuthUser } from "@/lib/cloud-store";
import { cloudEnabled, friendlyDatabaseError, publicAuthEnabled } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function authClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Authentication is not fully configured.");
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function POST(request: Request) {
  if (!cloudEnabled() || !publicAuthEnabled()) {
    return NextResponse.json({ error: "Authentication is not fully configured." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  try {
    const { data, error } = await authClient().auth.signInWithPassword({ email, password });

    if (error) {
      const message = String(error.message || "Sign in failed.");
      const lower = message.toLowerCase();
      if (lower.includes("invalid login credentials")) {
        return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
      }
      if (lower.includes("email not confirmed")) {
        return NextResponse.json({ error: "Confirm your email before signing in.", code: "email_not_confirmed" }, { status: 403 });
      }
      return NextResponse.json({ error: message }, { status: Number(error.status) || 502 });
    }

    if (!data.user?.email) {
      return NextResponse.json({ error: "Could not create a sign-in session." }, { status: 401 });
    }
    if (!data.user.email_confirmed_at) {
      return NextResponse.json({ error: "Confirm your email before signing in.", code: "email_not_confirmed" }, { status: 403 });
    }

    const account = await ensureAccountForAuthUser(data.user);
    if (!account.active) {
      return NextResponse.json({ error: "This account has been disabled. Contact ScopeFlow support." }, { status: 403 });
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
  } catch (error) {
    const message = friendlyDatabaseError(error);
    const networkFailure = /fetch failed|failed to fetch|enotfound|econnrefused|network/i.test(message);
    return NextResponse.json(
      { error: networkFailure ? "Authentication service is temporarily unreachable. Check the Supabase project URL and project status." : message },
      { status: networkFailure ? 503 : 500 },
    );
  }
}
