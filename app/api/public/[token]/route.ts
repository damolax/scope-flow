import { NextResponse } from "next/server";
import { getCloudProposalByToken, getProposalOwnerByToken, saveCloudProposal } from "@/lib/cloud-store";
import { acceptanceProbability, addHistory, approvalReference, approvedSnapshotFor, currentUnitPrice, isExpired, normalizeProposal, totalsFor } from "@/lib/helpers";
import { cloudEnabled } from "@/lib/platform";
import { Proposal, ProposalItem } from "@/lib/types";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ token: string }> };

function publicProposal(proposal: Proposal): Proposal {
  const publicItems = (items: ProposalItem[]) => items.map(({ flexibility: _f, minimumUnitPrice: _m, ...item }) => item as ProposalItem);
  return {
    ...proposal,
    minimumProjectTotal: undefined,
    items: publicItems(proposal.items),
    approvedSnapshot: proposal.approvedSnapshot
      ? { ...proposal.approvedSnapshot, items: publicItems(proposal.approvedSnapshot.items) }
      : undefined,
  };
}

async function load(context: RouteContext) {
  const { token } = await context.params;
  const proposal = await getCloudProposalByToken(token);
  return proposal ? normalizeProposal(proposal) : null;
}

async function savePublicProposal(proposal: Proposal) {
  const ownerId = await getProposalOwnerByToken(proposal.publicToken);
  if (!ownerId) throw new Error("Proposal owner could not be resolved");
  return saveCloudProposal(ownerId, proposal);
}

export async function GET(request: Request, context: RouteContext) {
  if (!cloudEnabled()) return NextResponse.json({ error: "Cloud storage is not configured" }, { status: 503 });
  let proposal = await load(context);
  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  const now = new Date().toISOString();
  const url = new URL(request.url);
  const preview = url.searchParams.get("preview") === "1";
  if (proposal.status === "awaiting_client" && !preview) {
    proposal = {
      ...proposal,
      responseState: proposal.responseState === "sent" ? "viewed" : proposal.responseState,
      firstViewedAt: proposal.firstViewedAt || now,
      lastViewedAt: now,
      viewCount: (proposal.viewCount || 0) + 1,
    };
    await savePublicProposal(proposal);
  }
  return NextResponse.json({ proposal: publicProposal(proposal) });
}

