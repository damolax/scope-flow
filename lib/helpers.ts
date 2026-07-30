import {
  ApprovedSnapshot, DeliveryPlan, InvoiceInfo, PriceFlexibility, ProjectStatus,
  Proposal, ProposalHistoryEntry, ProposalItem, ProposalTotals, ScopeFlowBackup,
  WorkspaceSettings,
} from "./types";

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export type TotalMode = "accepted" | "original" | "client_offer";

export function currentUnitPrice(item: ProposalItem) {
  return item.ownerCounterUnitPrice ?? item.acceptedUnitPrice ?? item.unitPrice;
}

export function itemUnitPrice(item: ProposalItem, mode: TotalMode = "accepted") {
  if (mode === "original") return item.unitPrice;
  if (mode === "client_offer") return item.clientOfferUnitPrice ?? currentUnitPrice(item);
  return currentUnitPrice(item);
}

export function totalsFor(proposal: Proposal | ApprovedSnapshot, mode: TotalMode = "accepted"): ProposalTotals {
  const items = proposal.items.filter((item) => !item.optional || item.selected);
  const subtotal = items.reduce((sum, item) => sum + item.quantity * itemUnitPrice(item, mode), 0);
  const negotiated = items.some((item) => Math.abs(itemUnitPrice(item, mode) - item.unitPrice) > 0.005);
  const incentive = proposal.incentive;
  const incentiveUnlocked = Boolean(
    incentive?.enabled && subtotal >= Math.max(0, incentive.threshold) && (!negotiated || incentive.allowWithNegotiation),
  );
  const incentiveDiscount = incentiveUnlocked ? subtotal * (Math.max(0, incentive.percent) / 100) : 0;
  const taxable = subtotal - incentiveDiscount;
  const taxEnabled = "taxEnabled" in proposal ? proposal.taxEnabled : false;
  const taxPercent = "taxPercent" in proposal ? proposal.taxPercent : 0;
  const tax = taxEnabled ? taxable * (Math.max(0, taxPercent) / 100) : 0;
  return {
    subtotal,
    incentiveDiscount,
    tax,
    total: taxable + tax,
    incentiveUnlocked,
    remainingToUnlock: Math.max(0, (incentive?.threshold || 0) - subtotal),
    negotiated,
  };
}

const flexibilityDefaults: Record<PriceFlexibility, { floor: number; resistance: number }> = {
  fixed: { floor: 1, resistance: 10 },
  slight: { floor: 0.9, resistance: 8 },
  flexible: { floor: 0.75, resistance: 5 },
  custom: { floor: 0.8, resistance: 6 },
};

export function acceptanceProbability(item: ProposalItem, proposedUnitPrice: number) {
  const list = Math.max(0.01, Number(currentUnitPrice(item) || 0.01));
  const proposed = Math.max(0, Number(proposedUnitPrice || 0));
  const ratio = proposed / list;
  if (ratio >= 1) return 96;
  const defaults = flexibilityDefaults[item.flexibility || (item.optional ? "flexible" : "fixed")];
  const hiddenFloor = item.minimumUnitPrice && item.minimumUnitPrice > 0
    ? Math.min(1, item.minimumUnitPrice / list)
    : defaults.floor;
  if (item.flexibility === "fixed") return Math.max(2, Math.min(12, Math.round(11 - (1 - ratio) * 80)));
  if (ratio >= hiddenFloor) {
    const progress = (ratio - hiddenFloor) / Math.max(0.01, 1 - hiddenFloor);
    return Math.max(48, Math.min(94, Math.round(70 + progress * 24 - defaults.resistance * 1.5)));
  }
  const below = (hiddenFloor - ratio) / Math.max(0.01, hiddenFloor);
  return Math.max(3, Math.min(48, Math.round(48 - below * 70 - defaults.resistance)));
}

