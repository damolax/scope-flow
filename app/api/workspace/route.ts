import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getWorkspaceSettings, saveWorkspaceSettings } from "@/lib/cloud-store";
import { cloudEnabled, friendlyDatabaseError } from "@/lib/platform";
import { WorkspaceSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!cloudEnabled()) return NextResponse.json({ error: "Cloud storage is not configured" }, { status: 503 });
  try { return NextResponse.json({ settings: await getWorkspaceSettings(user.id) }); }
  catch (error) { return NextResponse.json({ error: friendlyDatabaseError(error) }, { status: 500 }); }
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!cloudEnabled()) return NextResponse.json({ error: "Cloud storage is not configured" }, { status: 503 });
  try {
    const settings = (await request.json()) as WorkspaceSettings;
    return NextResponse.json({ settings: await saveWorkspaceSettings(user.id, settings) });
  } catch (error) { return NextResponse.json({ error: friendlyDatabaseError(error) }, { status: 500 }); }
}