export async function POST(request: Request, context: RouteContext) {
  if (!cloudEnabled()) return NextResponse.json({ error: "Cloud storage is not configured" }, { status: 503 });
  const proposal = await load(context);
  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  const payload = await request.json();
  if (payload.action !== "estimate" || !Array.isArray(payload.offers)) return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  const offerMap = new Map<string, number>(payload.offers.map((offer: any) => [String(offer.id), Number(offer.unitPrice)] as [string, number]));
  const probabilities = Object.fromEntries(proposal.items.map((item) => [item.id, acceptanceProbability(item, offerMap.get(item.id) ?? currentUnitPrice(item))]));
  return NextResponse.json({ probabilities });
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!cloudEnabled()) return NextResponse.json({ error: "Cloud storage is not configured" }, { status: 503 });
  let proposal = await load(context);
  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  if (proposal.status === "draft") return NextResponse.json({ error: "This proposal has not been sent yet" }, { status: 409 });
  if (proposal.status === "closed") return NextResponse.json({ error: "This proposal is closed" }, { status: 409 });

  const payload = await request.json();
  const now = new Date().toISOString();
  const projectReviewAction = ["accept_project", "request_project_changes"].includes(String(payload.action));
  if (proposal.status === "approved" && !projectReviewAction) return NextResponse.json({ error: "This approved agreement is locked" }, { status: 409 });
  if (proposal.status !== "approved" && isExpired(proposal)) return NextResponse.json({ error: "This proposal has expired. Ask the business owner to extend it." }, { status: 409 });

  if (Array.isArray(payload.items) && proposal.status !== "approved") {
    const choices = new Map<string, any>(payload.items.map((item: any) => [String(item.id), item]));
    proposal.items = proposal.items.map((item) => {
      const choice = choices.get(item.id);
      if (!choice) return item;
      const base = currentUnitPrice(item);
      const offered = Number(choice.clientOfferUnitPrice);
      const canRequestPrice = item.clientCanRequestPrice !== false;
      const hasOffer = canRequestPrice && Number.isFinite(offered) && offered >= 0 && Math.abs(offered - base) > 0.005;
      const requestedQuantity = Math.max(1, Number(choice.quantity || item.quantity));
      const quantity = item.clientCanChangeQuantity === false ? item.quantity : requestedQuantity;
      return {
        ...item,
        selected: item.optional ? Boolean(choice.selected) : true,
        quantity,
        clientOfferUnitPrice: hasOffer ? offered : undefined,
        acceptanceProbability: hasOffer ? acceptanceProbability(item, offered) : undefined,
      };
    });
  }

  const signedBy = String(payload.signedBy || proposal.client.name || "").trim();
  const email = String(payload.email || proposal.client.email || "").trim();
  const note = String(payload.note || "").trim();
  if (!signedBy || !email) return NextResponse.json({ error: "Name and email are required" }, { status: 400 });

  if (payload.action === "approve") {
    if (!payload.termsAccepted) return NextResponse.json({ error: "You must accept the terms before approving." }, { status: 400 });
    const hasDifferentOffer = proposal.items.some((item) => (!item.optional || item.selected) && item.clientOfferUnitPrice !== undefined && Math.abs(item.clientOfferUnitPrice - currentUnitPrice(item)) > 0.005);
    if (hasDifferentOffer) return NextResponse.json({ error: "Submit the changed prices for review before approval." }, { status: 400 });
    const approvedKind = proposal.documentType === "change_order" ? "Additional work approved" : "Proposal approved";
    proposal = addHistory(proposal, approvedKind, `${signedBy} approved version ${proposal.version}.`, "client");
    proposal.status = "approved";
    proposal.responseState = "none";
    proposal.clientNote = note;
    proposal.approval = { signedBy, email, signedAt: now, note: note || "Approved with the selected scope.", termsAccepted: true, reference: approvalReference(proposal) };
    proposal.approvedSnapshot = approvedSnapshotFor(proposal);
  } else if (payload.action === "request") {
    const requestedTotals = totalsFor(proposal, "client_offer");
    const originalTotals = totalsFor(proposal, "accepted");
    const hasPriceRequest = proposal.items.some((item) => (!item.optional || item.selected) && item.clientOfferUnitPrice !== undefined && Math.abs(item.clientOfferUnitPrice - currentUnitPrice(item)) > 0.005);
    proposal = addHistory(proposal, hasPriceRequest ? "Price request received" : "Change request received", note || "Client requested a revision.", "client");
    proposal.status = "needs_response";
    proposal.responseState = hasPriceRequest ? "price_request" : "change_request";
    proposal.clientNote = note;
    proposal.priceRequest = hasPriceRequest ? { requestedBy: signedBy, email, requestedAt: now, note, originalTotal: originalTotals.total, requestedTotal: requestedTotals.total } : undefined;
  } else if (payload.action === "accept_project") {
    if (proposal.status !== "approved" || proposal.delivery?.status !== "delivered") {
      return NextResponse.json({ error: "This project is not awaiting acceptance." }, { status: 409 });
    }
    proposal.delivery = {
      ...proposal.delivery,
      status: "accepted",
      acceptedAt: now,
      acceptedBy: signedBy,
      acceptedEmail: email,
      clientReviewNote: note,
      completedAt: now,
    };
    proposal = addHistory(proposal, "Project accepted", `${signedBy} accepted the delivered project.`, "client");
  } else if (payload.action === "request_project_changes") {
    if (proposal.status !== "approved" || proposal.delivery?.status !== "delivered") {
      return NextResponse.json({ error: "This project is not awaiting review." }, { status: 409 });
    }
    if (!note) return NextResponse.json({ error: "Please describe the changes you need." }, { status: 400 });
    proposal.delivery = {
      ...proposal.delivery,
      status: "changes_requested",
      clientReviewNote: note,
      changesRequestedAt: now,
    };
    proposal = addHistory(proposal, "Project changes requested", note, "client");
  } else {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  proposal = await savePublicProposal(proposal);
  return NextResponse.json({ proposal: publicProposal(proposal) });
}