export function probabilityLabel(value?: number) {
  const probability = Number(value || 0);
  if (probability >= 85) return "Very likely";
  if (probability >= 68) return "Likely";
  if (probability >= 42) return "Possible";
  if (probability >= 16) return "Unlikely";
  return "Very unlikely";
}

export function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency} ${Number(value || 0).toFixed(2)}`;
  }
}


export function safeTimeZone(value?: string) {
  const candidate = String(value || "UTC").trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return "UTC";
  }
}

export function dateLabel(value?: string, timezone?: string) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: safeTimeZone(timezone) }).format(new Date(value));
  } catch {
    return "—";
  }
}

export function dateTimeLabel(value?: string, timezone?: string) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: safeTimeZone(timezone) }).format(new Date(value));
  } catch {
    return "—";
  }
}

export function isExpired(proposal: Proposal) {
  const expiry = new Date(`${proposal.validUntil}T23:59:59`);
  return Number.isFinite(expiry.getTime()) && expiry.getTime() < Date.now();
}

export function normalizedInvoices(proposal: Proposal): InvoiceInfo[] {
  const source = Array.isArray(proposal.invoices) ? proposal.invoices : [];
  const legacy = proposal.invoice;
  const combined = source.length ? source : legacy ? [legacy] : [];
  return combined.map((invoice, index) => ({
    id: invoice.id || `invoice-${proposal.id}-${index + 1}`,
    publicToken: invoice.publicToken || (index === 0 ? proposal.publicToken : uid()),
    number: invoice.number,
    kind: invoice.kind || "full",
    issuedAt: invoice.issuedAt,
    dueAt: invoice.dueAt,
    amountDue: Number(invoice.amountDue || 0),
    status: invoice.status === "paid" ? "paid" : invoice.status === "payment_reported" ? "payment_reported" : invoice.status === "cancelled" ? "cancelled" : "unpaid",
    note: invoice.note || "",
    archived: Boolean(invoice.archived),
    linkEnabled: invoice.linkEnabled !== false,
    firstViewedAt: invoice.firstViewedAt,
    lastViewedAt: invoice.lastViewedAt,
    viewCount: Number(invoice.viewCount || 0),
    paymentReportedAt: invoice.paymentReportedAt,
    paymentReportedBy: invoice.paymentReportedBy,
    paymentReportedEmail: invoice.paymentReportedEmail,
    paidAt: invoice.paidAt,
    createdAt: invoice.createdAt || invoice.issuedAt,
    updatedAt: invoice.updatedAt || invoice.issuedAt,
  }));
}

export function activeInvoices(proposal: Proposal) {
  return normalizedInvoices(proposal).filter((invoice) => !invoice.archived && invoice.status !== "cancelled");
}

export function primaryInvoice(proposal: Proposal) {
  return activeInvoices(proposal)[0] || normalizedInvoices(proposal)[0];
}

export function paidInvoiceAmount(proposal: Proposal) {
  return normalizedInvoices(proposal)
    .filter((invoice) => invoice.status === "paid")
    .reduce((sum, invoice) => sum + Number(invoice.amountDue || 0), 0);
}

export function totalInvoicedAmount(proposal: Proposal) {
  return normalizedInvoices(proposal)
    .filter((invoice) => invoice.status !== "cancelled")
    .reduce((sum, invoice) => sum + Number(invoice.amountDue || 0), 0);
}

export function remainingToInvoice(proposal: Proposal) {
  const approved = totalsFor(proposal.approvedSnapshot || proposal).total;
  return Math.max(0, approved - totalInvoicedAmount(proposal));
}

export function invoiceByToken(proposal: Proposal, token: string) {
  return normalizedInvoices(proposal).find((invoice) => invoice.publicToken === token) || null;
}

export function defaultDeliveryPlan(company?: { defaultTimezone?: string; defaultDeliveryTime?: string }): DeliveryPlan {
  return {
    enabled: true,
    duration: 14,
    dayMode: "calendar_days",
    startTrigger: "full_payment",
    autoStartOnPayment: true,
    deliveryTime: company?.defaultDeliveryTime || "17:00",
    timezone: company?.defaultTimezone || "UTC",
    status: "awaiting_payment",
    totalPausedMs: 0,
  };
}

export function normalizeProposal(proposal: Proposal): Proposal {
  const invoices = normalizedInvoices(proposal);
  const delivery = proposal.delivery ? { ...defaultDeliveryPlan(proposal.company), ...proposal.delivery } : defaultDeliveryPlan(proposal.company);
  return {
    ...proposal,
    archived: Boolean(proposal.archived),
    invoices,
    invoice: undefined,
    delivery,
    history: Array.isArray(proposal.history) ? proposal.history : [],
    viewCount: Number(proposal.viewCount || 0),
  };
}

function zonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimeZone(timeZone),
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    weekday: "short",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second), weekday: String(parts.weekday || ""),
  };
}

function timezoneOffsetMs(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - date.getTime();
}

function zonedDateTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  let value = guess - timezoneOffsetMs(new Date(guess), timeZone);
  value = guess - timezoneOffsetMs(new Date(value), timeZone);
  return new Date(value);
}

export function calculateDeliveryDeadline(startIso: string, plan: DeliveryPlan) {
  const timeZone = safeTimeZone(plan.timezone);
  const start = new Date(startIso);
  const startParts = zonedParts(start, timeZone);
  const cursor = new Date(Date.UTC(startParts.year, startParts.month - 1, startParts.day));
  let remaining = Math.max(1, Math.round(plan.duration || 1));
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const weekday = cursor.getUTCDay();
    if (plan.dayMode === "business_days" && (weekday === 0 || weekday === 6)) continue;
    remaining -= 1;
  }
  const [hour, minute] = String(plan.deliveryTime || "17:00").split(":").map(Number);
  return zonedDateTimeToUtc(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate(), Number.isFinite(hour) ? hour : 17, Number.isFinite(minute) ? minute : 0, timeZone).toISOString();
}

export function startDelivery(plan: DeliveryPlan, at = new Date().toISOString(), status: ProjectStatus = "in_progress"): DeliveryPlan {
  const next = { ...plan, enabled: true, status, countdownStartedAt: at, pausedAt: undefined, pausedRemainingMs: undefined, pauseReason: undefined };
  return { ...next, deadlineAt: calculateDeliveryDeadline(at, next) };
}

export function pauseDelivery(plan: DeliveryPlan, reason: string, at = new Date().toISOString()): DeliveryPlan {
  if (!plan.deadlineAt || !["in_progress", "ready_for_review", "scheduled"].includes(plan.status)) return plan;
  return {
    ...plan,
    status: "paused",
    pausedAt: at,
    pausedRemainingMs: Math.max(0, new Date(plan.deadlineAt).getTime() - new Date(at).getTime()),
    pauseReason: reason || "Project paused",
  };
}

export function resumeDelivery(plan: DeliveryPlan, at = new Date().toISOString()): DeliveryPlan {
  if (plan.status !== "paused") return plan;
  const remaining = Math.max(0, Number(plan.pausedRemainingMs || 0));
  const pausedFor = plan.pausedAt ? Math.max(0, new Date(at).getTime() - new Date(plan.pausedAt).getTime()) : 0;
  return {
    ...plan,
    status: "in_progress",
    deadlineAt: new Date(new Date(at).getTime() + remaining).toISOString(),
    totalPausedMs: Number(plan.totalPausedMs || 0) + pausedFor,
    pausedAt: undefined,
    pausedRemainingMs: undefined,
    pauseReason: undefined,
  };
}

export function extendDelivery(plan: DeliveryPlan, days: number, at = new Date().toISOString()): DeliveryPlan {
  const amount = Math.max(1, Math.round(days || 1));
  if (plan.status === "paused" && plan.pausedRemainingMs !== undefined) {
    return { ...plan, pausedRemainingMs: plan.pausedRemainingMs + amount * 86_400_000 };
  }
  const base = plan.deadlineAt ? new Date(plan.deadlineAt) : new Date(at);
  base.setUTCDate(base.getUTCDate() + amount);
  return { ...plan, deadlineAt: base.toISOString() };
}

export type DeliveryUrgency = "not_started" | "on_track" | "due_soon" | "almost_due" | "overdue" | "paused" | "delivered";

export function deliveryUrgency(plan?: DeliveryPlan, now = Date.now(), dueSoonHours = 72, almostDueHours = 12): DeliveryUrgency {
  if (!plan?.enabled || !plan.deadlineAt) return "not_started";
  if (plan.status === "paused") return "paused";
  if (["delivered", "completed"].includes(plan.status)) return "delivered";
  const remaining = new Date(plan.deadlineAt).getTime() - now;
  if (remaining < 0) return "overdue";
  if (remaining <= Math.max(1, almostDueHours) * 3_600_000) return "almost_due";
  if (remaining <= Math.max(almostDueHours + 1, dueSoonHours) * 3_600_000) return "due_soon";
  return "on_track";
}

export function urgencyLabel(urgency: DeliveryUrgency) {
  return {
    not_started: "Not started",
    on_track: "On track",
    due_soon: "Due soon",
    almost_due: "Almost due",
    overdue: "Overdue",
    paused: "Paused",
    delivered: "Delivered",
  }[urgency];
}

export function remainingTimeLabel(plan?: DeliveryPlan, now = Date.now()) {
  if (!plan?.enabled) return "Delivery countdown not enabled";
  if (plan.status === "paused") {
    const value = Math.max(0, Number(plan.pausedRemainingMs || 0));
    return `${durationLabel(value)} remaining when resumed`;
  }
  if (!plan.deadlineAt) return plan.status === "scheduled" ? "Waiting for project start" : "Countdown has not started";
  if (["delivered", "completed"].includes(plan.status)) return plan.deliveredAt ? `Delivered ${dateTimeLabel(plan.deliveredAt, plan.timezone)}` : "Delivered";
  const difference = new Date(plan.deadlineAt).getTime() - now;
  if (difference < 0) return `${durationLabel(Math.abs(difference))} overdue`;
  return `${durationLabel(difference)} remaining`;
}

export function durationLabel(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days} day${days === 1 ? "" : "s"}${hours ? ` ${hours} hr` : ""}`;
  if (hours > 0) return `${hours} hr${hours === 1 ? "" : "s"}${minutes ? ` ${minutes} min` : ""}`;
  return `${minutes} min`;
}

