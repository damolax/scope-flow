import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getCloudProposal, saveCloudProposal } from "@/lib/cloud-store";
import { emailLayout, sendTransactionalEmail } from "@/lib/email";
import { activeInvoices, addHistory, dateTimeLabel, invoiceByToken, money, normalizeProposal, remainingTimeLabel } from "@/lib/helpers";
import { cloudEnabled } from "@/lib/supabase";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!cloudEnabled()) return NextResponse.json({ error: "Cloud storage is not configured" }, { status: 503 });
  const { id } = await context.params;
  const proposalRaw = await getCloudProposal(user.id, id);
  if (!proposalRaw) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  const proposal = normalizeProposal(proposalRaw);
  const body = await request.json();
  const event = String(body.event || "");
  const origin = new URL(request.url).origin;
  const projectUrl = `${origin}/review/${proposal.publicToken}`;
  const invoice = body.invoiceToken
    ? invoiceByToken(proposal, String(body.invoiceToken))
    : event === "invoice_ready"
      ? activeInvoices(proposal)[0]
      : undefined;
  const plan = proposal.delivery;

  let subject = `${proposal.company.name}: ${proposal.title}`;
  let heading = "Project update";
  let intro = `There is an update for ${proposal.title}.`;
  let rows: Array<[string, string]> = [];
  let actionLabel = "View project";
  let actionUrl = projectUrl;

  if (event === "proposal_sent") {
    heading = proposal.documentType === "change_order" ? "Additional work is ready to review" : "Your proposal is ready to review";
    intro = "Review the included scope, choose optional extras, request changes if needed, and approve the final version through the secure link.";
    rows = [["Proposal", proposal.proposalNumber], ["Valid until", proposal.validUntil]];
    actionLabel = "Review proposal";
  } else if (event === "invoice_ready" && invoice) {
    subject = `${proposal.company.name}: Invoice ${invoice.number}`;
    heading = "Your invoice is ready";
    intro = "This invoice is based on the approved agreement and is available through a secure read-only link.";
    rows = [["Invoice", invoice.number], ["Amount due", money(invoice.amountDue, proposal.currency)], ["Due date", invoice.dueAt]];
    actionLabel = "View invoice";
    actionUrl = `${origin}/invoice/${invoice.publicToken}`;
  } else if (event === "payment_confirmed") {
    heading = "Payment confirmed";
    intro = plan?.countdownStartedAt ? "Your payment has been confirmed and the project delivery countdown has started." : "Your payment has been confirmed. The business owner will start the project countdown when work begins.";
    rows = [["Project", proposal.title], ["Status", plan?.status === "scheduled" ? "Scheduled" : "In progress"]];
    if (plan?.deadlineAt) rows.push(["Expected delivery", dateTimeLabel(plan.deadlineAt, plan.timezone)]);
  } else if (event === "project_started") {
    heading = "Your project has started";
    intro = `${proposal.company.name} has started work on ${proposal.title}. You can return to the secure project page at any time to see the remaining delivery time.`;
    rows = [["Status", "In progress"], ["Time remaining", remainingTimeLabel(plan)]];
    if (plan?.deadlineAt) rows.push(["Expected delivery", dateTimeLabel(plan.deadlineAt, plan.timezone)]);
  } else if (event === "project_paused") {
    heading = "Project countdown paused";
    intro = "The delivery countdown has been paused. The remaining time is preserved and will continue when the project resumes.";
    rows = [["Reason", plan?.pauseReason || String(body.note || "Project paused")], ["Time remaining", remainingTimeLabel(plan)]];
  } else if (event === "project_resumed") {
    heading = "Project countdown resumed";
    intro = "Work has resumed and the delivery countdown is running again.";
    rows = [["Status", "In progress"], ["Time remaining", remainingTimeLabel(plan)]];
    if (plan?.deadlineAt) rows.push(["Updated delivery", dateTimeLabel(plan.deadlineAt, plan.timezone)]);
  } else if (event === "schedule_updated") {
    heading = "Project delivery schedule updated";
    intro = String(body.note || "The expected delivery schedule has been updated.");
    if (plan?.deadlineAt) rows = [["Updated delivery", dateTimeLabel(plan.deadlineAt, plan.timezone)], ["Time remaining", remainingTimeLabel(plan)]];
  } else if (event === "ready_for_review") {
    heading = "Your project is ready for review";
    intro = String(body.note || `${proposal.company.name} has marked ${proposal.title} ready for your review.`);
    rows = [["Status", "Ready for review"], ["Project", proposal.title]];
  } else if (event === "delivered") {
    heading = "Your project has been delivered";
    intro = String(body.note || `${proposal.company.name} has marked ${proposal.title} as delivered.`);
    rows = [["Status", "Delivered"]];
    if (plan?.deliveredAt) rows.push(["Delivered", dateTimeLabel(plan.deliveredAt, plan.timezone)]);
  } else if (event === "reminder") {
    heading = invoice ? `Reminder: invoice ${invoice.number}` : "Reminder: your proposal is waiting";
    intro = String(body.note || (invoice ? "Your invoice is available through the secure link." : "Please review the latest proposal or project update through the secure link."));
    if (invoice) {
      rows = [["Invoice", invoice.number], ["Amount due", money(invoice.amountDue, proposal.currency)], ["Due date", invoice.dueAt]];
      actionLabel = "View invoice";
      actionUrl = `${origin}/invoice/${invoice.publicToken}`;
    }
  } else {
    return NextResponse.json({ error: "Unsupported notification type" }, { status: 400 });
  }

  const result = await sendTransactionalEmail({
    to: proposal.client.email,
    replyTo: proposal.company.email,
    subject,
    html: emailLayout({ business: proposal.company.name, heading, intro, rows, actionLabel, actionUrl, note: "Reply to this email to contact the business owner directly." }),
  });

  if (result.sent) {
    const now = new Date().toISOString();
    let next = normalizeProposal(proposal);
    if (next.delivery) next.delivery = { ...next.delivery, lastClientNotificationAt: now, lastClientNotificationType: event };
    next = addHistory(next, "Client email sent", `${heading} sent to ${next.client.email}.`, "system");
    await saveCloudProposal(user.id, next);
  }

  const mailto = `mailto:${encodeURIComponent(proposal.client.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${heading}\n\n${intro}\n\n${rows.map(([label, value]) => `${label}: ${value}`).join("\n")}\n\n${actionUrl}\n\n${proposal.company.name}`)}`;
  return NextResponse.json({ ...result, mailto });
}
