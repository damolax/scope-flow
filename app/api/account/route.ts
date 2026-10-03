import { NextResponse } from "next/server";
import { clearSessionCookie, getSessionUser } from "@/lib/auth";
import { deleteOwnAccount } from "@/lib/cloud-store";
import { cloudEnabled, friendlyDatabaseError } from "@/lib/platform";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!cloudEnabled()) return NextResponse.json({ error: "Cloud storage is not configured" }, { status: 503 });
  if (user.isAdmin) return NextResponse.json({ error: "The protected platform administrator account cannot be deleted." }, { status: 403 });
  try {
    const body = await request.json().catch(() => ({}));
    const confirmation = String(body.confirmation || "").toLowerCase().trim();
    if (confirmation !== user.email.toLowerCase()) {
      return NextResponse.json({ error: "Enter your account email exactly to confirm deletion." }, { status: 400 });
    }
    await deleteOwnAccount(user.id);
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: friendlyDatabaseError(error) }, { status: 500 });
  }
}
