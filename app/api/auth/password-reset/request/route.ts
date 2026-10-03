import { NextResponse } from "next/server";
import { requestNeonPasswordReset } from "@/lib/neon-auth";
import { authEnabled } from "@/lib/platform";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!authEnabled()) {
    return NextResponse.json({ error: "Neon authentication is not configured." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });

  try {
    const origin = new URL(request.url).origin;
    await requestNeonPasswordReset(email, `${origin}/reset-password`, origin);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: String(error?.message || "Could not send the reset email.") },
      { status: Number(error?.status) || 500 },
    );
  }
}