export function paymentTriggerMet(proposal: Proposal) {
  const plan = proposal.delivery || defaultDeliveryPlan(proposal.company);
  const paid = paidInvoiceAmount(proposal);
  const approvedTotal = totalsFor(proposal.approvedSnapshot || proposal).total;
  if (plan.startTrigger === "manual") return false;
  if (plan.startTrigger === "deposit") return paid >= Math.max(0.01, Number(plan.depositRequired || 0.01));
  return paid + 0.005 >= approvedTotal;
}

export function statusLabel(proposal: Proposal) {
  if (proposal.trashedAt) return "Trash";
  if (proposal.archived) return "Archived";
  if (proposal.status === "draft") return "Draft";
  if (proposal.status === "needs_response") return "Needs response";
  if (proposal.status === "approved") return "Approved";
  if (proposal.status === "closed") return "Closed";
  return "Awaiting client";
}

export function secondaryStatusLabel(proposalInput: Proposal) {
  const proposal = normalizeProposal(proposalInput);
  if (isExpired(proposal) && proposal.status === "awaiting_client") return "Expired";
  if (proposal.status === "approved") {
    const invoices = activeInvoices(proposal);
    if (!invoices.length) return "Agreement locked — invoice not created";
    const reported = invoices.find((invoice) => invoice.status === "payment_reported");
    if (reported) return `Payment reported for ${reported.number}`;
    if (invoices.every((invoice) => invoice.status === "paid")) return "All invoices marked paid";
    const views = invoices.reduce((sum, invoice) => sum + Number(invoice.viewCount || 0), 0);
    if (views > 0) return `${invoices.length} invoice${invoices.length === 1 ? "" : "s"} · viewed ${views} time${views === 1 ? "" : "s"}`;
    return `${invoices.length} invoice${invoices.length === 1 ? "" : "s"} ready`;
  }
  return {
    none: "Not sent",
    sent: "Sent",
    viewed: "Viewed",
    price_request: "Price requested",
    change_request: "Changes requested",
    counteroffer: "Counteroffer sent",
    request_accepted: "Request accepted — client confirmation needed",
    request_declined: "Request declined — client confirmation needed",
    expired: "Expired",
    archived: "Archived",
  }[proposal.responseState];
}

