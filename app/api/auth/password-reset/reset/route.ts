import { NextResponse } from "next/server";
import { resetNeonPassword } from "@/lib/neon-auth";
import { authEnabled } from "@/lib/platform";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!authEnabled()) {
    return NextResponse.json({ error: "Neon authentication is not configured." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const token = String(body.token || "").trim();
  const password = String(body.password || "");

  if (!token) return NextResponse.json({ error: "The reset link is invalid or expired." }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });

  try {
    await resetNeonPassword(token, password, new URL(request.url).origin);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: String(error?.message || "Could not reset the password.") },
      { status: Number(error?.status) || 500 },
    );
  }
}
