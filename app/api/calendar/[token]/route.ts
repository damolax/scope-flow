import { NextResponse } from "next/server";
import { getCloudProposalByToken } from "@/lib/cloud-store";
import { dateTimeLabel, normalizeProposal } from "@/lib/helpers";
import { cloudEnabled } from "@/lib/supabase";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ token: string }> };

function icsEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}
function icsDate(value: string) { return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"); }

export async function GET(request: Request, context: RouteContext) {
  if (!cloudEnabled()) return NextResponse.json({ error: "Cloud storage is not configured" }, { status: 503 });
  const { token } = await context.params;
  const proposalRaw = await getCloudProposalByToken(token);
  if (!proposalRaw) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const proposal = normalizeProposal(proposalRaw);
  const plan = proposal.delivery;
  if (!plan?.deadlineAt) return NextResponse.json({ error: "The project delivery countdown has not started." }, { status: 409 });
  const origin = new URL(request.url).origin;
  const deadline = new Date(plan.deadlineAt);
  const eventEnd = new Date(deadline.getTime() + 60 * 60 * 1000).toISOString();
  const description = `Expected delivery for: ${proposal.title}\nClient: ${proposal.client.name}\nAgreement: ${proposal.proposalNumber}\nCountdown started: ${plan.countdownStartedAt ? dateTimeLabel(plan.countdownStartedAt, plan.timezone) : "Not recorded"}\nExpected delivery: ${dateTimeLabel(plan.deadlineAt, plan.timezone)}\nView project: ${origin}/review/${proposal.publicToken}`;
  const body = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ScopeFlow//Project Delivery//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", `UID:scopeflow-${proposal.id}@scopeflow`, `DTSTAMP:${icsDate(new Date().toISOString())}`, `DTSTART:${icsDate(plan.deadlineAt)}`, `DTEND:${icsDate(eventEnd)}`,
    `SUMMARY:${icsEscape(`${proposal.company.name} — ${proposal.title} delivery`)}`, `DESCRIPTION:${icsEscape(description)}`, `URL:${origin}/review/${proposal.publicToken}`,
    "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", "DESCRIPTION:Project delivery is due tomorrow", "END:VALARM", "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  return new NextResponse(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${proposal.proposalNumber}-project.ics"`, "Cache-Control": "no-store" } });
}
