import type { User } from "@supabase/supabase-js";
import { defaultWorkspace } from "./demo";
import { BackupRestoreResult, Proposal, ScopeFlowBackup, ServiceCatalogItem, WorkspaceSettings } from "./types";
import { normalizeProposal, validateBackup } from "./helpers";
import { platformAdminEmail, supabaseAdmin } from "./supabase";

const ACCOUNTS = "sf_accounts";
const WORKSPACES = "sf_workspaces";
const PROPOSALS = "sf_proposals";

export interface StoredAccount {
  id: string;
  authUserId?: string;
  name: string;
  businessName: string;
  email: string;
  active: boolean;
  isAdmin: boolean;
  createdAt?: string;
  lastSignInAt?: string;
}

export interface AdminAccountSummary extends StoredAccount {
  proposalCount: number;
  approvedCount: number;
  awaitingCount: number;
}

function accountFromRow(row: any): StoredAccount {
  const email = String(row.email || "").toLowerCase();
  return {
    id: String(row.id),
    authUserId: row.auth_user_id ? String(row.auth_user_id) : undefined,
    name: String(row.name || email.split("@")[0] || "ScopeFlow user"),
    businessName: String(row.business_name || "Independent business"),
    email,
    active: Boolean(row.active),
    isAdmin: Boolean(row.is_admin) || email === platformAdminEmail(),
    createdAt: row.created_at ? String(row.created_at) : undefined,
    lastSignInAt: row.last_sign_in_at ? String(row.last_sign_in_at) : undefined,
  };
}

async function ensureWorkspace(ownerId: string, businessName: string, email: string) {
  const client = supabaseAdmin();
  const { data, error } = await client.from(WORKSPACES).select("owner_id").eq("owner_id", ownerId).maybeSingle();
  if (error) throw error;
  if (data) return;
  const settings: WorkspaceSettings = {
    ...structuredClone(defaultWorkspace),
    company: {
      ...structuredClone(defaultWorkspace.company),
      name: businessName || "Independent business",
      email,
    },
  };
  const { error: workspaceError } = await client.from(WORKSPACES).insert({ owner_id: ownerId, data: settings });
  if (workspaceError) throw workspaceError;
}

