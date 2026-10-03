import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { deleteCloudProposal, getCloudProposal, saveCloudProposal } from "@/lib/cloud-store";
import { cloudEnabled } from "@/lib/platform";
import { Proposal } from "@/lib/types";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!cloudEnabled()) return NextResponse.json({ error: "Cloud storage is not configured" }, { status: 503 });
  const { id } = await context.params;
  const proposal = await getCloudProposal(user.id, id);
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ proposal });
}

export async function PUT(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!cloudEnabled()) return NextResponse.json({ error: "Cloud storage is not configured" }, { status: 503 });
  const { id } = await context.params;
  const proposal = (await request.json()) as Proposal;
  if (proposal.id !== id) return NextResponse.json({ error: "Proposal ID mismatch" }, { status: 400 });
  const existing = await getCloudProposal(user.id, id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status === "approved" && proposal.status !== "approved") return NextResponse.json({ error: "Approved proposals are locked." }, { status: 409 });
  return NextResponse.json({ proposal: await saveCloudProposal(user.id, proposal) });
}

export async function DELETE(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!cloudEnabled()) return NextResponse.json({ error: "Cloud storage is not configured" }, { status: 503 });
  const { id } = await context.params;
  const proposal = await getCloudProposal(user.id, id);
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (proposal.status !== "draft") return NextResponse.json({ error: "Only drafts can be permanently deleted. Archive sent proposals instead." }, { status: 409 });
  await deleteCloudProposal(user.id, id);
  return NextResponse.json({ ok: true });
}
