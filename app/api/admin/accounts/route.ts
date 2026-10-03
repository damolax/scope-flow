import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listPlatformAccounts } from "@/lib/cloud-store";
import { friendlyDatabaseError } from "@/lib/platform";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  try {
    return NextResponse.json({ accounts: await listPlatformAccounts(), currentUserId: user.id });
  } catch (error) {
    return NextResponse.json({ error: friendlyDatabaseError(error) }, { status: 500 });
  }
}