export async function ensureAccountForAuthUser(user: User): Promise<StoredAccount> {
  const email = String(user.email || "").toLowerCase().trim();
  if (!email) throw new Error("The authenticated account does not have an email address.");
  const metadata = user.user_metadata || {};
  const name = String(metadata.name || metadata.full_name || email.split("@")[0] || "ScopeFlow user").trim();
  const businessName = String(metadata.business_name || metadata.businessName || `${name}'s business`).trim();
  const isAdmin = email === platformAdminEmail();
  const client = supabaseAdmin();

  let { data: existing, error } = await client
    .from(ACCOUNTS)
    .select("id,auth_user_id,name,business_name,email,active,is_admin,created_at,last_sign_in_at")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error) throw error;

  if (!existing) {
    const byEmail = await client
      .from(ACCOUNTS)
      .select("id,auth_user_id,name,business_name,email,active,is_admin,created_at,last_sign_in_at")
      .ilike("email", email)
      .maybeSingle();
    if (byEmail.error) throw byEmail.error;
    existing = byEmail.data;
  }

  if (existing) {
    const active = isAdmin ? true : Boolean(existing.active);
    const { data, error: updateError } = await client
      .from(ACCOUNTS)
      .update({
        auth_user_id: user.id,
        name,
        business_name: existing.business_name || businessName,
        email,
        active,
        is_admin: isAdmin || Boolean(existing.is_admin),
        last_sign_in_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("id,auth_user_id,name,business_name,email,active,is_admin,created_at,last_sign_in_at")
      .single();
    if (updateError) throw updateError;
    const account = accountFromRow(data);
    await ensureWorkspace(account.id, account.businessName, account.email);
    return account;
  }

  const { data, error: insertError } = await client
    .from(ACCOUNTS)
    .insert({
      id: user.id,
      auth_user_id: user.id,
      name,
      business_name: businessName,
      email,
      active: true,
      is_admin: isAdmin,
      last_sign_in_at: new Date().toISOString(),
    })
    .select("id,auth_user_id,name,business_name,email,active,is_admin,created_at,last_sign_in_at")
    .single();
  if (insertError) throw insertError;
  const account = accountFromRow(data);
  await ensureWorkspace(account.id, account.businessName, account.email);
  return account;
}

export async function listPlatformAccounts(): Promise<AdminAccountSummary[]> {
  const client = supabaseAdmin();
  const [{ data: accounts, error: accountsError }, { data: proposals, error: proposalsError }] = await Promise.all([
    client.from(ACCOUNTS).select("id,auth_user_id,name,business_name,email,active,is_admin,created_at,last_sign_in_at").order("created_at", { ascending: false }),
    client.from(PROPOSALS).select("owner_id,status"),
  ]);
  if (accountsError) throw accountsError;
  if (proposalsError) throw proposalsError;
  const counts = new Map<string, { total: number; approved: number; awaiting: number }>();
  for (const proposal of proposals || []) {
    const ownerId = String(proposal.owner_id);
    const current = counts.get(ownerId) || { total: 0, approved: 0, awaiting: 0 };
    current.total += 1;
    if (proposal.status === "approved") current.approved += 1;
    if (proposal.status === "awaiting_client" || proposal.status === "needs_response") current.awaiting += 1;
    counts.set(ownerId, current);
  }
  return (accounts || []).map((row: any) => {
    const account = accountFromRow(row);
    const count = counts.get(account.id) || { total: 0, approved: 0, awaiting: 0 };
    return { ...account, proposalCount: count.total, approvedCount: count.approved, awaitingCount: count.awaiting };
  });
}

export async function setAccountActive(accountId: string, active: boolean) {
  const { data, error } = await supabaseAdmin()
    .from(ACCOUNTS)
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", accountId)
    .select("id,auth_user_id,name,business_name,email,active,is_admin,created_at,last_sign_in_at")
    .single();
  if (error) throw error;
  return accountFromRow(data);
}

export async function deleteOwnAccount(accountId: string) {
  const client = supabaseAdmin();
  const { data: row, error: accountError } = await client
    .from(ACCOUNTS)
    .select("id,auth_user_id,name,business_name,email,active,is_admin,created_at,last_sign_in_at")
    .eq("id", accountId)
    .single();
  if (accountError) throw accountError;
  const account = accountFromRow(row);
  if (account.isAdmin || account.email === platformAdminEmail()) {
    throw new Error("The protected platform administrator account cannot be deleted.");
  }
  if (!account.authUserId) throw new Error("This account is not connected to a valid authentication record.");

  // Disable access first so a partially completed deletion never leaves an active account.
  const { error: disableError } = await client.from(ACCOUNTS).update({ active: false, updated_at: new Date().toISOString() }).eq("id", accountId);
  if (disableError) throw disableError;

  const { error: authError } = await client.auth.admin.deleteUser(account.authUserId);
  if (authError) {
    await client.from(ACCOUNTS).update({ active: true, updated_at: new Date().toISOString() }).eq("id", accountId);
    throw authError;
  }

  const { error: proposalsError } = await client.from(PROPOSALS).delete().eq("owner_id", accountId);
  if (proposalsError) throw proposalsError;
  const { error: workspaceError } = await client.from(WORKSPACES).delete().eq("owner_id", accountId);
  if (workspaceError) throw workspaceError;
  const { error: deleteAccountError } = await client.from(ACCOUNTS).delete().eq("id", accountId);
  if (deleteAccountError) throw deleteAccountError;
  return { deleted: true };
}

export async function listCloudProposals(ownerId: string): Promise<Proposal[]> {
  const { data, error } = await supabaseAdmin().from(PROPOSALS).select("data").eq("owner_id", ownerId).order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((row: any) => normalizeProposal(row.data as Proposal));
}

export async function getCloudProposal(ownerId: string, id: string): Promise<Proposal | null> {
  const { data, error } = await supabaseAdmin().from(PROPOSALS).select("data").eq("owner_id", ownerId).eq("id", id).maybeSingle();
  if (error) throw error;
  return data?.data ? normalizeProposal(data.data as Proposal) : null;
}

export async function getCloudProposalByToken(token: string): Promise<Proposal | null> {
  const { data, error } = await supabaseAdmin().from(PROPOSALS).select("data").eq("public_token", token).maybeSingle();
  if (error) throw error;
  return data?.data ? normalizeProposal(data.data as Proposal) : null;
}

export async function saveCloudProposal(ownerId: string, proposal: Proposal): Promise<Proposal> {
  const next = normalizeProposal({ ...proposal, updatedAt: new Date().toISOString() });
  const invoiceTokens = (next.invoices || []).map((invoice) => invoice.publicToken).filter(Boolean);
  const { error } = await supabaseAdmin().from(PROPOSALS).upsert({ id: next.id, owner_id: ownerId, public_token: next.publicToken, invoice_tokens: invoiceTokens, status: next.status, client_email: next.client.email, updated_at: next.updatedAt, data: next });
  if (error) throw error;
  return next;
}

export async function getCloudProposalByInvoiceToken(token: string): Promise<Proposal | null> {
  const client = supabaseAdmin();
  const indexed = await client.from(PROPOSALS).select("data").contains("invoice_tokens", [token]).maybeSingle();
  if (indexed.error) throw indexed.error;
  if (indexed.data?.data) return normalizeProposal(indexed.data.data as Proposal);

  // Legacy ScopeFlow invoices reused the proposal token before invoice_tokens existed.
  const legacy = await client.from(PROPOSALS).select("data").eq("public_token", token).maybeSingle();
  if (legacy.error) throw legacy.error;
  if (legacy.data?.data) {
    const proposal = normalizeProposal(legacy.data.data as Proposal);
    if (proposal.invoices?.some((invoice) => invoice.publicToken === token)) return proposal;
  }

  return null;
}

export async function deleteCloudProposal(ownerId: string, id: string) {
  const { error } = await supabaseAdmin().from(PROPOSALS).delete().eq("owner_id", ownerId).eq("id", id);
  if (error) throw error;
}

export async function getWorkspaceSettings(ownerId: string): Promise<WorkspaceSettings> {
  const { data, error } = await supabaseAdmin().from(WORKSPACES).select("data").eq("owner_id", ownerId).maybeSingle();
  if (error) throw error;
  if (!data?.data) {
    const settings = structuredClone(defaultWorkspace);
    await saveWorkspaceSettings(ownerId, settings);
    return settings;
  }
  const stored = data.data as Partial<WorkspaceSettings>;
  return {
    company: { ...defaultWorkspace.company, ...(stored.company || {}) },
    services: Array.isArray(stored.services) ? stored.services as ServiceCatalogItem[] : defaultWorkspace.services,
  };
}

export async function saveWorkspaceSettings(ownerId: string, settings: WorkspaceSettings) {
  const { error } = await supabaseAdmin().from(WORKSPACES).upsert({ owner_id: ownerId, data: settings, updated_at: new Date().toISOString() });
  if (error) throw error;
  await supabaseAdmin().from(ACCOUNTS).update({ business_name: settings.company.name, updated_at: new Date().toISOString() }).eq("id", ownerId);
  return settings;
}


export async function restoreCloudBackup(ownerId: string, raw: unknown, mode: "merge" | "replace") {
  const backup = validateBackup(raw);
  const currentSettings = await getWorkspaceSettings(ownerId);
  const currentProposals = await listCloudProposals(ownerId);
  if (mode === "replace") {
    const client = supabaseAdmin();
    const { error: deleteError } = await client.from(PROPOSALS).delete().eq("owner_id", ownerId);
    if (deleteError) throw deleteError;
    await saveWorkspaceSettings(ownerId, backup.workspace);
    for (const proposal of backup.proposals) await saveCloudProposal(ownerId, proposal);
    const result: BackupRestoreResult = { mode, servicesAdded: backup.workspace.services.length, servicesUpdated: 0, proposalsAdded: backup.proposals.length, proposalsUpdated: 0, proposalsSkipped: 0 };
    return { settings: backup.workspace, proposals: backup.proposals, result };
  }

  const serviceMap = new Map(currentSettings.services.map((service) => [service.id, service]));
  let servicesAdded = 0;
  let servicesUpdated = 0;
  for (const service of backup.workspace.services) {
    if (serviceMap.has(service.id)) servicesUpdated += 1; else servicesAdded += 1;
    serviceMap.set(service.id, service);
  }
  const settings: WorkspaceSettings = { company: { ...currentSettings.company, ...backup.workspace.company }, services: Array.from(serviceMap.values()) };
  await saveWorkspaceSettings(ownerId, settings);

  const proposalMap = new Map(currentProposals.map((proposal) => [proposal.id, proposal]));
  let proposalsAdded = 0;
  let proposalsUpdated = 0;
  let proposalsSkipped = 0;
  for (const incoming of backup.proposals.map(normalizeProposal)) {
    const existing = proposalMap.get(incoming.id);
    if (!existing) { await saveCloudProposal(ownerId, incoming); proposalMap.set(incoming.id, incoming); proposalsAdded += 1; continue; }
    if (existing.approvedSnapshot && existing.updatedAt >= incoming.updatedAt) { proposalsSkipped += 1; continue; }
    await saveCloudProposal(ownerId, incoming); proposalMap.set(incoming.id, incoming); proposalsUpdated += 1;
  }
  const result: BackupRestoreResult = { mode, servicesAdded, servicesUpdated, proposalsAdded, proposalsUpdated, proposalsSkipped };
  return { settings, proposals: Array.from(proposalMap.values()), result };
}
