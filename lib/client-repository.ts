"use client";

import {
  acceptanceProbability, addHistory, approvalReference, approvedSnapshotFor, currentUnitPrice,
  invoiceByToken, normalizeProposal, totalsFor,
} from "./helpers";
import { localRepository } from "./local-repository";
import { BackupRestoreResult, InvoiceInfo, Proposal, ScopeFlowBackup, WorkspaceSettings } from "./types";

async function json<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as any).error || "Request failed");
  return body as T;
}

export async function cloudMode() {
  try { return (await json<{ cloud: boolean }>(await fetch("/api/config", { cache: "no-store" }))).cloud; }
  catch { return false; }
}

export const workspaceRepository = {
  async get(cloud: boolean): Promise<WorkspaceSettings> {
    if (!cloud) return localRepository.workspace();
    return (await json<{ settings: WorkspaceSettings }>(await fetch("/api/workspace", { cache: "no-store" }))).settings;
  },
  async save(settings: WorkspaceSettings, cloud: boolean) {
    if (!cloud) return localRepository.saveWorkspace(settings);
    return (await json<{ settings: WorkspaceSettings }>(await fetch("/api/workspace", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) }))).settings;
  },
};

export const backupRepository = {
  async restore(backup: ScopeFlowBackup, mode: "merge" | "replace", cloud: boolean) {
    if (!cloud) return localRepository.restore(backup, mode);
    return json<{ settings: WorkspaceSettings; proposals: Proposal[]; result: BackupRestoreResult }>(await fetch("/api/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ backup, mode }),
    }));
  },
};

