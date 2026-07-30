import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { setAccountActive } from "@/lib/cloud-store";
import { friendlyDatabaseError, platformAdminEmail } from "@/lib/supabase";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  const { id } = await context.params;
  if (id === user.id) return NextResponse.json({ error: "You cannot disable your own administrator account." }, { status: 409 });
  try {
    const { active } = await request.json();
    const account = await setAccountActive(id, Boolean(active));
    if (account.email === platformAdminEmail() && !account.active) {
      await setAccountActive(id, true);
      return NextResponse.json({ error: "The protected platform administrator cannot be disabled." }, { status: 409 });
    }
    return NextResponse.json({ account });
  } catch (error) {
    return NextResponse.json({ error: friendlyDatabaseError(error) }, { status: 500 });
  }
}
