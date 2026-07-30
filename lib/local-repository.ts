import { demoProposals, defaultWorkspace } from "./demo";
import { createBackup, normalizeProposal, validateBackup } from "./helpers";
import { BackupRestoreResult, Proposal, ScopeFlowBackup, WorkspaceSettings } from "./types";

const PROPOSALS_KEY = "scopeflow_proposals_final";
const WORKSPACE_KEY = "scopeflow_workspace_final";

function parseProposals(raw: string | null): Proposal[] {
  if (!raw) return demoProposals.map(normalizeProposal);
  try { return (JSON.parse(raw) as Proposal[]).map(normalizeProposal); } catch { return demoProposals.map(normalizeProposal); }
}

function mergeBackup(currentWorkspace: WorkspaceSettings, currentProposals: Proposal[], backup: ScopeFlowBackup): { settings: WorkspaceSettings; proposals: Proposal[]; result: BackupRestoreResult } {
  const serviceMap = new Map(currentWorkspace.services.map((service) => [service.id, service]));
  let servicesAdded = 0;
  let servicesUpdated = 0;
  for (const service of backup.workspace.services) {
    if (serviceMap.has(service.id)) servicesUpdated += 1; else servicesAdded += 1;
    serviceMap.set(service.id, service);
  }
  const proposalMap = new Map(currentProposals.map((proposal) => [proposal.id, proposal]));
  let proposalsAdded = 0;
  let proposalsUpdated = 0;
  let proposalsSkipped = 0;
  for (const incoming of backup.proposals.map(normalizeProposal)) {
    const existing = proposalMap.get(incoming.id);
    if (!existing) { proposalMap.set(incoming.id, incoming); proposalsAdded += 1; continue; }
    if (existing.approvedSnapshot && existing.updatedAt >= incoming.updatedAt) { proposalsSkipped += 1; continue; }
    proposalMap.set(incoming.id, incoming); proposalsUpdated += 1;
  }
  return {
    settings: { company: { ...currentWorkspace.company, ...backup.workspace.company }, services: Array.from(serviceMap.values()) },
    proposals: Array.from(proposalMap.values()),
    result: { mode: "merge", servicesAdded, servicesUpdated, proposalsAdded, proposalsUpdated, proposalsSkipped },
  };
}

export const localRepository = {
  list(): Proposal[] {
    const items = parseProposals(localStorage.getItem(PROPOSALS_KEY));
    if (!localStorage.getItem(PROPOSALS_KEY)) localStorage.setItem(PROPOSALS_KEY, JSON.stringify(items));
    return items;
  },
  get(id: string) { return this.list().find((proposal) => proposal.id === id) || null; },
  getByToken(token: string) { return this.list().find((proposal) => proposal.publicToken === token) || null; },
  getByInvoiceToken(token: string) { return this.list().find((proposal) => normalizeProposal(proposal).invoices?.some((invoice) => invoice.publicToken === token)) || null; },
  save(proposal: Proposal) {
    const next = normalizeProposal({ ...proposal, updatedAt: new Date().toISOString() });
    const items = this.list();
    const index = items.findIndex((item) => item.id === proposal.id);
    if (index >= 0) items[index] = next; else items.unshift(next);
    localStorage.setItem(PROPOSALS_KEY, JSON.stringify(items));
    return next;
  },
  remove(id: string) { localStorage.setItem(PROPOSALS_KEY, JSON.stringify(this.list().filter((item) => item.id !== id))); },
  workspace(): WorkspaceSettings {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (!raw) { localStorage.setItem(WORKSPACE_KEY, JSON.stringify(defaultWorkspace)); return defaultWorkspace; }
    try {
      const stored = JSON.parse(raw) as Partial<WorkspaceSettings>;
      return { company: { ...defaultWorkspace.company, ...(stored.company || {}) }, services: Array.isArray(stored.services) ? stored.services : defaultWorkspace.services };
    } catch { return defaultWorkspace; }
  },
  saveWorkspace(settings: WorkspaceSettings) { localStorage.setItem(WORKSPACE_KEY, JSON.stringify(settings)); return settings; },
  exportAll() { return createBackup(this.workspace(), this.list()); },
  restore(raw: unknown, mode: "merge" | "replace") {
    const backup = validateBackup(raw);
    if (mode === "replace") {
      localStorage.setItem(WORKSPACE_KEY, JSON.stringify(backup.workspace));
      localStorage.setItem(PROPOSALS_KEY, JSON.stringify(backup.proposals));
      const result: BackupRestoreResult = {
        mode,
        servicesAdded: backup.workspace.services.length,
        servicesUpdated: 0,
        proposalsAdded: backup.proposals.length,
        proposalsUpdated: 0,
        proposalsSkipped: 0,
      };
      return { settings: backup.workspace, proposals: backup.proposals, result };
    }
    const merged = mergeBackup(this.workspace(), this.list(), backup);
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(merged.settings));
    localStorage.setItem(PROPOSALS_KEY, JSON.stringify(merged.proposals));
    return merged;
  },
};