export const proposalsRepository = {
  async list(cloud: boolean) {
    if (!cloud) return localRepository.list();
    return (await json<{ proposals: Proposal[] }>(await fetch("/api/proposals", { cache: "no-store" }))).proposals.map(normalizeProposal);
  },
  async save(proposal: Proposal, cloud: boolean) {
    const normalized = normalizeProposal(proposal);
    if (!cloud) return localRepository.save(normalized);
    const response = await fetch(`/api/proposals/${normalized.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(normalized) });
    if (response.status === 404) {
      return normalizeProposal((await json<{ proposal: Proposal }>(await fetch("/api/proposals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(normalized) }))).proposal);
    }
    return normalizeProposal((await json<{ proposal: Proposal }>(response)).proposal);
  },
  async remove(id: string, cloud: boolean) {
    if (!cloud) return localRepository.remove(id);
    await json(await fetch(`/api/proposals/${id}`, { method: "DELETE" }));
  },
  async getPublic(token: string, cloud: boolean, preview = false, surface: "proposal" | "invoice" = "proposal") {
    if (surface === "invoice") return this.getInvoicePublic(token, cloud, preview).then((result) => result.proposal);
    if (!cloud) {
      let proposal = localRepository.getByToken(token);
      if (!proposal) throw new Error("Proposal not found in this browser.");
      proposal = normalizeProposal(proposal);
      if (!preview && proposal.status === "awaiting_client") {
        const now = new Date().toISOString();
        proposal = { ...proposal, responseState: proposal.responseState === "sent" ? "viewed" : proposal.responseState, firstViewedAt: proposal.firstViewedAt || now, lastViewedAt: now, viewCount: (proposal.viewCount || 0) + 1 };
        localRepository.save(proposal);
      }
      return proposal;
    }
    const query = preview ? "?preview=1" : "";
    return normalizeProposal((await json<{ proposal: Proposal }>(await fetch(`/api/public/${token}${query}`, { cache: "no-store" }))).proposal);
  },
  async getInvoicePublic(token: string, cloud: boolean, preview = false): Promise<{ proposal: Proposal; invoice: InvoiceInfo }> {
    if (!cloud) {
      let proposal = localRepository.getByInvoiceToken(token);
      if (!proposal) throw new Error("Invoice not found in this browser.");
      proposal = normalizeProposal(proposal);
      const invoice = invoiceByToken(proposal, token);
      if (!invoice || invoice.linkEnabled === false) throw new Error("This invoice link is no longer available.");
      if (!preview) {
        const now = new Date().toISOString();
        const invoices = proposal.invoices!.map((item) => item.id === invoice.id ? { ...item, firstViewedAt: item.firstViewedAt || now, lastViewedAt: now, viewCount: (item.viewCount || 0) + 1 } : item);
        proposal = localRepository.save({ ...proposal, invoices });
      }
      return { proposal, invoice: invoiceByToken(proposal, token)! };
    }
    const query = preview ? "?preview=1" : "";
    const result = await json<{ proposal: Proposal; invoice: InvoiceInfo }>(await fetch(`/api/invoices/${token}${query}`, { cache: "no-store" }));
    return { proposal: normalizeProposal(result.proposal), invoice: result.invoice };
  },
  async reportInvoicePayment(token: string, payload: { name: string; email: string; note?: string }, cloud: boolean) {
    if (!cloud) {
      let proposal = localRepository.getByInvoiceToken(token);
      if (!proposal) throw new Error("Invoice not found in this browser.");
      proposal = normalizeProposal(proposal);
      const now = new Date().toISOString();
      proposal.invoices = proposal.invoices!.map((invoice) => invoice.publicToken === token ? { ...invoice, status: "payment_reported", paymentReportedAt: now, paymentReportedBy: payload.name, paymentReportedEmail: payload.email, note: payload.note || invoice.note, updatedAt: now } : invoice);
      proposal = addHistory(proposal, "Payment reported", `${payload.name} reported payment for ${invoiceByToken(proposal, token)?.number || "an invoice"}.`, "client");
      return localRepository.save(proposal);
    }
    return normalizeProposal((await json<{ proposal: Proposal }>(await fetch(`/api/invoices/${token}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "report_payment", ...payload }),
    }))).proposal);
  },
  async estimate(token: string, offers: Array<{ id: string; unitPrice: number }>, cloud: boolean, proposal?: Proposal) {
    if (!cloud && proposal) return Object.fromEntries(proposal.items.map((item) => [item.id, acceptanceProbability(item, offers.find((offer) => offer.id === item.id)?.unitPrice ?? currentUnitPrice(item))]));
    return (await json<{ probabilities: Record<string, number> }>(await fetch(`/api/public/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "estimate", offers }) }))).probabilities;
  },
  async publicAction(token: string, payload: Record<string, unknown>, cloud: boolean) {
    if (!cloud) {
      let proposal = localRepository.getByToken(token);
      if (!proposal) throw new Error("Proposal not found in this browser.");
      proposal = normalizeProposal(proposal);
      const choices = new Map((Array.isArray(payload.items) ? payload.items : []).map((item: any) => [String(item.id), item]));
      proposal.items = proposal.items.map((item) => {
        const choice: any = choices.get(item.id);
        if (!choice) return item;
        const base = currentUnitPrice(item);
        const offer = Number(choice.clientOfferUnitPrice);
        const hasOffer = item.clientCanRequestPrice !== false && Number.isFinite(offer) && offer >= 0 && Math.abs(offer - base) > 0.005;
        const quantity = item.clientCanChangeQuantity === false ? item.quantity : Math.max(1, Number(choice.quantity || item.quantity));
        return { ...item, selected: item.optional ? Boolean(choice.selected) : true, quantity, clientOfferUnitPrice: hasOffer ? offer : undefined, acceptanceProbability: hasOffer ? acceptanceProbability(item, offer) : undefined };
      });
      const now = new Date().toISOString();
      if (payload.action === "approve") {
        proposal = addHistory(proposal, proposal.documentType === "change_order" ? "Additional work approved" : "Proposal approved", `${String(payload.signedBy)} approved version ${proposal.version}.`, "client");
        proposal.status = "approved";
        proposal.responseState = "none";
        proposal.clientNote = String(payload.note || "");
        proposal.approval = { signedBy: String(payload.signedBy || ""), email: String(payload.email || ""), signedAt: now, note: String(payload.note || "Approved with the selected scope."), termsAccepted: true, reference: approvalReference(proposal) };
        proposal.approvedSnapshot = approvedSnapshotFor(proposal);
      } else {
        const hasPriceRequest = proposal.items.some((item) => item.clientOfferUnitPrice !== undefined);
        proposal = addHistory(proposal, hasPriceRequest ? "Price request received" : "Change request received", String(payload.note || "Client requested a revision."), "client");
        proposal.status = "needs_response";
        proposal.responseState = hasPriceRequest ? "price_request" : "change_request";
        proposal.clientNote = String(payload.note || "");
        if (hasPriceRequest) proposal.priceRequest = { requestedBy: String(payload.signedBy || ""), email: String(payload.email || ""), requestedAt: now, note: String(payload.note || ""), originalTotal: totalsFor(proposal, "accepted").total, requestedTotal: totalsFor(proposal, "client_offer").total };
      }
      return localRepository.save(proposal);
    }
    return normalizeProposal((await json<{ proposal: Proposal }>(await fetch(`/api/public/${token}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }))).proposal);
  },
};