export function addHistory(proposal: Proposal, action: string, detail: string, actor: ProposalHistoryEntry["actor"], incrementVersion = false) {
  const version = incrementVersion ? proposal.version + 1 : proposal.version;
  return {
    ...proposal,
    version,
    history: [
      ...(proposal.history || []),
      { id: uid(), version, action, detail, at: new Date().toISOString(), actor },
    ],
  };
}

export function approvalReference(proposal: Proposal) {
  return `APR-${proposal.proposalNumber.replace(/[^A-Z0-9]/gi, "")}-${String(proposal.version).padStart(2, "0")}`;
}

export function approvedSnapshotFor(proposal: Proposal): ApprovedSnapshot {
  if (!proposal.approval) throw new Error("Approval information is missing");
  return {
    version: proposal.version,
    proposalNumber: proposal.proposalNumber,
    documentType: proposal.documentType || "proposal",
    parentProposalNumber: proposal.parentProposalNumber,
    title: proposal.title,
    summary: proposal.summary,
    client: structuredClone(proposal.client),
    company: structuredClone(proposal.company),
    currency: proposal.currency,
    items: structuredClone(proposal.items.filter((item) => !item.optional || item.selected)),
    timeline: proposal.timeline,
    paymentSchedule: proposal.paymentSchedule,
    paymentInstructions: proposal.paymentInstructions,
    terms: proposal.terms,
    taxEnabled: proposal.taxEnabled,
    taxPercent: proposal.taxPercent,
    taxLabel: proposal.taxLabel,
    incentive: structuredClone(proposal.incentive),
    delivery: structuredClone(proposal.delivery || defaultDeliveryPlan(proposal.company)),
    approval: structuredClone(proposal.approval),
    approvedAt: proposal.approval.signedAt,
  };
}

export function createBackup(workspace: WorkspaceSettings, proposals: Proposal[]): ScopeFlowBackup {
  return {
    backupVersion: 2,
    product: "ScopeFlow",
    exportedAt: new Date().toISOString(),
    workspace: structuredClone(workspace),
    proposals: proposals.map((proposal) => normalizeProposal(structuredClone(proposal))),
  };
}

export function validateBackup(value: unknown): ScopeFlowBackup {
  if (!value || typeof value !== "object") throw new Error("This file is not a valid ScopeFlow backup.");
  const input = value as Partial<ScopeFlowBackup> & { exportedAt?: string; workspace?: WorkspaceSettings; proposals?: Proposal[] };
  if (!input.workspace || !Array.isArray(input.workspace.services) || !input.workspace.company) throw new Error("The backup does not contain valid business settings.");
  if (!Array.isArray(input.proposals)) throw new Error("The backup does not contain a valid proposal list.");
  return {
    backupVersion: Number(input.backupVersion || 1),
    product: "ScopeFlow",
    exportedAt: String(input.exportedAt || new Date().toISOString()),
    workspace: input.workspace,
    proposals: input.proposals.map((proposal) => normalizeProposal(proposal)),
  };
}
