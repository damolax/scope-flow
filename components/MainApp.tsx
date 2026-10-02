"use client";

import {
  AlertTriangle, Archive, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bell, BookOpen, CalendarDays,
  BriefcaseBusiness, Check, CheckCircle2, ChevronDown, CircleDollarSign,
  Clock3, Copy, Download, Eye, FileCheck2, FileClock, FilePlus2, FileText, FolderArchive,
  Gauge, Home, ImagePlus, Layers3, Link2, ListChecks, LockKeyhole, LogOut, Mail, Menu,
  Loader2, MoreHorizontal, PackagePlus, Pause, Pencil, Play, Plus, ReceiptText, RefreshCcw, RotateCcw, Save,
  Search, Send, Settings, ShieldCheck, Sparkles, Timer, Trash2, Upload, UploadCloud, UserRound, UserX, X,
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { backupRepository, cloudMode, proposalsRepository, workspaceRepository } from "@/lib/client-repository";
import { blankProposal, defaultWorkspace, itemFromService } from "@/lib/demo";
import {
  activeInvoices, addHistory, createBackup, currentUnitPrice, dateLabel, dateTimeLabel, deliveryUrgency,
  extendDelivery, invoiceByToken, isExpired, money, normalizeProposal, paidInvoiceAmount, pauseDelivery,
  paymentTriggerMet, remainingTimeLabel, remainingToInvoice, resumeDelivery, secondaryStatusLabel,
  startDelivery, statusLabel, totalsFor, uid, urgencyLabel,
} from "@/lib/helpers";
import {
  CurrencyCode, DeliveryPlan, InvoiceInfo, InvoiceKind, PriceFlexibility, PricingUnit, Proposal, ProposalItem,
  ScopeFlowBackup, ServiceCatalogItem, SessionUser, WorkspaceSettings,
} from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabase-browser";
import LoadingScreen from "./LoadingScreen";
import ScopeFlowMark from "./ScopeFlowMark";

type Page = "dashboard" | "proposals" | "services" | "settings";
type Toast = { tone: "success" | "error" | "info"; message: string } | null;
type InvoiceDraft = { proposal: Proposal; invoiceId?: string; amountDue: number; dueAt: string; note: string; kind: InvoiceKind };
type RestorePreview = { backup: ScopeFlowBackup; fileName: string } | null;

const nav = [
  { id: "dashboard" as const, label: "Dashboard", icon: Home },
  { id: "proposals" as const, label: "Proposals", icon: FileText },
  { id: "services" as const, label: "Services", icon: Layers3 },
  { id: "settings" as const, label: "Settings", icon: Settings },
];

const currencies: CurrencyCode[] = ["USD", "CAD", "EUR", "GBP", "NGN", "AUD", "NZD", "ZAR"];
const pricingUnits: Array<{ value: PricingUnit; label: string }> = [
  { value: "fixed", label: "Fixed" }, { value: "item", label: "Per item" },
  { value: "hour", label: "Hourly" }, { value: "day", label: "Daily" }, { value: "month", label: "Monthly" },
];
const flexibilityOptions: Array<{ value: PriceFlexibility; label: string; hint: string }> = [
  { value: "fixed", label: "Fixed", hint: "Lower offers are very unlikely" },
  { value: "slight", label: "Slightly flexible", hint: "Small reductions may work" },
  { value: "flexible", label: "Flexible", hint: "Open to reasonable offers" },
  { value: "custom", label: "Custom minimum", hint: "Set a hidden minimum price" },
];

function downloadBlob(content: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}

function googleCalendarUrl(proposal: Proposal) {
  const plan = proposal.delivery;
  if (!plan?.deadlineAt) return "";
  const deadline = new Date(plan.deadlineAt);
  const start = deadline.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const end = new Date(deadline.getTime() + 60 * 60 * 1000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const details = `Expected delivery for ${proposal.title}.\nAgreement: ${proposal.proposalNumber}\nCountdown started: ${plan.countdownStartedAt ? dateTimeLabel(plan.countdownStartedAt, plan.timezone) : "Not recorded"}\nView project: ${window.location.origin}/review/${proposal.publicToken}`;
  const params = new URLSearchParams({ action: "TEMPLATE", text: `${proposal.company.name} — ${proposal.title}`, dates: `${start}/${end}`, details });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function proposalSignature(proposal: Proposal) {
  const { updatedAt: _updatedAt, ...rest } = proposal;
  return JSON.stringify(rest);
}

function proposalReadiness(proposal: Proposal) {
  const totals = totalsFor(proposal);
  return [
    { label: "Client name and email", ok: Boolean(proposal.client.name.trim() && proposal.client.email.trim()) },
    { label: proposal.documentType === "change_order" ? "Additional-work title and explanation" : "Proposal title and introduction", ok: Boolean(proposal.title.trim() && proposal.summary.trim()) },
    { label: "At least one priced service", ok: proposal.items.length > 0 && proposal.items.some((item) => item.unitPrice > 0) },
    { label: "Final total is greater than zero", ok: totals.total > 0 },
    { label: "Timeline and payment schedule", ok: Boolean(proposal.timeline.trim() && proposal.paymentSchedule.trim()) },
    { label: "Terms and validity date", ok: Boolean(proposal.terms.trim() && proposal.validUntil) },
  ];
}

function documentKindLabel(proposal: Proposal) {
  return proposal.documentType === "change_order" ? "additional work order" : "proposal";
}

export default function MainApp() {
  const [page, setPage] = useState<Page>("dashboard");
  const [mobileNav, setMobileNav] = useState(false);
  const [cloud, setCloud] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceSettings>(defaultWorkspace);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [editor, setEditor] = useState<Proposal | null>(null);
  const [editorStep, setEditorStep] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [serviceEditor, setServiceEditor] = useState<ServiceCatalogItem | null>(null);
  const [invoiceEditor, setInvoiceEditor] = useState<InvoiceDraft | null>(null);
  const [restorePreview, setRestorePreview] = useState<RestorePreview>(null);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [, setClockTick] = useState(0);
  const lastSavedSignature = useRef("");
  const loadedEditorId = useRef("");

  useEffect(() => {
    let active = true;
    (async () => {
      const auth = await fetch("/api/auth/me", { cache: "no-store" });
      if (!auth.ok) { window.location.href = "/login"; return; }
      const authResult = await auth.json();
      if (active) setUser(authResult.user as SessionUser);
      const isCloud = await cloudMode();
      try {
        const [settings, records] = await Promise.all([workspaceRepository.get(isCloud), proposalsRepository.list(isCloud)]);
        if (!active) return;
        setCloud(isCloud); setWorkspace(settings); setProposals(records.map(normalizeProposal));
      } catch (error: any) {
        setToast({ tone: "error", message: error.message || "Could not load ScopeFlow" });
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!editor || editor.status === "approved") return;
    const signature = proposalSignature(editor);
    if (loadedEditorId.current !== editor.id) {
      loadedEditorId.current = editor.id;
      lastSavedSignature.current = signature;
      return;
    }
    if (signature === lastSavedSignature.current) return;
    const timer = setTimeout(async () => {
      setSaving(true);
      try {
        const saved = await proposalsRepository.save(editor, cloud);
        lastSavedSignature.current = proposalSignature(saved);
        setProposals((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
      } catch (error: any) {
        setToast({ tone: "error", message: error.message || "Autosave failed" });
      } finally { setSaving(false); }
    }, 900);
    return () => clearTimeout(timer);
  }, [editor, cloud]);

  const activeProposals = useMemo(() => proposals.filter((proposal) => !proposal.archived && !proposal.trashedAt), [proposals]);
  const attention = useMemo(() => activeProposals.filter((proposal) => {
    if (proposal.status === "needs_response") return true;
    if (proposal.status === "awaiting_client" && isExpired(proposal)) return true;
    if (proposal.status !== "approved") return false;
    if (proposal.delivery?.status === "changes_requested") return true;
    const invoices = activeInvoices(proposal);
    if (!invoices.length) return true;
    if (invoices.some((invoice) => invoice.status === "payment_reported")) return true;
    const urgency = deliveryUrgency(proposal.delivery, Date.now(), workspace.company.dueSoonHours || 72, workspace.company.almostDueHours || 12);
    return ["due_soon", "almost_due", "overdue"].includes(urgency);
  }), [activeProposals, workspace.company.dueSoonHours, workspace.company.almostDueHours]);
  const categories = useMemo(() => ["All", ...Array.from(new Set(workspace.services.map((service) => service.category).filter(Boolean)))], [workspace.services]);
  const clientSuggestions = useMemo(() => {
    const map = new Map<string, Proposal["client"]>();
    proposals.forEach((proposal) => { if (proposal.client.email) map.set(proposal.client.email.toLowerCase(), proposal.client); });
    return Array.from(map.values());
  }, [proposals]);

  const filteredProposals = useMemo(() => proposals.filter((proposal) => {
    const text = `${proposal.title} ${proposal.client.name} ${proposal.client.company} ${proposal.client.email} ${proposal.proposalNumber}`.toLowerCase();
    if (search && !text.includes(search.toLowerCase())) return false;
    if (statusFilter === "active") return !proposal.archived && !proposal.trashedAt && proposal.status !== "closed";
    if (statusFilter === "archived") return proposal.archived && !proposal.trashedAt;
    if (statusFilter === "trash") return Boolean(proposal.trashedAt);
    return !proposal.archived && !proposal.trashedAt && proposal.status === statusFilter;
  }), [proposals, search, statusFilter]);

  function show(message: string, tone: "success" | "error" | "info" = "success") { setToast({ tone, message }); }

  function openProposal(proposal: Proposal) {
    loadedEditorId.current = "";
    setEditor(structuredClone(proposal)); setEditorStep(1); setPage("proposals");
  }

  function nextProposalSequence() {
    const values = proposals.map((proposal) => Number(proposal.proposalNumber.match(/(\d+)$/)?.[1] || 0));
    return Math.max(1000, ...values) + 1;
  }

  function nextInvoiceSequence() {
    const values = proposals.flatMap((proposal) => activeInvoices(proposal).map((invoice) => Number(invoice.number.match(/(\d+)$/)?.[1] || 0)));
    return Math.max(0, ...values) + 1;
  }

  function createProposal() {
    const proposal = blankProposal(workspace, nextProposalSequence());
    loadedEditorId.current = "";
    setEditor(proposal); setEditorStep(1); setPage("proposals");
  }

  async function persistProposal(proposal: Proposal, message?: string) {
    setSaving(true);
    try {
      const saved = await proposalsRepository.save(proposal, cloud);
      lastSavedSignature.current = proposalSignature(saved);
      setProposals((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
      setEditor(saved);
      if (message) show(message);
      return saved;
    } catch (error: any) {
      show(error.message || "Could not save proposal", "error");
      return null;
    } finally { setSaving(false); }
  }

  async function sendProposal() {
    if (!editor) return;
    const incomplete = proposalReadiness(editor).filter((check) => !check.ok);
    if (incomplete.length) {
      show(`Complete before sending: ${incomplete.map((check) => check.label).join(", ")}.`, "error");
      setEditorStep(4);
      return;
    }
    const kind = documentKindLabel(editor);
    let next = addHistory(
      editor,
      editor.sentAt ? `${kind} resent` : `${kind} sent`,
      `Version ${editor.version + 1} sent to ${editor.client.email}.`,
      "owner",
      true,
    );
    next = { ...next, status: "awaiting_client", responseState: "sent", sentAt: new Date().toISOString(), archived: false };
    const saved = await persistProposal(next, `${kind[0].toUpperCase()}${kind.slice(1)} is ready to share`);
    if (saved) await copyClientLink(saved);
  }

  async function copyClientLink(proposal: Proposal) {
    const link = `${window.location.origin}/review/${proposal.publicToken}`;
    try { await navigator.clipboard.writeText(link); show(`Secure ${documentKindLabel(proposal)} link copied`); }
    catch { window.prompt("Copy this client link", link); }
  }

  async function copyInvoiceLink(proposal: Proposal, invoice?: InvoiceInfo) {
    const selected = invoice || activeInvoices(proposal)[0];
    if (!selected) return;
    const link = `${window.location.origin}/invoice/${selected.publicToken}`;
    try { await navigator.clipboard.writeText(link); show("Secure invoice link copied"); }
    catch { window.prompt("Copy this invoice link", link); }
  }

  async function notifyClient(proposal: Proposal, event: string, invoice?: InvoiceInfo, note?: string, openFallback = false) {
    if (!cloud) {
      const subject = encodeURIComponent(event === "invoice_ready" ? `Invoice ${invoice?.number || ""} from ${proposal.company.name}` : `${proposal.title} — ${event.replaceAll("_", " ")}`);
      const link = invoice ? `${window.location.origin}/invoice/${invoice.publicToken}` : `${window.location.origin}/review/${proposal.publicToken}`;
      const body = encodeURIComponent(`${proposal.client.name || "Hello"},

${note || "An update is available for your project."}

Open it here: ${link}

${proposal.company.name}`);
      const mailto = `mailto:${proposal.client.email}?subject=${subject}&body=${body}`;
      show("Saved. Opening your email app.", "info");
      if (openFallback) window.location.href = mailto;
      return { configured: false, sent: false, mailto };
    }
    try {
      const response = await fetch(`/api/proposals/${proposal.id}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, invoiceToken: invoice?.publicToken, note }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not prepare email");
      if (result.sent) show("Email sent to client");
      else if (!result.configured) {
        show("Saved. Email delivery is not configured; opening your email app.", "info");
        if (openFallback && result.mailto) window.location.href = result.mailto;
      } else show(result.error || "Email could not be sent", "error");
      return result;
    } catch (error: any) {
      show(error.message || "Email could not be sent", "error");
      return null;
    }
  }

  function emailProposal(proposal: Proposal) { void notifyClient(proposal, "proposal_sent", undefined, undefined, true); }
  function emailInvoice(proposal: Proposal, invoice?: InvoiceInfo) { const selected = invoice || activeInvoices(proposal)[0]; if (selected) void notifyClient(proposal, "invoice_ready", selected, undefined, true); }
  function remindClient(proposal: Proposal, invoice?: InvoiceInfo) {
    const note = window.prompt("Optional reminder note", invoice ? `A reminder that invoice ${invoice.number} is available.` : "A reminder that your proposal is ready to review.") || undefined;
    void notifyClient(proposal, "reminder", invoice, note, true);
  }

  function previewClient(proposal: Proposal) {
    window.open(`/review/${proposal.publicToken}?preview=1`, "_blank", "noopener,noreferrer");
  }

  async function duplicateProposal(source: Proposal) {
    const created = new Date().toISOString();
    const copy: Proposal = {
      ...structuredClone(source), id: uid(), publicToken: uid(), proposalNumber: `${workspace.company.proposalPrefix}-${nextProposalSequence()}`,
      title: `${source.title} copy`, status: "draft", responseState: "none", archived: false, approval: undefined,
      priceRequest: undefined, invoice: undefined, invoices: [], approvedSnapshot: undefined, clientNote: "", ownerResponseNote: "",
      delivery: { ...(source.delivery || blankProposal(workspace).delivery!), status: "awaiting_payment", paymentConfirmedAt: undefined, countdownStartedAt: undefined, deadlineAt: undefined, pausedAt: undefined, pausedRemainingMs: undefined, pauseReason: undefined, deliveredAt: undefined, completedAt: undefined, completedItemIds: [], submissionNote: undefined, submittedAt: undefined, clientReviewNote: undefined, changesRequestedAt: undefined, acceptedAt: undefined, acceptedBy: undefined, acceptedEmail: undefined },
      version: 1, history: [{ id: uid(), version: 1, action: "Proposal duplicated", detail: `Created from ${source.proposalNumber}.`, at: created, actor: "owner" }],
      createdAt: created, updatedAt: created, sentAt: undefined, firstViewedAt: undefined, lastViewedAt: undefined, viewCount: 0,
      items: source.items.map((item) => ({ ...item, id: uid(), clientOfferUnitPrice: undefined, ownerCounterUnitPrice: undefined, acceptedUnitPrice: undefined, acceptanceProbability: undefined })),
    };
    const saved = await persistProposal(copy, "Proposal duplicated");
    if (saved) openProposal(saved);
  }

  async function createAdditionalWorkOrder(source: Proposal) {
    if (source.status !== "approved") return;
    const created = new Date().toISOString();
    const base = blankProposal(workspace, nextProposalSequence());
    const changeOrder: Proposal = {
      ...base,
      proposalNumber: `${workspace.company.changeOrderPrefix || "CHG"}-${nextProposalSequence()}`,
      documentType: "change_order",
      parentProposalId: source.id,
      parentProposalNumber: source.proposalNumber,
      title: `Additional work for ${source.title}`,
      summary: `This additional work order covers new scope requested after approval of ${source.proposalNumber}. The original approved agreement remains unchanged.`,
      client: structuredClone(source.client),
      company: structuredClone(source.company),
      currency: source.currency,
      items: [{
        id: uid(),
        title: "Additional service",
        description: "Describe the additional work and the result it will deliver.",
        quantity: 1,
        unitPrice: 0,
        pricingUnit: "fixed",
        optional: false,
        recommended: false,
        selected: true,
        flexibility: "fixed",
        clientCanRequestPrice: true,
        clientCanChangeQuantity: false,
      }],
      incentive: { ...base.incentive, enabled: false },
      terms: source.terms,
      paymentInstructions: source.paymentInstructions,
      timeline: "Delivery timing for this additional work will be confirmed after approval.",
      paymentSchedule: "Payment schedule for this additional work will be confirmed before work begins.",
      history: [{ id: uid(), version: 1, action: "Additional work order created", detail: `Created from approved agreement ${source.proposalNumber}.`, at: created, actor: "owner" }],
      createdAt: created,
      updatedAt: created,
    };
    const saved = await persistProposal(changeOrder, "Additional work order created");
    if (saved) openProposal(saved);
  }

  async function archiveProposal(proposal: Proposal) {
    const next = addHistory({ ...proposal, archived: true, status: proposal.status === "approved" ? "approved" : "closed", responseState: "archived" }, "Proposal archived", "Removed from the active proposal list.", "owner");
    await persistProposal(next, "Proposal archived");
    setEditor(null);
  }

  async function restoreProposal(proposal: Proposal) {
    const next = addHistory({ ...proposal, archived: false, trashedAt: undefined, status: proposal.approvedSnapshot ? "approved" : proposal.sentAt ? "awaiting_client" : "draft", responseState: proposal.sentAt ? "sent" : "none" }, "Proposal restored", "Returned to the active proposal list.", "owner");
    await persistProposal(next, "Proposal restored");
  }

  async function deleteDraft(proposal: Proposal) {
    if (!confirm("Move this draft to Trash? You can restore it later.")) return;
    const next = addHistory({ ...proposal, trashedAt: new Date().toISOString(), archived: false }, "Draft moved to Trash", "Draft can be restored from the Trash filter.", "owner");
    await persistProposal(next, "Draft moved to Trash");
    setEditor(null);
  }

  async function permanentlyDeleteDraft(proposal: Proposal) {
    if (!proposal.trashedAt || proposal.status !== "draft") return;
    if (!confirm("Permanently delete this draft? This cannot be undone.")) return;
    try {
      await proposalsRepository.remove(proposal.id, cloud);
      setProposals((items) => items.filter((item) => item.id !== proposal.id));
      show("Draft permanently deleted");
    } catch (error: any) { show(error.message || "Could not delete draft", "error"); }
  }

  async function extendProposal(proposal: Proposal) {
    const date = new Date(); date.setDate(date.getDate() + 7);
    const next = addHistory({ ...proposal, validUntil: date.toISOString().slice(0, 10), status: "awaiting_client", responseState: "sent" }, "Proposal extended", "Validity extended for seven days.", "owner", true);
    await persistProposal(next, "Proposal extended for 7 days");
  }

  async function ownerRespond(kind: "accept" | "counter" | "decline") {
    if (!editor) return;
    let next = structuredClone(editor);
    if (kind === "accept") {
      next.items = next.items.map((item) => ({ ...item, acceptedUnitPrice: item.clientOfferUnitPrice ?? currentUnitPrice(item), ownerCounterUnitPrice: undefined, clientOfferUnitPrice: undefined }));
      next = addHistory(next, "Client request accepted", "The requested scope and prices were accepted. Client confirmation is required.", "owner", true);
      next.responseState = "request_accepted";
    } else if (kind === "counter") {
      next.items = next.items.map((item) => ({ ...item, ownerCounterUnitPrice: item.ownerCounterUnitPrice ?? item.clientOfferUnitPrice ?? currentUnitPrice(item), clientOfferUnitPrice: undefined }));
      next = addHistory(next, "Counteroffer sent", next.ownerResponseNote || "A revised price was sent for client confirmation.", "owner", true);
      next.responseState = "counteroffer";
    } else {
      next.items = next.items.map((item) => ({ ...item, clientOfferUnitPrice: undefined, ownerCounterUnitPrice: undefined, acceptanceProbability: undefined }));
      next = addHistory(next, "Client request declined", next.ownerResponseNote || "The original offer remains available.", "owner", true);
      next.responseState = "request_declined";
    }
    next.status = "awaiting_client";
    next.priceRequest = undefined;
    await persistProposal(next, kind === "accept" ? "Request accepted and returned to client" : kind === "counter" ? "Counteroffer returned to client" : "Request declined and client notified in the proposal");
  }

  function createInvoice(proposal: Proposal, invoice?: InvoiceInfo) {
    const approvedTotal = totalsFor(proposal.approvedSnapshot || proposal).total;
    const due = new Date(); due.setDate(due.getDate() + 7);
    const remaining = remainingToInvoice(proposal);
    setInvoiceEditor({
      proposal,
      invoiceId: invoice?.id,
      amountDue: invoice?.amountDue ?? (remaining > 0 ? remaining : approvedTotal),
      dueAt: invoice?.dueAt || due.toISOString().slice(0, 10),
      note: invoice?.note || "",
      kind: invoice?.kind || (activeInvoices(proposal).length ? "milestone" : "full"),
    });
  }

  async function saveInvoiceDocument(draft: InvoiceDraft) {
    const proposal = normalizeProposal(proposals.find((item) => item.id === draft.proposal.id) || draft.proposal);
    const approvedTotal = totalsFor(proposal.approvedSnapshot || proposal).total;
    const existing = draft.invoiceId ? proposal.invoices!.find((item) => item.id === draft.invoiceId) : undefined;
    const otherTotal = proposal.invoices!.filter((item) => item.id !== draft.invoiceId && item.status !== "cancelled").reduce((sum, item) => sum + item.amountDue, 0);
    const maximum = Math.max(0, approvedTotal - otherTotal);
    const amountDue = Math.max(0, Math.min(maximum || approvedTotal, Number(draft.amountDue) || maximum || approvedTotal));
    const now = new Date().toISOString();
    const invoice: InvoiceInfo = {
      id: existing?.id || uid(),
      publicToken: existing?.publicToken || uid(),
      number: existing?.number || `${workspace.company.invoicePrefix}-${new Date().getFullYear()}-${String(nextInvoiceSequence()).padStart(4, "0")}`,
      kind: draft.kind,
      issuedAt: existing?.issuedAt || now,
      dueAt: draft.dueAt,
      amountDue,
      status: existing?.status || "unpaid",
      note: draft.note.trim(),
      archived: existing?.archived || false,
      linkEnabled: existing?.linkEnabled !== false,
      firstViewedAt: existing?.firstViewedAt,
      lastViewedAt: existing?.lastViewedAt,
      viewCount: existing?.viewCount || 0,
      paymentReportedAt: existing?.paymentReportedAt,
      paymentReportedBy: existing?.paymentReportedBy,
      paymentReportedEmail: existing?.paymentReportedEmail,
      paidAt: existing?.paidAt,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    const invoices = existing ? proposal.invoices!.map((item) => item.id === invoice.id ? invoice : item) : [...proposal.invoices!, invoice];
    const next = addHistory({ ...proposal, invoices }, existing ? "Invoice document updated" : "Invoice document created", `${invoice.number} · ${money(amountDue, proposal.currency)} due.`, "owner");
    const saved = await persistProposal(next, existing ? "Invoice updated — ready to share" : "Invoice created — ready to share");
    if (saved) { setInvoiceEditor(null); await copyInvoiceLink(saved, invoice); }
  }

  async function updateInvoice(proposalInput: Proposal, invoiceId: string, patch: Partial<InvoiceInfo>, message: string) {
    const proposal = normalizeProposal(proposalInput);
    const now = new Date().toISOString();
    const invoices = proposal.invoices!.map((invoice) => invoice.id === invoiceId ? { ...invoice, ...patch, updatedAt: now } : invoice);
    const selected = invoices.find((invoice) => invoice.id === invoiceId);
    const next = addHistory({ ...proposal, invoices }, message, selected ? `${selected.number} updated.` : "Invoice updated.", "owner");
    return persistProposal(next, message);
  }

  async function markInvoicePaid(proposalInput: Proposal, invoice: InvoiceInfo) {
    const proposal = normalizeProposal(proposalInput);
    const markingPaid = invoice.status !== "paid";
    const now = new Date().toISOString();
    let next: Proposal = {
      ...proposal,
      invoices: proposal.invoices!.map((item) => item.id === invoice.id ? { ...item, status: markingPaid ? "paid" : "unpaid", paidAt: markingPaid ? now : undefined, updatedAt: now } : item),
    };
    next = addHistory(next, markingPaid ? "Invoice marked paid" : "Invoice marked unpaid", `${invoice.number} payment status updated manually.`, "owner");
    if (markingPaid) {
      next.delivery = { ...(next.delivery || blankProposal(workspace).delivery!), paymentConfirmedAt: next.delivery?.paymentConfirmedAt || now };
      if (paymentTriggerMet(next)) {
        next.delivery = next.delivery!.autoStartOnPayment ? startDelivery(next.delivery!, now, "in_progress") : { ...next.delivery!, status: "scheduled" };
        next = addHistory(next, next.delivery.status === "in_progress" ? "Delivery countdown started" : "Project scheduled", `${next.delivery.duration} ${next.delivery.dayMode === "business_days" ? "business" : "calendar"} days.`, "system");
      }
    }
    const saved = await persistProposal(next, markingPaid ? "Payment confirmed" : "Invoice marked unpaid");
    if (saved && markingPaid) await notifyClient(saved, "payment_confirmed", invoice, undefined, true);
  }

  async function archiveInvoice(proposal: Proposal, invoice: InvoiceInfo, disableLink = false) {
    await updateInvoice(proposal, invoice.id, { archived: true, linkEnabled: disableLink ? false : invoice.linkEnabled !== false }, "Invoice archived");
  }

  async function restoreInvoice(proposal: Proposal, invoice: InvoiceInfo) {
    await updateInvoice(proposal, invoice.id, { archived: false, linkEnabled: true }, "Invoice restored");
  }

  async function reportProjectAction(proposalInput: Proposal, action: "start" | "pause" | "resume" | "extend" | "toggle_item" | "submit", value?: string | number) {
    let proposal = normalizeProposal(proposalInput);
    const now = new Date().toISOString();
    let event = "";
    let historyAction = "Project updated";
    let historyDetail = String(value || "Project status updated.");

    if (action === "start") {
      proposal.delivery = startDelivery(proposal.delivery!, now, "in_progress");
      event = "project_started";
      historyAction = "Project started";
    }
    if (action === "pause") {
      proposal.delivery = pauseDelivery(proposal.delivery!, String(value || "Waiting for client information"), now);
      event = "project_paused";
      historyAction = "Countdown paused";
    }
    if (action === "resume") {
      proposal.delivery = resumeDelivery(proposal.delivery!, now);
      event = "project_resumed";
      historyAction = "Countdown resumed";
    }
    if (action === "extend") {
      proposal.delivery = extendDelivery(proposal.delivery!, Number(value || 1), now);
      event = "schedule_updated";
      historyAction = "Delivery extended";
    }
    if (action === "toggle_item") {
      const itemId = String(value || "");
      const completed = new Set(proposal.delivery?.completedItemIds || []);
      if (completed.has(itemId)) completed.delete(itemId); else completed.add(itemId);
      proposal.delivery = { ...proposal.delivery!, completedItemIds: Array.from(completed) };
      historyAction = completed.has(itemId) ? "Service marked done" : "Service reopened";
      const service = (proposal.approvedSnapshot?.items || proposal.items).find((item) => item.id === itemId);
      historyDetail = service?.title || "Project service";
    }
    if (action === "submit") {
      const orderedItems = proposal.approvedSnapshot?.items || proposal.items.filter((item) => !item.optional || item.selected);
      const completed = new Set(proposal.delivery?.completedItemIds || []);
      if (!orderedItems.length || orderedItems.some((item) => !completed.has(item.id))) {
        show("Mark every ordered service as done before submitting the project.", "error");
        return;
      }
      const note = String(value || "").trim();
      if (!note) {
        show("Add a delivery note before submitting the project.", "error");
        return;
      }
      proposal.delivery = {
        ...proposal.delivery!,
        status: "delivered",
        deliveredAt: now,
        submittedAt: now,
        submissionNote: note,
        clientReviewNote: undefined,
        changesRequestedAt: undefined,
      };
      event = "delivered";
      historyAction = "Project submitted";
      historyDetail = note;
    }

    proposal = addHistory(proposal, historyAction, historyDetail, "owner");
    const saved = await persistProposal(proposal, action === "submit" ? "Project submitted to client" : "Project updated");
    if (saved && event) await notifyClient(saved, event, undefined, typeof value === "string" ? value : undefined, true);
  }

  async function saveWorkspace(settings = workspace, message = "Settings saved") {
    setSaving(true);
    try {
      const saved = await workspaceRepository.save(settings, cloud);
      setWorkspace(saved); show(message);
    } catch (error: any) { show(error.message || "Could not save settings", "error"); }
    finally { setSaving(false); }
  }

  function saveService(service: ServiceCatalogItem) {
    const now = new Date().toISOString();
    const exists = workspace.services.some((item) => item.id === service.id);
    const saved = { ...service, updatedAt: now, createdAt: service.createdAt || now };
    const settings = { ...workspace, services: exists ? workspace.services.map((item) => item.id === saved.id ? saved : item) : [saved, ...workspace.services] };
    setWorkspace(settings); setServiceEditor(null); void saveWorkspace(settings, exists ? "Service updated" : "Service added");
  }

  function newService(): ServiceCatalogItem {
    const now = new Date().toISOString();
    return { id: uid(), title: "", description: "", category: "General", defaultUnitPrice: 0, defaultQuantity: 1, pricingUnit: "fixed", defaultOptional: false, recommended: false, flexibility: "fixed", minimumUnitPrice: undefined, clientCanRequestPrice: true, clientCanChangeQuantity: false, active: true, createdAt: now, updatedAt: now };
  }

  async function logout() {
    try { await supabaseBrowser().auth.signOut(); } catch {}
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  function exportData() {
    downloadBlob(JSON.stringify(createBackup(workspace, proposals), null, 2), `scopeflow-backup-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
    show("Account backup downloaded");
  }

  async function selectBackupFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json") || file.size > 20_000_000) { show("Choose a ScopeFlow JSON backup smaller than 20 MB", "error"); return; }
    try {
      const raw = JSON.parse(await file.text());
      const backup = raw as ScopeFlowBackup;
      if (!backup.workspace?.company || !Array.isArray(backup.workspace?.services) || !Array.isArray(backup.proposals)) throw new Error("This file is not a valid ScopeFlow backup.");
      setRestorePreview({ backup, fileName: file.name });
    } catch (error: any) { show(error.message || "Could not read backup", "error"); }
  }

  async function restoreBackup(mode: "merge" | "replace") {
    if (!restorePreview) return;
    if (mode === "replace") {
      const answer = window.prompt("This replaces the current workspace. Type RESTORE to continue.");
      if (answer !== "RESTORE") return;
      downloadBlob(JSON.stringify(createBackup(workspace, proposals), null, 2), `scopeflow-safety-backup-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
    }
    setSaving(true);
    try {
      const restored = await backupRepository.restore(restorePreview.backup, mode, cloud);
      setWorkspace(restored.settings);
      setProposals(restored.proposals.map(normalizeProposal));
      setRestorePreview(null);
      show(`${mode === "merge" ? "Backup merged" : "Workspace restored"}: ${restored.result.proposalsAdded} proposals added, ${restored.result.proposalsUpdated} updated.`);
    } catch (error: any) { show(error.message || "Backup restore failed", "error"); }
    finally { setSaving(false); }
  }

  async function deleteAccount() {
    if (!user || user.isAdmin) return;
    if (deleteConfirmation.trim().toLowerCase() !== user.email.toLowerCase()) {
      show("Enter your account email exactly to confirm deletion.", "error");
      return;
    }
    setDeletingAccount(true);
    try {
      downloadBlob(JSON.stringify(createBackup(workspace, proposals), null, 2), `scopeflow-final-backup-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: deleteConfirmation }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not delete the account.");
      try { await supabaseBrowser().auth.signOut(); } catch {}
      window.location.href = "/login?account=deleted";
    } catch (error: any) {
      show(error.message || "Could not delete the account", "error");
      setDeletingAccount(false);
    }
  }

  function updateCompany<K extends keyof WorkspaceSettings["company"]>(key: K, value: WorkspaceSettings["company"][K]) {
    setWorkspace((current) => ({ ...current, company: { ...current.company, [key]: value } }));
  }

  async function uploadLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.match(/^image\/(png|jpeg|webp)$/)) { show("Use a PNG, JPG or WebP logo", "error"); return; }
    if (file.size > 900_000) { show("Use a logo smaller than 900 KB", "error"); return; }
    const reader = new FileReader();
    reader.onload = () => updateCompany("logoDataUrl", String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  if (loading) return <LoadingScreen title="Opening ScopeFlow" text="Loading your business workspace…" />;

  return (
    <div className="app-shell" style={{ "--accent": workspace.company.accent } as React.CSSProperties}>
      {toast && <div className={`toast ${toast.tone}`}>{toast.tone === "success" ? <CheckCircle2 size={18} /> : toast.tone === "error" ? <X size={18} /> : <Bell size={18} />}<span>{toast.message}</span></div>}
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="sidebar-brand"><div className="brand-orb">{workspace.company.logoDataUrl ? <img src={workspace.company.logoDataUrl} alt="" /> : <ScopeFlowMark size={21} />}</div><div><strong>ScopeFlow</strong><span>{workspace.company.name}</span></div><button className="mobile-close" aria-label="Close navigation" onClick={() => setMobileNav(false)}><X size={18} /></button></div>
        <nav>{nav.map((item) => <button key={item.id} className={page === item.id && !editor ? "active" : ""} onClick={() => { setPage(item.id); setEditor(null); setMobileNav(false); }}><item.icon size={18} /><span>{item.label}</span>{item.id === "dashboard" && attention.length > 0 && <em>{attention.length}</em>}</button>)}</nav>
        <div className="sidebar-bottom">
          <div className="sidebar-account"><span>{user?.name?.slice(0, 1).toUpperCase() || "U"}</span><div><strong>{user?.name || "Account"}</strong><small>{user?.email || ""}</small></div></div>
          {user?.isAdmin && <a className="sidebar-admin-link" href="/admin"><ShieldCheck size={18} /><span>Platform admin</span></a>}
          {!cloud && <div className="demo-pill"><Gauge size={15} /><span>Cloud unavailable</span></div>}
          <button onClick={logout}><LogOut size={18} /><span>Sign out</span></button>
        </div>
      </aside>

      <main className="workspace-main">
        {!editor && <header className="topbar"><button className="menu-button" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={20} /></button><div><span>{nav.find((item) => item.id === page)?.label}</span><strong>{page === "dashboard" ? `Welcome to ${workspace.company.name}` : page === "proposals" ? "Create, send and approve offers" : page === "services" ? "Your reusable service library" : "Business and document defaults"}</strong></div><div className="top-actions">{saving && <span className="saving"><RefreshCcw size={14} /> Saving…</span>}<button className="primary compact" onClick={createProposal}><Plus size={17} /><span>New proposal</span></button></div></header>}

        {editor ? (
          <ProposalEditor
            proposal={editor} setProposal={setEditor} step={editorStep} setStep={setEditorStep}
            workspace={workspace} clientSuggestions={clientSuggestions} onBack={() => setEditor(null)}
            onSend={sendProposal} onCopy={() => copyClientLink(editor)} onPreview={() => previewClient(editor)}
            onDuplicate={() => duplicateProposal(editor)} onArchive={() => archiveProposal(editor)} onDelete={() => deleteDraft(editor)}
            onOwnerRespond={ownerRespond} onExtend={() => extendProposal(editor)} onCreateInvoice={() => createInvoice(editor)}
            onMarkPaid={(invoice: InvoiceInfo) => markInvoicePaid(editor, invoice)} onCopyInvoice={(invoice: InvoiceInfo) => copyInvoiceLink(editor, invoice)}
            onEmailInvoice={(invoice: InvoiceInfo) => emailInvoice(editor, invoice)} onEmailProposal={() => emailProposal(editor)}
            onReminder={(invoice?: InvoiceInfo) => remindClient(editor, invoice)}
            onCreateChangeOrder={() => createAdditionalWorkOrder(editor)} onEditInvoice={(invoice: InvoiceInfo) => createInvoice(editor, invoice)}
            onArchiveInvoice={(invoice: InvoiceInfo, disableLink?: boolean) => archiveInvoice(editor, invoice, disableLink)}
            onRestoreInvoice={(invoice: InvoiceInfo) => restoreInvoice(editor, invoice)} onProjectAction={(action: any, value?: any) => reportProjectAction(editor, action, value)} saving={saving}
          />
        ) : page === "dashboard" ? (
          <Dashboard proposals={activeProposals} attention={attention} openProposal={openProposal} createProposal={createProposal} company={workspace.company} />
        ) : page === "proposals" ? (
          <ProposalsPage proposals={filteredProposals} search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter} openProposal={openProposal} createProposal={createProposal} onCopy={copyClientLink} onDuplicate={duplicateProposal} onCopyInvoice={copyInvoiceLink} onRestore={restoreProposal} onDelete={permanentlyDeleteDraft} />
        ) : page === "services" ? (
          <ServicesPage services={workspace.services} currency={workspace.company.currency} categories={categories} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} onEdit={(service: ServiceCatalogItem) => setServiceEditor(structuredClone(service))} onNew={() => setServiceEditor(newService())} />
        ) : (
          <SettingsPage workspace={workspace} setWorkspace={setWorkspace} updateCompany={updateCompany} uploadLogo={uploadLogo} save={() => saveWorkspace()} exportData={exportData} selectBackupFile={selectBackupFile} saving={saving} user={user} onDeleteAccount={() => { setDeleteConfirmation(""); setDeleteAccountOpen(true); }} />
        )}
      </main>

      {serviceEditor && <ServiceModal service={serviceEditor} setService={setServiceEditor} onClose={() => setServiceEditor(null)} onSave={saveService} />}
      {invoiceEditor && <InvoiceModal draft={invoiceEditor} setDraft={setInvoiceEditor} onClose={() => setInvoiceEditor(null)} onSave={saveInvoiceDocument} />}
      {restorePreview && <RestoreModal preview={restorePreview} onClose={() => setRestorePreview(null)} onRestore={restoreBackup} saving={saving} />}
      {deleteAccountOpen && user && <DeleteAccountModal user={user} confirmation={deleteConfirmation} setConfirmation={setDeleteConfirmation} deleting={deletingAccount} onClose={() => !deletingAccount && setDeleteAccountOpen(false)} onDelete={deleteAccount} />}
    </div>
  );
}

function Dashboard({ proposals, attention, openProposal, createProposal, company }: { proposals: Proposal[]; attention: Proposal[]; openProposal: (p: Proposal) => void; createProposal: () => void; company: WorkspaceSettings["company"] }) {
  const awaiting = proposals.filter((p) => p.status === "awaiting_client").length;
  const approved = proposals.filter((p) => p.status === "approved").length;
  const drafts = proposals.filter((p) => p.status === "draft").length;
  const approvedValue = proposals.filter((p) => p.status === "approved").reduce((sum, p) => sum + totalsFor(p.approvedSnapshot || p).total, 0);
  const currentProjects = proposals
    .filter((proposal) => proposal.status === "approved" && proposal.delivery?.enabled && !["accepted", "completed"].includes(proposal.delivery.status))
    .sort((a, b) => new Date(a.delivery?.deadlineAt || "9999-12-31").getTime() - new Date(b.delivery?.deadlineAt || "9999-12-31").getTime());
  return <div className="page-content">
    <section className="hero-strip"><div><span className="eyebrow">Proposal and delivery workspace</span><h1>Move every client from offer to delivery.</h1><p>Create a clear proposal, lock the agreement, issue invoices and track the delivery countdown after payment is confirmed.</p></div><button className="primary" onClick={createProposal}><FilePlus2 size={19} /> Create proposal</button></section>
    <section className="metrics-grid">
      <Metric label="Needs attention" value={attention.length} icon={Bell} note="Requests, payments and expired offers" />
      <Metric label="Awaiting clients" value={awaiting} icon={Clock3} note="Sent, viewed or countered" />
      <Metric label="Approved" value={approved} icon={FileCheck2} note={`${money(approvedValue, proposals[0]?.currency || company.currency)} approved`} />
      <Metric label="Drafts" value={drafts} icon={Pencil} note="Autosaved work in progress" />
    </section>
    <div className="dashboard-grid">
      <section className="panel attention-panel"><div className="panel-heading"><div><span className="eyebrow">Act next</span><h2>Needs your attention</h2></div><span className="count-badge">{attention.length}</span></div>{attention.length ? <div className="attention-list">{attention.slice(0, 6).map((proposal) => <button key={proposal.id} onClick={() => openProposal(proposal)}><span className={`status-dot ${proposal.status}`} /><span><strong>{proposal.title}</strong><small>{proposal.client.company || proposal.client.name} · {proposal.status === "needs_response" ? secondaryStatusLabel(proposal) : proposal.status === "approved" ? secondaryStatusLabel(proposal) : "Proposal expired"}</small></span><ArrowRight size={18} /></button>)}</div> : <Empty icon={CheckCircle2} title="You are up to date" text="New requests, payment reports and approvals will appear here." />}</section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">Delivery</span><h2>Current projects</h2></div><span className="count-badge">{currentProjects.length}</span></div>{currentProjects.length ? <div className="project-list">{currentProjects.slice(0, 7).map((proposal) => { const urgency = deliveryUrgency(proposal.delivery, Date.now(), company.dueSoonHours || 72, company.almostDueHours || 12); return <button key={proposal.id} onClick={() => openProposal(proposal)}><span className={`project-urgency ${urgency}`}><Timer size={17} /></span><span><strong>{proposal.title}</strong><small>{proposal.client.company || proposal.client.name} · {urgencyLabel(urgency)}</small></span><b>{remainingTimeLabel(proposal.delivery)}</b></button>; })}</div> : <Empty icon={Timer} title="No active countdowns" text="A project appears here after payment is confirmed and its delivery timer starts." />}</section>
    </div>
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">Latest</span><h2>Recent proposals</h2></div></div>{proposals.length ? <div className="recent-list">{proposals.slice(0, 8).map((proposal) => <button key={proposal.id} onClick={() => openProposal(proposal)}><div><strong>{proposal.title}</strong><small>{proposal.client.company || proposal.client.name || "Client not added"}</small></div><div><span className={`status-chip ${proposal.status}`}>{statusLabel(proposal)}</span><small>{dateLabel(proposal.updatedAt)}</small></div></button>)}</div> : <Empty icon={FilePlus2} title="Create your first proposal" text="Add services, preview the client experience and share a secure link." action="Create proposal" onAction={createProposal} />}</section>
  </div>;
}

function Metric({ label, value, note, icon: Icon }: { label: string; value: number; note: string; icon: typeof Bell }) {
  return <div className="metric-card"><div className="metric-icon"><Icon size={19} /></div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

function ProposalsPage({ proposals, search, setSearch, statusFilter, setStatusFilter, openProposal, createProposal, onCopy, onDuplicate, onCopyInvoice, onRestore, onDelete }: any) {
  return <div className="page-content"><div className="page-heading"><div><span className="eyebrow">All client work</span><h1>Proposals</h1><p>Draft, send, approve, archive and restore proposals from one place.</p></div><button className="primary" onClick={createProposal}><Plus size={18} /> New proposal</button></div>
    <div className="list-toolbar"><label className="search-field"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search client or proposal" /></label><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="active">Active proposals</option><option value="draft">Drafts</option><option value="awaiting_client">Awaiting client</option><option value="needs_response">Needs response</option><option value="approved">Approved</option><option value="closed">Closed</option><option value="archived">Archived</option><option value="trash">Trash</option></select></div>
    <section className="proposal-table panel">{proposals.length ? <><div className="proposal-table-head"><span>Proposal</span><span>Status</span><span>Value</span><span>Actions</span></div>{proposals.map((proposal: Proposal) => { const totals = totalsFor(proposal.approvedSnapshot || proposal); const invoices = activeInvoices(proposal); return <div className="proposal-row" key={proposal.id}><button className="proposal-main" onClick={() => openProposal(proposal)}><span className={`proposal-icon ${proposal.status}`}><FileText size={19} /></span><span><strong>{proposal.title}</strong><small>{proposal.proposalNumber} · {proposal.client.company || proposal.client.name || "No client yet"}</small></span></button><div className="proposal-status"><span className={`status-chip ${proposal.status}`}>{statusLabel(proposal)}</span><small>{secondaryStatusLabel(proposal)}</small></div><div className="proposal-value"><strong>{money(totals.total, proposal.currency)}</strong><small>{invoices.length ? `${invoices.length} invoice${invoices.length === 1 ? "" : "s"}` : `Updated ${dateLabel(proposal.updatedAt)}`}</small></div><div className="row-actions">{proposal.archived || proposal.trashedAt ? <><button title="Restore" onClick={() => onRestore(proposal)}><RotateCcw size={16} /></button>{proposal.trashedAt && <button title="Delete permanently" onClick={() => onDelete(proposal)}><Trash2 size={16} /></button>}</> : <>{invoices[0] && <button title="Copy latest invoice link" onClick={() => onCopyInvoice(proposal, invoices[0])}><ReceiptText size={16} /></button>}<button title="Copy proposal link" onClick={() => onCopy(proposal)}><Copy size={16} /></button><button title="Duplicate" onClick={() => onDuplicate(proposal)}><FilePlus2 size={16} /></button><button title="Open" onClick={() => openProposal(proposal)}><ArrowRight size={17} /></button></>}</div></div>; })}</> : <Empty icon={Search} title="No matching proposals" text="Try another search or create a new proposal." action="Create proposal" onAction={createProposal} />}</section>
  </div>;
}

function ServicesPage({ services, currency, categories, categoryFilter, setCategoryFilter, onEdit, onNew }: any) {
  const visible = services.filter((service: ServiceCatalogItem) => categoryFilter === "All" || service.category === categoryFilter);
  return <div className="page-content"><div className="page-heading"><div><span className="eyebrow">Reusable scope</span><h1>Services</h1><p>Select these while writing proposals, then edit the copied price without changing your library.</p></div><button className="primary" onClick={onNew}><PackagePlus size={18} /> Add service</button></div>
    <div className="category-tabs">{categories.map((category: string) => <button key={category} className={categoryFilter === category ? "active" : ""} onClick={() => setCategoryFilter(category)}>{category}</button>)}</div>
    <div className="service-grid">{visible.map((service: ServiceCatalogItem) => <button className="service-card" key={service.id} onClick={() => onEdit(service)}><div className="service-card-top"><span className="category-label">{service.category}</span><span className="service-edit"><Pencil size={15} /> Edit</span></div><div className="service-title-row"><h3>{service.title}</h3><strong>{money(service.defaultUnitPrice, currency)}</strong></div><p>{service.description}</p><div className="service-meta"><span>{pricingUnits.find((unit) => unit.value === service.pricingUnit)?.label}</span><span>{flexibilityOptions.find((option) => option.value === service.flexibility)?.label}</span>{service.defaultOptional && <span>Optional</span>}{service.recommended && <span>Recommended</span>}</div></button>)}{!visible.length && <Empty icon={Layers3} title="No services in this category" text="Add a reusable service to speed up proposal creation." action="Add service" onAction={onNew} />}</div>
  </div>;
}

function SettingsPage({ workspace, updateCompany, uploadLogo, save, exportData, selectBackupFile, saving, user, onDeleteAccount }: any) {
  const company = workspace.company;
  return <div className="page-content"><div className="page-heading"><div><span className="eyebrow">Defaults</span><h1>Settings</h1><p>Your branding, documents and delivery defaults are copied into each new proposal.</p></div><button className="primary" onClick={save} disabled={saving}>{saving ? <><Loader2 className="spin" size={18} /> Saving settings…</> : <><Save size={18} /> Save settings</>}</button></div>
    <div className="settings-grid">
      <section className="panel settings-section"><div className="section-title"><BriefcaseBusiness size={19} /><div><h2>Business</h2><p>Shown on proposals, invoices and emails.</p></div></div><div className="logo-setting"><div className="logo-preview">{company.logoDataUrl ? <img src={company.logoDataUrl} alt="Business logo" /> : <ImagePlus size={24} />}</div><label className="secondary button-label"><Upload size={16} /> Upload logo<input type="file" accept="image/png,image/jpeg" onChange={uploadLogo} /></label></div><div className="form-grid two"><Field label="Business name"><input value={company.name} onChange={(e) => updateCompany("name", e.target.value)} /></Field><Field label="Business email"><input type="email" value={company.email} onChange={(e) => updateCompany("email", e.target.value)} /></Field><Field label="Phone"><input value={company.phone} onChange={(e) => updateCompany("phone", e.target.value)} /></Field><Field label="Website"><input value={company.website} onChange={(e) => updateCompany("website", e.target.value)} /></Field><Field label="Address"><input value={company.address} onChange={(e) => updateCompany("address", e.target.value)} /></Field><Field label="Brand colour"><input type="color" value={company.accent} onChange={(e) => updateCompany("accent", e.target.value)} /></Field></div></section>
      <section className="panel settings-section"><div className="section-title"><BookOpen size={19} /><div><h2>Documents</h2><p>Simple defaults, editable per proposal.</p></div></div><div className="form-grid two"><Field label="Default currency"><select value={company.currency} onChange={(e) => updateCompany("currency", e.target.value)}>{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select></Field><Field label="Proposal validity"><div className="input-suffix"><input type="number" min="1" value={company.defaultValidityDays} onChange={(e) => updateCompany("defaultValidityDays", Number(e.target.value))} /><span>days</span></div></Field><Field label="Proposal prefix"><input value={company.proposalPrefix} onChange={(e) => updateCompany("proposalPrefix", e.target.value.toUpperCase())} /></Field><Field label="Invoice prefix"><input value={company.invoicePrefix} onChange={(e) => updateCompany("invoicePrefix", e.target.value.toUpperCase())} /></Field><Field label="Additional-work prefix"><input value={company.changeOrderPrefix || "CHG"} onChange={(e) => updateCompany("changeOrderPrefix", e.target.value.toUpperCase())} /></Field></div><Field label="Default terms and conditions" hint="Copied into new proposals; existing agreements stay unchanged."><textarea rows={8} value={company.defaultTerms} onChange={(e) => updateCompany("defaultTerms", e.target.value)} /></Field><Field label="Default payment instructions" hint="Information only. ScopeFlow does not process payments."><textarea rows={4} value={company.defaultPaymentInstructions} onChange={(e) => updateCompany("defaultPaymentInstructions", e.target.value)} /></Field><label className="toggle-row"><input type="checkbox" checked={company.useTax} onChange={(e) => updateCompany("useTax", e.target.checked)} /><span><strong>Use tax fields</strong><small>Keep this off to hide tax everywhere.</small></span></label>{company.useTax && <div className="form-grid two"><Field label="Tax label"><input value={company.taxLabel} onChange={(e) => updateCompany("taxLabel", e.target.value)} /></Field><Field label="Default rate"><div className="input-suffix"><input type="number" min="0" max="100" value={company.defaultTaxPercent} onChange={(e) => updateCompany("defaultTaxPercent", Number(e.target.value))} /><span>%</span></div></Field></div>}</section>
      <section className="panel settings-section"><div className="section-title"><Timer size={19} /><div><h2>Delivery countdown</h2><p>Used when paid projects begin.</p></div></div><div className="form-grid two"><Field label="Default timezone"><input value={company.defaultTimezone || "UTC"} onChange={(e) => updateCompany("defaultTimezone", e.target.value)} placeholder="Africa/Lagos" /></Field><Field label="Default delivery time"><input type="time" value={company.defaultDeliveryTime || "17:00"} onChange={(e) => updateCompany("defaultDeliveryTime", e.target.value)} /></Field><Field label="Due soon threshold"><div className="input-suffix"><input type="number" min="1" value={company.dueSoonHours || 72} onChange={(e) => updateCompany("dueSoonHours", Number(e.target.value))} /><span>hours</span></div></Field><Field label="Almost due threshold"><div className="input-suffix"><input type="number" min="1" value={company.almostDueHours || 12} onChange={(e) => updateCompany("almostDueHours", Number(e.target.value))} /><span>hours</span></div></Field></div></section>
      <section className="panel settings-section"><div className="section-title"><UserRound size={19} /><div><h2>Account security</h2><p>Your login is separate from the business email shown to clients.</p></div></div><div className="account-security-card"><span><strong>{user?.name || "ScopeFlow owner"}</strong><small>{user?.email}</small></span>{user?.isAdmin && <em><ShieldCheck size={14} /> Platform admin</em>}</div><div className="account-security-actions"><a className="secondary" href="/reset-password"><ShieldCheck size={17} /> Change password</a>{user?.isAdmin && <a className="secondary" href="/admin"><ShieldCheck size={17} /> Admin console</a>}</div></section>
      <section className="panel settings-section"><div className="section-title"><Download size={19} /><div><h2>Backup and restore</h2><p>Download a portable copy or restore a previous ScopeFlow backup.</p></div></div><div className="backup-actions"><button className="secondary" onClick={exportData}><Download size={17} /> Download backup</button><label className="secondary button-label"><UploadCloud size={17} /> Restore backup<input type="file" accept="application/json,.json" onChange={selectBackupFile} /></label></div><small className="settings-note">Restore validates the file first. Replace mode automatically downloads a safety backup before changing current data.</small></section>
      <section className="panel settings-section danger-zone"><div className="section-title"><UserX size={19} /><div><h2>Account deletion</h2><p>Remove your login, business settings, proposals, invoices and project records.</p></div></div>{user?.isAdmin ? <div className="protected-account-note"><ShieldCheck size={18} /><span><strong>Protected administrator account</strong><small>The platform administrator cannot be deleted from the app.</small></span></div> : <><p className="danger-copy">A final backup is downloaded automatically before deletion. This action cannot be undone after confirmation.</p><button className="danger-button" onClick={onDeleteAccount}><UserX size={17} /> Delete my ScopeFlow account</button></>}</section>
    </div>
  </div>;
}

function DeleteAccountModal({ user, confirmation, setConfirmation, deleting, onClose, onDelete }: any) {
  const matches = confirmation.trim().toLowerCase() === String(user.email).toLowerCase();
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal-card delete-account-modal" role="dialog" aria-modal="true" aria-labelledby="delete-account-title">
      <button className="modal-close" aria-label="Close" onClick={onClose} disabled={deleting}><X size={18} /></button>
      <div className="danger-icon"><AlertTriangle size={25} /></div>
      <span className="eyebrow danger-eyebrow">Permanent action</span>
      <h2 id="delete-account-title">Delete your ScopeFlow account?</h2>
      <p>This permanently removes your workspace, services, proposals, invoices and project history. A final JSON backup downloads before deletion begins.</p>
      <div className="delete-summary"><span><FileText size={17} /> Proposals and agreements</span><span><ReceiptText size={17} /> Invoices and payment records</span><span><Timer size={17} /> Delivery countdown history</span></div>
      <Field label="Enter your account email to confirm"><input autoFocus type="email" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={user.email} disabled={deleting} /></Field>
      <div className="modal-actions"><button className="secondary" onClick={onClose} disabled={deleting}>Cancel</button><button className="danger-button" disabled={!matches || deleting} onClick={onDelete}>{deleting ? <><Loader2 className="spin" size={17} /> Deleting account…</> : <><UserX size={17} /> Delete permanently</>}</button></div>
    </section>
  </div>;
}

function ProposalEditor({ proposal, setProposal, step, setStep, workspace, clientSuggestions, onBack, onSend, onCopy, onPreview, onDuplicate, onArchive, onDelete, onOwnerRespond, onExtend, onCreateInvoice, onMarkPaid, onCopyInvoice, onEmailInvoice, onEmailProposal, onReminder, onCreateChangeOrder, onEditInvoice, onArchiveInvoice, onRestoreInvoice, onProjectAction, saving }: any) {
  proposal = normalizeProposal(proposal);
  const totals = totalsFor(proposal);
  const offerTotals = totalsFor(proposal, "client_offer");
  const locked = proposal.status === "approved" || Boolean(proposal.archived) || Boolean(proposal.trashedAt);
  const selectedCount = proposal.items.filter((item: ProposalItem) => !item.optional || item.selected).length;
  const readiness = proposalReadiness(proposal);
  const readyToSend = readiness.every((check) => check.ok);
  const kind = documentKindLabel(proposal);
  const [catalogOpen, setCatalogOpen] = useState(false);

  function update<K extends keyof Proposal>(key: K, value: Proposal[K]) { setProposal((current: Proposal) => current ? normalizeProposal({ ...current, [key]: value }) : current); }
  function updateItem(id: string, patch: Partial<ProposalItem>) { update("items", proposal.items.map((item: ProposalItem) => item.id === id ? { ...item, ...patch } : item)); }
  function moveItem(index: number, direction: -1 | 1) { const target = index + direction; if (target < 0 || target >= proposal.items.length) return; const next = [...proposal.items]; [next[index], next[target]] = [next[target], next[index]]; update("items", next); }
  function addCustom() { update("items", [...proposal.items, { id: uid(), title: "New service", description: "Describe what is included and the result the client receives.", quantity: 1, unitPrice: 0, pricingUnit: "fixed", optional: true, recommended: false, selected: true, flexibility: "flexible", clientCanRequestPrice: true, clientCanChangeQuantity: false }]); }
  function addCatalog(service: ServiceCatalogItem) { update("items", [...proposal.items, itemFromService(service)]); setCatalogOpen(false); }
  function fillClient(email: string) { const client = clientSuggestions.find((item: Proposal["client"]) => item.email.toLowerCase() === email.toLowerCase()); if (client) update("client", structuredClone(client)); }
  const invoices = activeInvoices(proposal);

  return <div className="editor-page">
    <div className="editor-header"><button className="icon-text" onClick={onBack}><ArrowLeft size={18} /> Back</button><div className="editor-title"><div><span className={`status-chip ${proposal.status}`}>{statusLabel(proposal)}</span><small>{proposal.documentType === "change_order" ? `Additional work for ${proposal.parentProposalNumber || "approved agreement"}` : secondaryStatusLabel(proposal)}</small></div><h1>{proposal.title}</h1></div><div className="editor-actions"><button className="secondary compact" onClick={onPreview}><Eye size={17} /> Preview</button>{proposal.status !== "draft" && <button className="secondary compact" onClick={onCopy}><Copy size={17} /> Copy link</button>}{!locked && <button className="primary compact" onClick={onSend} disabled={saving || !readyToSend}><Send size={17} /> {proposal.sentAt ? "Resend" : "Send"}</button>}</div></div>

    {proposal.status === "needs_response" && <OwnerResponse proposal={proposal} updateItem={updateItem} update={update} totals={offerTotals} onRespond={onOwnerRespond} />}
    {proposal.status === "awaiting_client" && isExpired(proposal) && <div className="notice warning"><Clock3 size={19} /><div><strong>This proposal has expired</strong><span>The client can view it but cannot respond until you extend it.</span></div><button className="secondary compact" onClick={onExtend}>Extend 7 days</button></div>}
    {locked && <ApprovedActions proposal={proposal} onCreateInvoice={onCreateInvoice} onMarkPaid={onMarkPaid} onCopyInvoice={onCopyInvoice} onEmailInvoice={onEmailInvoice} onReminder={onReminder} onCreateChangeOrder={onCreateChangeOrder} onEditInvoice={onEditInvoice} onArchiveInvoice={onArchiveInvoice} onRestoreInvoice={onRestoreInvoice} onProjectAction={onProjectAction} />}

    <div className="editor-stepper">{["Client", "Services", "Details", "Preview"].map((label, index) => <button key={label} className={step === index + 1 ? "active" : step > index + 1 ? "done" : ""} onClick={() => setStep(index + 1)}><span>{step > index + 1 ? <Check size={15} /> : index + 1}</span><strong>{label}</strong></button>)}</div>

    <div className="editor-layout"><section className="editor-canvas panel">
      {step === 1 && <div className="editor-section"><SectionHead number="01" title="Client and offer" text="Add the client and explain the outcome before listing prices." /><div className="form-grid two"><Field label="Client name"><input disabled={locked} value={proposal.client.name} onChange={(e) => update("client", { ...proposal.client, name: e.target.value })} /></Field><Field label="Client company"><input disabled={locked} value={proposal.client.company} onChange={(e) => update("client", { ...proposal.client, company: e.target.value })} /></Field><Field label="Client email"><input disabled={locked} list="scopeflow-clients" type="email" value={proposal.client.email} onBlur={(e) => fillClient(e.target.value)} onChange={(e) => update("client", { ...proposal.client, email: e.target.value })} /><datalist id="scopeflow-clients">{clientSuggestions.map((client: Proposal["client"]) => <option key={client.email} value={client.email}>{client.name}</option>)}</datalist></Field><Field label="Client phone"><input disabled={locked} value={proposal.client.phone} onChange={(e) => update("client", { ...proposal.client, phone: e.target.value })} /></Field></div><Field label={proposal.documentType === "change_order" ? "Additional-work title" : "Proposal title"}><input disabled={locked} value={proposal.title} onChange={(e) => update("title", e.target.value)} /></Field><Field label="Introduction" hint="Explain the result and value in plain language."><textarea disabled={locked} rows={5} value={proposal.summary} onChange={(e) => update("summary", e.target.value)} /></Field><Field label="Valid until"><input disabled={locked} type="date" value={proposal.validUntil} onChange={(e) => update("validUntil", e.target.value)} /></Field></div>}

      {step === 2 && <div className="editor-section"><SectionHead number="02" title="Services and optional extras" text="Required services stay included. Optional extras use clear add and remove controls on the client page." /><div className="service-editor-actions"><button className="secondary" disabled={locked} onClick={() => setCatalogOpen(!catalogOpen)}><Layers3 size={17} /> Add from services</button><button className="secondary" disabled={locked} onClick={addCustom}><Plus size={17} /> Add custom service</button></div>{catalogOpen && <div className="catalog-picker">{workspace.services.filter((service: ServiceCatalogItem) => service.active).map((service: ServiceCatalogItem) => <button key={service.id} onClick={() => addCatalog(service)}><span><strong>{service.title}</strong><small>{service.category}</small></span><b>{money(service.defaultUnitPrice, proposal.currency)}</b></button>)}</div>}<div className="editor-items">{proposal.items.map((item: ProposalItem, index: number) => <EditorItem key={item.id} item={item} index={index} count={proposal.items.length} currency={proposal.currency} locked={locked} update={(patch: Partial<ProposalItem>) => updateItem(item.id, patch)} moveUp={() => moveItem(index, -1)} moveDown={() => moveItem(index, 1)} remove={() => update("items", proposal.items.filter((entry: ProposalItem) => entry.id !== item.id))} />)}</div></div>}

      {step === 3 && <div className="editor-section"><SectionHead number="03" title="Commercial details and delivery" text="Set terms, the incentive and the countdown that begins after confirmed payment." /><div className="form-grid two"><Field label="Timeline shown before payment"><textarea disabled={locked} rows={3} value={proposal.timeline} onChange={(e) => update("timeline", e.target.value)} /></Field><Field label="Payment schedule"><textarea disabled={locked} rows={3} value={proposal.paymentSchedule} onChange={(e) => update("paymentSchedule", e.target.value)} /></Field></div><Field label="Payment instructions"><textarea disabled={locked} rows={3} value={proposal.paymentInstructions} onChange={(e) => update("paymentInstructions", e.target.value)} /></Field><Field label="Terms and conditions"><textarea disabled={locked} rows={7} value={proposal.terms} onChange={(e) => update("terms", e.target.value)} /></Field>
        <div className="subsection-card"><div className="subsection-heading"><Sparkles size={18} /><span><strong>Order incentive</strong><small>One optional saving rule per proposal.</small></span><label><input disabled={locked} type="checkbox" checked={proposal.incentive.enabled} onChange={(e) => update("incentive", { ...proposal.incentive, enabled: e.target.checked })} /> Enabled</label></div>{proposal.incentive.enabled && <div className="form-grid two"><Field label="Minimum subtotal"><MoneyInput currency={proposal.currency} disabled={locked} value={proposal.incentive.threshold} onChange={(value) => update("incentive", { ...proposal.incentive, threshold: value })} /></Field><Field label="Saving"><div className="input-suffix"><input disabled={locked} type="number" min="0" max="100" value={proposal.incentive.percent} onChange={(e) => update("incentive", { ...proposal.incentive, percent: Number(e.target.value) })} /><span>%</span></div></Field><Field label="Label"><input disabled={locked} value={proposal.incentive.label} onChange={(e) => update("incentive", { ...proposal.incentive, label: e.target.value })} /></Field><Field label="Client message"><input disabled={locked} value={proposal.incentive.message} onChange={(e) => update("incentive", { ...proposal.incentive, message: e.target.value })} /></Field><label className="toggle-row"><input disabled={locked} type="checkbox" checked={proposal.incentive.allowWithNegotiation} onChange={(e) => update("incentive", { ...proposal.incentive, allowWithNegotiation: e.target.checked })} /><span><strong>Allow with negotiated prices</strong><small>Off by default to prevent double discounts.</small></span></label></div>}</div>
        <div className="subsection-card"><div className="subsection-heading"><Timer size={18} /><span><strong>Delivery countdown</strong><small>Starts after the payment condition is confirmed.</small></span><label><input disabled={locked} type="checkbox" checked={proposal.delivery?.enabled !== false} onChange={(e) => update("delivery", { ...proposal.delivery!, enabled: e.target.checked })} /> Enabled</label></div>{proposal.delivery?.enabled !== false && <div className="form-grid two"><Field label="Delivery duration"><div className="input-suffix"><input disabled={locked} type="number" min="1" value={proposal.delivery?.duration || 14} onChange={(e) => update("delivery", { ...proposal.delivery!, duration: Math.max(1, Number(e.target.value)) })} /><span>days</span></div></Field><Field label="Count"><select disabled={locked} value={proposal.delivery?.dayMode || "calendar_days"} onChange={(e) => update("delivery", { ...proposal.delivery!, dayMode: e.target.value as any })}><option value="calendar_days">Calendar days</option><option value="business_days">Business days</option></select></Field><Field label="Start when"><select disabled={locked} value={proposal.delivery?.startTrigger || "full_payment"} onChange={(e) => update("delivery", { ...proposal.delivery!, startTrigger: e.target.value as any })}><option value="full_payment">Full payment is confirmed</option><option value="deposit">Required deposit is confirmed</option><option value="manual">I start it manually</option></select></Field>{proposal.delivery?.startTrigger === "deposit" && <Field label="Required deposit"><MoneyInput disabled={locked} currency={proposal.currency} value={proposal.delivery?.depositRequired || 0} onChange={(value) => update("delivery", { ...proposal.delivery!, depositRequired: value })} /></Field>}<Field label="Delivery time"><input disabled={locked} type="time" value={proposal.delivery?.deliveryTime || "17:00"} onChange={(e) => update("delivery", { ...proposal.delivery!, deliveryTime: e.target.value })} /></Field><Field label="Timezone"><input disabled={locked} value={proposal.delivery?.timezone || "UTC"} onChange={(e) => update("delivery", { ...proposal.delivery!, timezone: e.target.value })} placeholder="Africa/Lagos" /></Field><label className="toggle-row"><input disabled={locked || proposal.delivery?.startTrigger === "manual"} type="checkbox" checked={proposal.delivery?.autoStartOnPayment !== false} onChange={(e) => update("delivery", { ...proposal.delivery!, autoStartOnPayment: e.target.checked })} /><span><strong>Start immediately after payment confirmation</strong><small>Turn off when materials must be received before work begins.</small></span></label></div>}</div>
      </div>}

      {step === 4 && <div className="editor-section"><SectionHead number="04" title="Preview and send" text="Check the exact client experience before sharing the secure link." /><div className="readiness-list">{readiness.map((check) => <div key={check.label} className={check.ok ? "ready" : "missing"}>{check.ok ? <CheckCircle2 size={17} /> : <X size={17} />}<span>{check.label}</span></div>)}</div><ProposalPreview proposal={proposal} totals={totals} /><div className="preview-actions"><button className="secondary" onClick={onPreview}><Eye size={18} /> Preview as client</button>{!locked && <button className="primary" onClick={onSend} disabled={!readyToSend}><Send size={18} /> {proposal.sentAt ? `Resend ${kind}` : `Send ${kind}`}</button>}</div></div>}
    </section>

    <aside className="editor-sidebar"><div className="panel summary-card"><span className="eyebrow">Live summary</span><div className="summary-total"><small>Current total</small><strong>{money(totals.total, proposal.currency)}</strong></div><div className="summary-lines"><span><small>Selected services</small><b>{selectedCount}</b></span><span><small>Subtotal</small><b>{money(totals.subtotal, proposal.currency)}</b></span>{totals.incentiveDiscount > 0 && <span className="saving-line"><small>{proposal.incentive.label}</small><b>-{money(totals.incentiveDiscount, proposal.currency)}</b></span>}{totals.tax > 0 && <span><small>{proposal.taxLabel}</small><b>{money(totals.tax, proposal.currency)}</b></span>}</div>{proposal.incentive.enabled && <IncentiveProgress proposal={proposal} totals={totals} compact />}</div>
      <div className="panel quick-actions"><h3>{proposal.documentType === "change_order" ? "Additional-work actions" : "Proposal actions"}</h3><button onClick={onDuplicate}><FilePlus2 size={17} /> Duplicate</button>{proposal.status !== "draft" && <button onClick={onCopy}><Copy size={17} /> Copy client link</button>}{proposal.status !== "draft" && proposal.status !== "approved" && <button onClick={onEmailProposal}><Mail size={17} /> Send proposal email</button>}{proposal.status !== "draft" && <button onClick={() => onReminder()}><Bell size={17} /> Send reminder</button>}<button onClick={onPreview}><Eye size={17} /> Preview as client</button>{invoices[0] && <><button onClick={() => onCopyInvoice(invoices[0])}><Link2 size={17} /> Copy latest invoice</button><button onClick={() => onEmailInvoice(invoices[0])}><Mail size={17} /> Email latest invoice</button></>}{proposal.status === "draft" ? <button className="danger-text" onClick={onDelete}><Trash2 size={17} /> Move draft to Trash</button> : !proposal.archived && <button className="danger-text" onClick={onArchive}><Archive size={17} /> Archive proposal</button>}</div>
      <div className="panel history-card"><h3>History</h3>{proposal.history.slice().reverse().slice(0, 10).map((entry: any) => <div key={entry.id}><span /><p><strong>{entry.action}</strong><small>{entry.detail}</small><em>v{entry.version} · {dateTimeLabel(entry.at)}</em></p></div>)}</div>
    </aside></div>
    <div className="editor-footer"><button className="secondary" disabled={step === 1} onClick={() => setStep(Math.max(1, step - 1))}><ArrowLeft size={17} /> Previous</button><span>{saving ? "Saving…" : "All changes autosave"}</span>{step < 4 ? <button className="primary" onClick={() => setStep(step + 1)}>Continue <ArrowRight size={17} /></button> : !locked ? <button className="primary" onClick={onSend} disabled={!readyToSend}><Send size={17} /> Send</button> : <button className="secondary" onClick={onPreview}><Eye size={17} /> View client page</button>}</div>
  </div>;
}

function OwnerResponse({ proposal, updateItem, update, totals, onRespond }: any) {
  const belowMinimum = proposal.minimumProjectTotal && totals.total < proposal.minimumProjectTotal;
  return <section className="response-panel"><div className="response-heading"><div><span className="eyebrow">Needs your response</span><h2>{proposal.responseState === "price_request" ? "Client suggested new prices" : "Client requested a change"}</h2><p>{proposal.clientNote || "Review the request, then accept it, counter it or keep the original offer."}</p></div><div className="request-total"><small>Requested total</small><strong>{money(totals.total, proposal.currency)}</strong>{proposal.priceRequest && <span>Original {money(proposal.priceRequest.originalTotal, proposal.currency)}</span>}</div></div>{belowMinimum && <div className="inline-warning"><Bell size={17} /> This request falls below your hidden minimum project total of {money(proposal.minimumProjectTotal, proposal.currency)}.</div>}<div className="request-items">{proposal.items.filter((item: ProposalItem) => !item.optional || item.selected).map((item: ProposalItem) => <div key={item.id}><span><strong>{item.title}</strong><small>Original {money(item.unitPrice, proposal.currency)}</small></span><span><small>Client request</small><b>{money(item.clientOfferUnitPrice ?? currentUnitPrice(item), proposal.currency)}</b></span><label><small>Your counter</small><input type="number" min="0" value={item.ownerCounterUnitPrice ?? item.clientOfferUnitPrice ?? currentUnitPrice(item)} onChange={(e) => updateItem(item.id, { ownerCounterUnitPrice: Number(e.target.value) })} /></label></div>)}</div><Field label="Response note"><textarea rows={2} value={proposal.ownerResponseNote || ""} onChange={(e) => update("ownerResponseNote", e.target.value)} placeholder="Optional explanation shown when you return the proposal" /></Field><div className="response-actions"><button className="success-button" onClick={() => onRespond("accept")}><CheckCircle2 size={17} /> Accept request</button><button className="primary" onClick={() => onRespond("counter")}><RefreshCcw size={17} /> Send counteroffer</button><button className="secondary" onClick={() => onRespond("decline")}><X size={17} /> Keep original offer</button></div></section>;
}

function ApprovedActions({ proposal, onCreateInvoice, onMarkPaid, onCopyInvoice, onEmailInvoice, onReminder, onCreateChangeOrder, onEditInvoice, onArchiveInvoice, onRestoreInvoice, onProjectAction }: any) {
  proposal = normalizeProposal(proposal);
  const invoices = proposal.invoices || [];
  const visibleInvoices = invoices.filter((invoice: InvoiceInfo) => !invoice.archived);
  const archivedInvoices = invoices.filter((invoice: InvoiceInfo) => invoice.archived);
  const remaining = remainingToInvoice(proposal);
  const plan = proposal.delivery!;
  const urgency = deliveryUrgency(plan);
  const calendarUrl = plan.deadlineAt ? googleCalendarUrl(proposal) : "";
  const orderedItems: ProposalItem[] = proposal.approvedSnapshot?.items || proposal.items.filter((item: ProposalItem) => !item.optional || item.selected);
  const completedItems = new Set(plan.completedItemIds || []);
  const allItemsDone = orderedItems.length > 0 && orderedItems.every((item) => completedItems.has(item.id));
  const [submissionNote, setSubmissionNote] = useState(plan.submissionNote || "");

  useEffect(() => {
    setSubmissionNote(plan.submissionNote || "");
  }, [proposal.id, plan.submissionNote]);

  const pauseProject = () => { const reason = window.prompt("Why is the countdown being paused?", "Waiting for client materials"); if (reason) onProjectAction("pause", reason); };
  const extendProject = () => { const days = Number(window.prompt("How many days should be added?", "1")); if (Number.isFinite(days) && days > 0) onProjectAction("extend", days); };

  const statusText: Record<string, string> = {
    awaiting_payment: "Awaiting payment",
    scheduled: "Ready to start",
    in_progress: "In progress",
    paused: "Paused",
    ready_for_review: "In progress",
    changes_requested: "Changes requested",
    delivered: "Delivered",
    accepted: "Accepted",
    completed: "Accepted",
  };

  const invoiceSent = visibleInvoices.length > 0;
  const paymentConfirmed = Boolean(plan.paymentConfirmedAt || visibleInvoices.some((invoice: InvoiceInfo) => invoice.status === "paid"));
  let currentStage = 0;
  if (invoiceSent) currentStage = 1;
  if (paymentConfirmed) currentStage = 2;
  if (["in_progress", "paused", "ready_for_review", "changes_requested"].includes(plan.status)) currentStage = 3;
  if (plan.status === "delivered") currentStage = 4;
  if (["accepted", "completed"].includes(plan.status)) currentStage = 5;
  const progressStages = ["Negotiation", "Invoice sent", "Payment confirmed", "In progress", "Delivered", "Accepted"];

  return <div className="approved-workspace">
    <div className="notice success approved-action-panel"><FileCheck2 size={21} /><div><strong>Approved and locked</strong><span>Version {proposal.approvedSnapshot?.version || proposal.version} was approved by {proposal.approval?.signedBy} on {dateTimeLabel(proposal.approval?.signedAt)}. The accepted scope cannot be silently changed.</span></div><div className="notice-actions"><a className="secondary compact" href={`/api/pdf/${proposal.publicToken}?type=agreement`}><Download size={17} /> Agreement PDF</a><button className="secondary compact" onClick={onCreateChangeOrder}><Plus size={17} /> Additional work order</button></div></div>

    <section className="panel project-progress-panel">
      <div className="panel-heading"><div><span className="eyebrow">Project progress</span><h2>From negotiation to acceptance</h2><p>The project now has a visible commercial and delivery path instead of a single approved state.</p></div></div>
      <div className="project-progress-track">{progressStages.map((label, index) => <div key={label} className={index < currentStage ? "done" : index === currentStage ? "active" : ""}><span>{index < currentStage ? <Check size={14} /> : index + 1}</span><small>{label}</small></div>)}</div>
    </section>

    <section className="panel document-center"><div className="panel-heading"><div><span className="eyebrow">Documents</span><h2>Invoices</h2><p>Each invoice has its own secure link, status and PDF.</p></div>{remaining > 0.005 && <button className="primary compact" onClick={() => onCreateInvoice()}><FilePlus2 size={17} /> Create invoice</button>}</div>
      {visibleInvoices.length ? <div className="invoice-list">{visibleInvoices.map((invoice: InvoiceInfo) => <div key={invoice.id} className="invoice-list-row"><div className={`invoice-list-icon ${invoice.status}`}><ReceiptText size={18} /></div><div className="invoice-list-main"><strong>{invoice.number}</strong><small>{invoice.kind.replace(/_/g, " ")} · Due {dateLabel(invoice.dueAt)} · {invoice.viewCount || 0} views</small></div><div className="invoice-list-amount"><strong>{money(invoice.amountDue, proposal.currency)}</strong><span className={`invoice-state ${invoice.status}`}>{invoice.status === "payment_reported" ? "Payment reported" : invoice.status}</span></div><div className="invoice-list-actions"><a title="Open invoice" href={`/invoice/${invoice.publicToken}`} target="_blank"><Eye size={16} /></a><a title="Download PDF" href={`/api/pdf/${invoice.publicToken}?type=invoice`}><Download size={16} /></a><button title="Copy link" onClick={() => onCopyInvoice(invoice)}><Copy size={16} /></button><button title="Email invoice" onClick={() => onEmailInvoice(invoice)}><Mail size={16} /></button><button title="Send reminder" onClick={() => onReminder(invoice)}><Bell size={16} /></button><button title="Edit invoice" onClick={() => onEditInvoice(invoice)}><Pencil size={16} /></button><button title={invoice.status === "paid" ? "Mark unpaid" : "Confirm payment"} onClick={() => onMarkPaid(invoice)}>{invoice.status === "paid" ? <RotateCcw size={16} /> : <CheckCircle2 size={16} />}</button><button title="Archive invoice" onClick={() => { const disable = confirm("Disable the client invoice link too? Click OK to disable it, or Cancel to archive internally only."); onArchiveInvoice(invoice, disable); }}><Archive size={16} /></button></div></div>)}</div> : <Empty icon={ReceiptText} title="No invoice documents yet" text="Create a deposit, milestone, balance or full invoice from the approved agreement." action="Create invoice" onAction={() => onCreateInvoice()} />}
      <div className="invoice-summary-strip"><span><small>Approved total</small><strong>{money(totalsFor(proposal.approvedSnapshot || proposal).total, proposal.currency)}</strong></span><span><small>Paid</small><strong>{money(paidInvoiceAmount(proposal), proposal.currency)}</strong></span><span><small>Remaining to invoice</small><strong>{money(remaining, proposal.currency)}</strong></span></div>
      {archivedInvoices.length > 0 && <details className="archived-invoices"><summary>Archived invoices ({archivedInvoices.length})</summary>{archivedInvoices.map((invoice: InvoiceInfo) => <div key={invoice.id}><span><strong>{invoice.number}</strong><small>{money(invoice.amountDue, proposal.currency)} · {invoice.linkEnabled === false ? "Link disabled" : "Link active"}</small></span><button className="secondary compact" onClick={() => onRestoreInvoice(invoice)}><RotateCcw size={15} /> Restore</button></div>)}</details>}
    </section>

    <section className="panel project-delivery-card">
      <div className="panel-heading"><div><span className="eyebrow">Project delivery</span><h2>Complete and submit the ordered work</h2><p>Mark each ordered service as done, add a delivery note, then submit the project for client review.</p></div><span className={`project-status-badge ${urgency}`}>{statusText[plan.status] || plan.status.replace(/_/g, " ")}</span></div>
      <div className="delivery-overview"><div><small>Status</small><strong>{statusText[plan.status] || plan.status.replace(/_/g, " ")}</strong></div><div><small>Delivery window</small><strong>{plan.duration} {plan.dayMode === "business_days" ? "business" : "calendar"} days</strong></div><div><small>Time remaining</small><strong>{remainingTimeLabel(plan)}</strong></div><div><small>Expected delivery</small><strong>{plan.deadlineAt ? dateTimeLabel(plan.deadlineAt, plan.timezone) : "Starts after payment"}</strong></div></div>
      {plan.pauseReason && <div className="inline-warning"><Pause size={17} /> Paused: {plan.pauseReason}</div>}
      {plan.status === "changes_requested" && <div className="inline-warning"><RefreshCcw size={17} /><div><strong>Client requested changes</strong><span>{plan.clientReviewNote || "Review the client note, update the affected work and submit the project again."}</span></div></div>}
      {plan.status === "delivered" && <div className="notice success project-review-state"><CheckCircle2 size={19} /><div><strong>Project delivered to client</strong><span>Submitted {dateTimeLabel(plan.submittedAt || plan.deliveredAt, plan.timezone)}. The client can now accept it or request changes from the same secure link.</span></div></div>}
      {["accepted", "completed"].includes(plan.status) && <div className="notice success project-review-state"><CheckCircle2 size={19} /><div><strong>Project accepted</strong><span>{plan.acceptedBy ? `${plan.acceptedBy} accepted the project` : "The client accepted the project"}{plan.acceptedAt ? ` on ${dateTimeLabel(plan.acceptedAt, plan.timezone)}` : ""}.</span>{plan.clientReviewNote && <small>{plan.clientReviewNote}</small>}</div></div>}

      {["in_progress", "paused", "ready_for_review", "changes_requested", "delivered", "accepted", "completed"].includes(plan.status) && <div className="project-completion">
        <div className="project-completion-heading"><div><strong>Ordered services</strong><small>{completedItems.size} of {orderedItems.length} marked done</small></div><span>{orderedItems.length ? Math.round((completedItems.size / orderedItems.length) * 100) : 0}%</span></div>
        <div className="project-service-checklist">{orderedItems.map((item) => {
          const checked = completedItems.has(item.id);
          const locked = ["delivered", "accepted", "completed"].includes(plan.status);
          return <label key={item.id} className={checked ? "done" : ""}><input type="checkbox" checked={checked} disabled={locked} onChange={() => onProjectAction("toggle_item", item.id)} /><span>{checked ? <CheckCircle2 size={18} /> : <Clock3 size={18} />}<span><strong>{item.title}</strong><small>{item.description}</small></span></span></label>;
        })}</div>
      </div>}

      {["in_progress", "ready_for_review", "changes_requested"].includes(plan.status) && <div className="project-submit-box">
        <Field label="Delivery note" hint="Tell the client what was completed, where to review it, and anything they should know before accepting."><textarea rows={4} value={submissionNote} onChange={(event) => setSubmissionNote(event.target.value)} placeholder="Example: All agreed pages are complete. Please review the live site and confirm that the approved scope has been delivered." /></Field>
        <div className="project-submit-footer"><span>{allItemsDone ? <><CheckCircle2 size={16} /> All ordered services are complete</> : <><Clock3 size={16} /> Finish the checklist before submission</>}</span><button className="success-button" disabled={!allItemsDone || !submissionNote.trim()} onClick={() => onProjectAction("submit", submissionNote)}><Send size={17} /> Submit Project</button></div>
      </div>}

      <div className="project-actions">
        {plan.status === "scheduled" && <button className="primary compact" onClick={() => onProjectAction("start")}><Play size={16} /> Start project</button>}
        {plan.status === "awaiting_payment" && plan.startTrigger === "manual" && <button className="primary compact" onClick={() => onProjectAction("start")}><Play size={16} /> Start manually</button>}
        {["in_progress", "ready_for_review"].includes(plan.status) && <button className="secondary compact" onClick={pauseProject}><Pause size={16} /> Pause</button>}
        {plan.status === "paused" && <button className="primary compact" onClick={() => onProjectAction("resume")}><Play size={16} /> Resume</button>}
        {["in_progress", "paused", "ready_for_review", "changes_requested", "scheduled"].includes(plan.status) && <button className="secondary compact" onClick={extendProject}><Clock3 size={16} /> Extend</button>}
        {plan.deadlineAt && !["accepted", "completed"].includes(plan.status) && <><a className="secondary compact" href={`/api/calendar/${proposal.publicToken}`}><CalendarDays size={16} /> Calendar file</a><a className="secondary compact" href={calendarUrl} target="_blank" rel="noreferrer"><CalendarDays size={16} /> Google Calendar</a></>}
      </div>
    </section>
  </div>;
}
function EditorItem({ item, index, count, currency, locked, update, moveUp, moveDown, remove }: any) {
  const [advanced, setAdvanced] = useState(false);
  return <div className="editor-item"><div className="item-number"><span>{String(index + 1).padStart(2, "0")}</span><button disabled={locked || index === 0} onClick={moveUp} aria-label="Move service up"><ArrowUp size={13} /></button><button disabled={locked || index === count - 1} onClick={moveDown} aria-label="Move service down"><ArrowDown size={13} /></button></div><div className="item-fields"><div className="item-title-row"><input disabled={locked} className="item-title-input" value={item.title} onChange={(e) => update({ title: e.target.value })} /><button disabled={locked} className="icon-button danger-text" onClick={remove} aria-label={`Remove ${item.title}`}><Trash2 size={16} /></button></div><textarea disabled={locked} rows={2} value={item.description} onChange={(e) => update({ description: e.target.value })} placeholder="Explain the result the client receives, not only the technical task." /><div className="item-pricing"><Field label="Price"><MoneyInput currency={currency} value={item.unitPrice} disabled={locked} onChange={(value) => update({ unitPrice: value })} /></Field><Field label="Quantity"><input disabled={locked} type="number" min="1" value={item.quantity} onChange={(e) => update({ quantity: Math.max(1, Number(e.target.value)) })} /></Field><Field label="Unit"><select disabled={locked} value={item.pricingUnit} onChange={(e) => update({ pricingUnit: e.target.value, clientCanChangeQuantity: e.target.value !== "fixed" })}>{pricingUnits.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}</select></Field></div><div className="item-options"><label><input disabled={locked} type="checkbox" checked={item.optional} onChange={(e) => update({ optional: e.target.checked })} /> Optional extra</label><label><input disabled={locked} type="checkbox" checked={item.recommended} onChange={(e) => update({ recommended: e.target.checked })} /> Recommended</label><button className="text-button" onClick={() => setAdvanced(!advanced)}>Client controls <ChevronDown className={advanced ? "rotated" : ""} size={14} /></button></div>{advanced && <div className="advanced-item"><label className="toggle-row subtle"><input disabled={locked} type="checkbox" checked={item.clientCanRequestPrice !== false} onChange={(e) => update({ clientCanRequestPrice: e.target.checked })} /><span><strong>Allow price requests</strong><small>The client sees “Request a different price.”</small></span></label><label className="toggle-row subtle"><input disabled={locked || item.pricingUnit === "fixed"} type="checkbox" checked={item.clientCanChangeQuantity !== false && item.pricingUnit !== "fixed"} onChange={(e) => update({ clientCanChangeQuantity: e.target.checked })} /><span><strong>Allow quantity changes</strong><small>Available for per-item, hourly, daily and monthly services.</small></span></label><Field label="Hidden price flexibility"><select disabled={locked} value={item.flexibility} onChange={(e) => update({ flexibility: e.target.value })}>{flexibilityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field><Field label="Hidden minimum price" hint="Clients never see this."><MoneyInput currency={currency} value={item.minimumUnitPrice || 0} disabled={locked} onChange={(value) => update({ minimumUnitPrice: value || undefined })} /></Field></div>}</div></div>;
}

function ProposalPreview({ proposal, totals }: { proposal: Proposal; totals: ReturnType<typeof totalsFor> }) {
  return <div className="proposal-preview"><div className="preview-brand"><div className="preview-logo">{proposal.company.logoDataUrl ? <img src={proposal.company.logoDataUrl} alt="" /> : proposal.company.name.slice(0, 2).toUpperCase()}</div><span><strong>{proposal.company.name}</strong><small>{proposal.company.email}</small></span><em>{proposal.proposalNumber}</em></div><div className="preview-hero"><span>Prepared for {proposal.client.company || proposal.client.name || "your client"}</span><h2>{proposal.title}</h2><p>{proposal.summary}</p><div><small>{proposal.items.filter((item) => !item.optional || item.selected).length} selected services</small><small>Valid until {dateLabel(proposal.validUntil)}</small></div></div><div className="preview-scope">{proposal.items.map((item) => <div key={item.id} className={!item.selected && item.optional ? "muted" : ""}><span>{item.optional ? "Optional" : "Included"}</span><div><strong>{item.title}</strong><small>{item.description}</small></div><b>{money(item.quantity * currentUnitPrice(item), proposal.currency)}</b></div>)}</div>{proposal.incentive.enabled && <IncentiveProgress proposal={proposal} totals={totals} />}<div className="preview-total"><span><small>Total</small><strong>{money(totals.total, proposal.currency)}</strong></span><span>{proposal.timeline}</span></div></div>;
}

function IncentiveProgress({ proposal, totals, compact = false }: { proposal: Proposal; totals: ReturnType<typeof totalsFor>; compact?: boolean }) {
  const progress = Math.min(100, proposal.incentive.threshold > 0 ? (totals.subtotal / proposal.incentive.threshold) * 100 : 100);
  return <div className={`incentive-progress ${totals.incentiveUnlocked ? "unlocked" : ""} ${compact ? "compact" : ""}`}><div><span>{totals.incentiveUnlocked ? <CheckCircle2 size={16} /> : <Sparkles size={16} />}<strong>{totals.incentiveUnlocked ? `${proposal.incentive.percent}% ${proposal.incentive.label} unlocked` : proposal.incentive.label}</strong></span><b>{Math.round(progress)}%</b></div><em className="incentive-owner-message">{proposal.incentive.message}</em><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><small>{totals.incentiveUnlocked ? `You save ${money(totals.incentiveDiscount, proposal.currency)}.` : `Add ${money(totals.remainingToUnlock, proposal.currency)} more to unlock ${proposal.incentive.percent}% off.`}</small></div>;
}

function InvoiceModal({ draft, setDraft, onClose, onSave }: { draft: InvoiceDraft; setDraft: (draft: InvoiceDraft | null) => void; onClose: () => void; onSave: (draft: InvoiceDraft) => void }) {
  const proposal = normalizeProposal(draft.proposal);
  const approvedTotal = totalsFor(proposal.approvedSnapshot || proposal).total;
  const existing = draft.invoiceId ? proposal.invoices!.find((invoice) => invoice.id === draft.invoiceId) : undefined;
  const otherTotal = proposal.invoices!.filter((invoice) => invoice.id !== draft.invoiceId && invoice.status !== "cancelled").reduce((sum, invoice) => sum + invoice.amountDue, 0);
  const available = Math.max(0, approvedTotal - otherTotal);
  const update = (patch: Partial<InvoiceDraft>) => setDraft({ ...draft, ...patch });
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal-card invoice-modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><span className="eyebrow">Invoice document</span><h2>{existing ? "Edit invoice" : "Create invoice"}</h2><p>Each invoice has its own secure read-only link and remains connected to agreement {proposal.proposalNumber}.</p></div><button className="icon-button" onClick={onClose} aria-label="Close invoice editor"><X size={18} /></button></div><div className="invoice-modal-summary"><FileCheck2 size={20} /><span><strong>{proposal.title}</strong><small>Approved {money(approvedTotal, proposal.currency)} · Available to invoice {money(available, proposal.currency)}</small></span></div><div className="form-grid two"><Field label="Invoice type"><select value={draft.kind} onChange={(event) => update({ kind: event.target.value as InvoiceKind })}><option value="full">Full amount</option><option value="deposit">Deposit</option><option value="milestone">Milestone</option><option value="balance">Remaining balance</option><option value="custom">Custom</option></select></Field><Field label="Amount due"><MoneyInput currency={proposal.currency} value={draft.amountDue} onChange={(value) => update({ amountDue: Math.min(available || approvedTotal, Math.max(0, value)) })} /></Field><Field label="Due date"><input type="date" value={draft.dueAt} onChange={(event) => update({ dueAt: event.target.value })} /></Field></div><Field label="Invoice note" hint="Optional context such as deposit, milestone or final balance."><textarea rows={4} value={draft.note} onChange={(event) => update({ note: event.target.value })} placeholder="Example: 50% project deposit" /></Field><div className="invoice-modal-info"><LockKeyhole size={17} /><span>Clients can view, download and report payment. They cannot edit the approved scope or invoice amount.</span></div><div className="modal-actions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!draft.dueAt || draft.amountDue <= 0 || draft.amountDue > (available || approvedTotal) + 0.005} onClick={() => onSave(draft)}><ReceiptText size={17} /> {existing ? "Update invoice" : "Create invoice"}</button></div></div></div>;
}

function RestoreModal({ preview, onClose, onRestore, saving }: { preview: NonNullable<RestorePreview>; onClose: () => void; onRestore: (mode: "merge" | "replace") => void; saving: boolean }) {
  const backup = preview.backup;
  const approved = backup.proposals.filter((proposal) => proposal.approvedSnapshot).length;
  const invoices = backup.proposals.reduce((sum, proposal) => sum + activeInvoices(normalizeProposal(proposal)).length, 0);
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal-card restore-modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><span className="eyebrow">Backup restore</span><h2>Review {preview.fileName}</h2><p>Choose Merge to preserve current data or Replace to restore this backup as the complete workspace.</p></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div><div className="restore-summary"><div><small>Created</small><strong>{dateTimeLabel(backup.exportedAt)}</strong></div><div><small>Services</small><strong>{backup.workspace.services.length}</strong></div><div><small>Proposals</small><strong>{backup.proposals.length}</strong></div><div><small>Approved agreements</small><strong>{approved}</strong></div><div><small>Invoices</small><strong>{invoices}</strong></div></div><div className="restore-options"><button className="restore-choice" disabled={saving} onClick={() => onRestore("merge")}><RefreshCcw size={20} /><span><strong>Merge with current workspace</strong><small>Add missing records, update newer records and never overwrite a newer approved agreement.</small></span></button><button className="restore-choice danger" disabled={saving} onClick={() => onRestore("replace")}><RotateCcw size={20} /><span><strong>Replace current workspace</strong><small>Downloads a safety backup first, then replaces services and proposals.</small></span></button></div></div></div>;
}

function ServiceModal({ service, setService, onClose, onSave }: any) {
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal-card" onMouseDown={(e) => e.stopPropagation()}><div className="modal-heading"><div><span className="eyebrow">Service library</span><h2>{service.title ? "Edit service" : "Add service"}</h2></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div><Field label="Service name"><input autoFocus value={service.title} onChange={(e) => setService({ ...service, title: e.target.value })} /></Field><Field label="Client-facing description"><textarea rows={4} value={service.description} onChange={(e) => setService({ ...service, description: e.target.value })} /></Field><div className="form-grid two"><Field label="Category"><input value={service.category} onChange={(e) => setService({ ...service, category: e.target.value })} /></Field><Field label="Default price"><MoneyInput currency="" value={service.defaultUnitPrice} onChange={(value) => setService({ ...service, defaultUnitPrice: value })} /></Field><Field label="Pricing unit"><select value={service.pricingUnit} onChange={(e) => setService({ ...service, pricingUnit: e.target.value })}>{pricingUnits.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}</select></Field><Field label="Price flexibility"><select value={service.flexibility} onChange={(e) => setService({ ...service, flexibility: e.target.value })}>{flexibilityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field></div><Field label="Hidden minimum price" hint="Used only for the acceptance estimate."><MoneyInput currency="" value={service.minimumUnitPrice || 0} onChange={(value) => setService({ ...service, minimumUnitPrice: value || undefined })} /></Field><div className="modal-options"><label><input type="checkbox" checked={service.defaultOptional} onChange={(e) => setService({ ...service, defaultOptional: e.target.checked })} /> Optional by default</label><label><input type="checkbox" checked={service.recommended} onChange={(e) => setService({ ...service, recommended: e.target.checked })} /> Recommended</label><label><input type="checkbox" checked={service.clientCanRequestPrice !== false} onChange={(e) => setService({ ...service, clientCanRequestPrice: e.target.checked })} /> Allow client price requests</label><label><input type="checkbox" disabled={service.pricingUnit === "fixed"} checked={service.clientCanChangeQuantity !== false && service.pricingUnit !== "fixed"} onChange={(e) => setService({ ...service, clientCanChangeQuantity: e.target.checked })} /> Allow client quantity changes</label><label><input type="checkbox" checked={service.active} onChange={(e) => setService({ ...service, active: e.target.checked })} /> Active</label></div><div className="modal-actions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!service.title} onClick={() => onSave(service)}><Save size={17} /> Save service</button></div></div></div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
function MoneyInput({ currency, value, onChange, disabled = false }: { currency: string; value: number; onChange: (value: number) => void; disabled?: boolean }) { return <div className="money-input">{currency && <span>{currency}</span>}<input disabled={disabled} type="number" min="0" step="0.01" value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(Number(e.target.value))} /></div>; }
function SectionHead({ number, title, text }: { number: string; title: string; text: string }) { return <div className="section-head"><span>{number}</span><div><h2>{title}</h2><p>{text}</p></div></div>; }
function Empty({ icon: Icon, title, text, action, onAction }: { icon: typeof Search; title: string; text: string; action?: string; onAction?: () => void }) { return <div className="empty-state"><div><Icon size={22} /></div><h3>{title}</h3><p>{text}</p>{action && onAction && <button className="secondary compact" onClick={onAction}>{action}</button>}</div>; }
