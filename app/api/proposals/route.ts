import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listCloudProposals, saveCloudProposal } from "@/lib/cloud-store";
import { cloudEnabled, friendlyDatabaseError } from "@/lib/supabase";
import { Proposal } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!cloudEnabled()) return NextResponse.json({ error: "Cloud storage is not configured" }, { status: 503 });
  try { return NextResponse.json({ proposals: await listCloudProposals(user.id) }); }
  catch (error) { return NextResponse.json({ error: friendlyDatabaseError(error) }, { status: 500 }); }
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!cloudEnabled()) return NextResponse.json({ error: "Cloud storage is not configured" }, { status: 503 });
  try {
    const proposal = (await request.json()) as Proposal;
    return NextResponse.json({ proposal: await saveCloudProposal(user.id, proposal) });
  } catch (error) { return NextResponse.json({ error: friendlyDatabaseError(error) }, { status: 500 }); }
}
