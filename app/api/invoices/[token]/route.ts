import { NextResponse } from "next/server";
import { getCloudProposalByInvoiceToken, saveCloudProposal } from "@/lib/cloud-store";
import { sendTransactionalEmail, emailLayout } from "@/lib/email";
import { addHistory, invoiceByToken, normalizeProposal } from "@/lib/helpers";
import { cloudEnabled, friendlyDatabaseError, supabaseAdmin } from "@/lib/supabase";
import { Proposal, ProposalItem } from "@/lib/types";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ token: string }> };

function publicProposal(proposal: Proposal): Proposal {
  const publicItems = (items: ProposalItem[]) => items.map(({ flexibility: _f, minimumUnitPrice: _m, ...item }) => item as ProposalItem);
  return {
    ...proposal,
    minimumProjectTotal: undefined,
    items: publicItems(proposal.items),
    approvedSnapshot: proposal.approvedSnapshot ? { ...proposal.approvedSnapshot, items: publicItems(proposal.approvedSnapshot.items) } : undefined,
  };
}

async function savePublicProposal(proposal: Proposal) {
  const { data, error } = await supabaseAdmin().from("sf_proposals").select("owner_id").eq("id", proposal.id).single();
  if (error || !data) throw error || new Error("Invoice owner could not be resolved");
  return saveCloudProposal(String(data.owner_id), proposal);
}

export async function GET(request: Request, context: RouteContext) {
  if (!cloudEnabled()) return NextResponse.json({ error: "Cloud storage is not configured" }, { status: 503 });
  try {
    const { token } = await context.params;
    let proposal = await getCloudProposalByInvoiceToken(token);
    if (!proposal) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    proposal = normalizeProposal(proposal);
    const invoice = invoiceByToken(proposal, token);
    if (!invoice || invoice.linkEnabled === false) return NextResponse.json({ error: "This invoice link is no longer available." }, { status: 410 });
    const preview = new URL(request.url).searchParams.get("preview") === "1";
    if (!preview) {
      const now = new Date().toISOString();
      proposal.invoices = proposal.invoices!.map((item) => item.id === invoice.id ? { ...item, firstViewedAt: item.firstViewedAt || now, lastViewedAt: now, viewCount: (item.viewCount || 0) + 1, updatedAt: now } : item);
      proposal = await savePublicProposal(proposal);
    }
    return NextResponse.json({ proposal: publicProposal(proposal), invoice: invoiceByToken(proposal, token) });
  } catch (error) {
    return NextResponse.json({ error: friendlyDatabaseError(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!cloudEnabled()) return NextResponse.json({ error: "Cloud storage is not configured" }, { status: 503 });
  try {
    const { token } = await context.params;
    let proposal = await getCloudProposalByInvoiceToken(token);
    if (!proposal) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    proposal = normalizeProposal(proposal);
    const invoice = invoiceByToken(proposal, token);
    if (!invoice || invoice.linkEnabled === false) return NextResponse.json({ error: "This invoice link is no longer available." }, { status: 410 });
    const body = await request.json();
    if (body.action !== "report_payment") return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    if (!name || !email) return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
    if (invoice.status === "paid") return NextResponse.json({ error: "This invoice is already marked paid." }, { status: 409 });
    const now = new Date().toISOString();
    proposal.invoices = proposal.invoices!.map((item) => item.id === invoice.id ? { ...item, status: "payment_reported", paymentReportedAt: now, paymentReportedBy: name, paymentReportedEmail: email, updatedAt: now } : item);
    proposal = addHistory(proposal, "Payment reported", `${name} reported payment for ${invoice.number}.`, "client");
    proposal = await savePublicProposal(proposal);
    const ownerLink = `${new URL(request.url).origin}/app`;
    await sendTransactionalEmail({
      to: proposal.company.email,
      replyTo: email,
      subject: `Payment reported for ${invoice.number}`,
      html: emailLayout({ business: proposal.company.name, heading: "Client reported payment", intro: `${name} reported payment for ${invoice.number}. Verify the payment before marking the invoice paid.`, rows: [["Invoice", invoice.number], ["Client", name], ["Amount", `${proposal.currency} ${invoice.amountDue.toFixed(2)}`]], actionLabel: "Open ScopeFlow", actionUrl: ownerLink }),
    });
    return NextResponse.json({ proposal: publicProposal(proposal) });
  } catch (error) {
    return NextResponse.json({ error: friendlyDatabaseError(error) }, { status: 500 });
  }
}
