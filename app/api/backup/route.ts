import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { restoreCloudBackup } from "@/lib/cloud-store";
import { cloudEnabled, friendlyDatabaseError } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!cloudEnabled()) return NextResponse.json({ error: "Cloud storage is not configured" }, { status: 503 });
  try {
    const body = await request.json();
    const mode = body.mode === "replace" ? "replace" : "merge";
    return NextResponse.json(await restoreCloudBackup(user.id, body.backup, mode));
  } catch (error) {
    return NextResponse.json({ error: friendlyDatabaseError(error) }, { status: 400 });
  }
}
