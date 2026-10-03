import { defaultWorkspace } from "./demo";
import { normalizeProposal, validateBackup } from "./helpers";
import type { NeonAuthIdentity } from "./neon-auth";
import { neonSql } from "./neon";
import { platformAdminEmail } from "./platform";
import type { AdminAccountSummary, StoredAccount } from "./cloud-store";
import type { BackupRestoreResult, Proposal, ServiceCatalogItem, WorkspaceSettings } from "./types";

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
  const sql = neonSql();
  const existing = await sql`select owner_id from sf_workspaces where owner_id = ${ownerId} limit 1`;
  if (existing.length) return;
  const settings: WorkspaceSettings = {
    ...structuredClone(defaultWorkspace),
    company: {
      ...structuredClone(defaultWorkspace.company),
      name: businessName || "Independent business",
      email,
    },
  };
  await sql`
    insert into sf_workspaces (owner_id, data)
    values (${ownerId}, ${JSON.stringify(settings)}::jsonb)
    on conflict (owner_id) do nothing
  `;
}

export async function neonEnsureAccountForAuthUser(user: NeonAuthIdentity, businessNameOverride?: string): Promise<StoredAccount> {
  const email = String(user.email || "").toLowerCase().trim();
  if (!email) throw new Error("The authenticated account does not have an email address.");
  const name = String(user.name || email.split("@")[0] || "ScopeFlow user").trim();
  const businessName = String(businessNameOverride || `${name}'s business`).trim();
  const isAdmin = email === platformAdminEmail();
  const sql = neonSql();

  let rows = await sql`
    select id,auth_user_id,name,business_name,email,active,is_admin,created_at,last_sign_in_at
    from sf_accounts where auth_user_id = ${user.id} limit 1
  `;

  if (!rows.length) {
    rows = await sql`
      select id,auth_user_id,name,business_name,email,active,is_admin,created_at,last_sign_in_at
      from sf_accounts where lower(email) = ${email} limit 1
    `;
  }

  if (rows.length) {
    const existing: any = rows[0];
    const active = isAdmin ? true : Boolean(existing.active);
    const updated = await sql`
      update sf_accounts
      set auth_user_id=${user.id},
          name=${name},
          business_name=${businessNameOverride || existing.business_name || businessName},
          email=${email},
          active=${active},
          is_admin=${isAdmin || Boolean(existing.is_admin)},
          last_sign_in_at=now(),
          updated_at=now()
      where id=${String(existing.id)}
      returning id,auth_user_id,name,business_name,email,active,is_admin,created_at,last_sign_in_at
    `;
    const account = accountFromRow(updated[0]);
    if (account.active) await ensureWorkspace(account.id, account.businessName, account.email);
    return account;
  }

  const inserted = await sql`
    insert into sf_accounts (id,auth_user_id,name,business_name,email,active,is_admin,last_sign_in_at)
    values (${user.id},${user.id},${name},${businessName},${email},true,${isAdmin},now())
    returning id,auth_user_id,name,business_name,email,active,is_admin,created_at,last_sign_in_at
  `;
  const account = accountFromRow(inserted[0]);
  await ensureWorkspace(account.id, account.businessName, account.email);
  return account;
}

export async function neonListPlatformAccounts(): Promise<AdminAccountSummary[]> {
  const sql = neonSql();
  const [accounts, proposalRows] = await Promise.all([
    sql`select id,auth_user_id,name,business_name,email,active,is_admin,created_at,last_sign_in_at from sf_accounts order by created_at desc`,
    sql`select owner_id,status from sf_proposals`,
  ]);
  const counts = new Map<string, { total: number; approved: number; awaiting: number }>();
  for (const proposal of proposalRows as any[]) {
    const ownerId = String(proposal.owner_id);
    const current = counts.get(ownerId) || { total: 0, approved: 0, awaiting: 0 };
    current.total += 1;
    if (proposal.status === "approved") current.approved += 1;
    if (proposal.status === "awaiting_client" || proposal.status === "needs_response") current.awaiting += 1;
    counts.set(ownerId, current);
  }
  return (accounts as any[]).map((row) => {
    const account = accountFromRow(row);
    const count = counts.get(account.id) || { total: 0, approved: 0, awaiting: 0 };
    return { ...account, proposalCount: count.total, approvedCount: count.approved, awaitingCount: count.awaiting };
  });
}

export async function neonSetAccountActive(accountId: string, active: boolean) {
  const rows = await neonSql()`
    update sf_accounts set active=${active}, updated_at=now()
    where id=${accountId}
    returning id,auth_user_id,name,business_name,email,active,is_admin,created_at,last_sign_in_at
  `;
  if (!rows.length) throw new Error("Account not found.");
  return accountFromRow(rows[0]);
}

export async function neonDeleteOwnAccount(accountId: string) {
  const sql = neonSql();
  const rows = await sql`
    select id,auth_user_id,name,business_name,email,active,is_admin,created_at,last_sign_in_at
    from sf_accounts where id=${accountId} limit 1
  `;
  if (!rows.length) throw new Error("Account not found.");
  const account = accountFromRow(rows[0]);
  if (account.isAdmin || account.email === platformAdminEmail()) {
    throw new Error("The protected platform administrator account cannot be deleted.");
  }

  await sql`update sf_accounts set active=false, updated_at=now() where id=${accountId}`;
  await sql`delete from sf_proposals where owner_id=${accountId}`;
  await sql`delete from sf_workspaces where owner_id=${accountId}`;
  return { deleted: true };
}

export async function neonListCloudProposals(ownerId: string): Promise<Proposal[]> {
  const rows = await neonSql()`select data from sf_proposals where owner_id=${ownerId} order by updated_at desc`;
  return (rows as any[]).map((row) => normalizeProposal(row.data as Proposal));
}

export async function neonGetCloudProposal(ownerId: string, id: string): Promise<Proposal | null> {
  const rows = await neonSql()`select data from sf_proposals where owner_id=${ownerId} and id=${id} limit 1`;
  return rows[0]?.data ? normalizeProposal(rows[0].data as Proposal) : null;
}

export async function neonGetCloudProposalByToken(token: string): Promise<Proposal | null> {
  const rows = await neonSql()`select data from sf_proposals where public_token=${token} limit 1`;
  return rows[0]?.data ? normalizeProposal(rows[0].data as Proposal) : null;
}

export async function neonGetProposalOwnerById(id: string): Promise<string | null> {
  const rows = await neonSql()`select owner_id from sf_proposals where id=${id} limit 1`;
  return rows[0]?.owner_id ? String(rows[0].owner_id) : null;
}

export async function neonGetProposalOwnerByToken(token: string): Promise<string | null> {
  const rows = await neonSql()`select owner_id from sf_proposals where public_token=${token} limit 1`;
  return rows[0]?.owner_id ? String(rows[0].owner_id) : null;
}

export async function neonSaveCloudProposal(ownerId: string, proposal: Proposal): Promise<Proposal> {
  const next = normalizeProposal({ ...proposal, updatedAt: new Date().toISOString() });
  const invoiceTokens = (next.invoices || []).map((invoice) => invoice.publicToken).filter(Boolean);
  await neonSql()`
    insert into sf_proposals (id,owner_id,public_token,invoice_tokens,status,client_email,updated_at,data)
    values (${next.id},${ownerId},${next.publicToken},${invoiceTokens},${next.status},${next.client.email},${next.updatedAt},${JSON.stringify(next)}::jsonb)
    on conflict (id) do update set
      owner_id=excluded.owner_id,
      public_token=excluded.public_token,
      invoice_tokens=excluded.invoice_tokens,
      status=excluded.status,
      client_email=excluded.client_email,
      updated_at=excluded.updated_at,
      data=excluded.data
  `;
  return next;
}

export async function neonGetCloudProposalByInvoiceToken(token: string): Promise<Proposal | null> {
  const sql = neonSql();
  const indexed = await sql`select data from sf_proposals where ${token} = any(invoice_tokens) limit 1`;
  if (indexed[0]?.data) return normalizeProposal(indexed[0].data as Proposal);

  const legacy = await sql`select data from sf_proposals where public_token=${token} limit 1`;
  if (legacy[0]?.data) {
    const proposal = normalizeProposal(legacy[0].data as Proposal);
    if (proposal.invoices?.some((invoice) => invoice.publicToken === token)) return proposal;
  }
  return null;
}

export async function neonDeleteCloudProposal(ownerId: string, id: string) {
  await neonSql()`delete from sf_proposals where owner_id=${ownerId} and id=${id}`;
}

export async function neonGetWorkspaceSettings(ownerId: string): Promise<WorkspaceSettings> {
  const rows = await neonSql()`select data from sf_workspaces where owner_id=${ownerId} limit 1`;
  if (!rows[0]?.data) {
    const settings = structuredClone(defaultWorkspace);
    await neonSaveWorkspaceSettings(ownerId, settings);
    return settings;
  }
  const stored = rows[0].data as Partial<WorkspaceSettings>;
  return {
    company: { ...defaultWorkspace.company, ...(stored.company || {}) },
    services: Array.isArray(stored.services) ? stored.services as ServiceCatalogItem[] : defaultWorkspace.services,
  };
}

export async function neonSaveWorkspaceSettings(ownerId: string, settings: WorkspaceSettings) {
  const sql = neonSql();
  await sql`
    insert into sf_workspaces (owner_id,data,updated_at)
    values (${ownerId},${JSON.stringify(settings)}::jsonb,now())
    on conflict (owner_id) do update set data=excluded.data, updated_at=now()
  `;
  await sql`update sf_accounts set business_name=${settings.company.name}, updated_at=now() where id=${ownerId}`;
  return settings;
}

export async function neonRestoreCloudBackup(ownerId: string, raw: unknown, mode: "merge" | "replace") {
  const backup = validateBackup(raw);
  const currentSettings = await neonGetWorkspaceSettings(ownerId);
  const currentProposals = await neonListCloudProposals(ownerId);

  if (mode === "replace") {
    await neonSql()`delete from sf_proposals where owner_id=${ownerId}`;
    await neonSaveWorkspaceSettings(ownerId, backup.workspace);
    for (const proposal of backup.proposals) await neonSaveCloudProposal(ownerId, proposal);
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

  const serviceMap = new Map(currentSettings.services.map((service) => [service.id, service]));
  let servicesAdded = 0;
  let servicesUpdated = 0;
  for (const service of backup.workspace.services) {
    if (serviceMap.has(service.id)) servicesUpdated += 1;
    else servicesAdded += 1;
    serviceMap.set(service.id, service);
  }

  const settings: WorkspaceSettings = {
    company: { ...currentSettings.company, ...backup.workspace.company },
    services: Array.from(serviceMap.values()),
  };
  await neonSaveWorkspaceSettings(ownerId, settings);

  const proposalMap = new Map(currentProposals.map((proposal) => [proposal.id, proposal]));
  let proposalsAdded = 0;
  let proposalsUpdated = 0;
  let proposalsSkipped = 0;

  for (const incoming of backup.proposals.map(normalizeProposal)) {
    const existing = proposalMap.get(incoming.id);
    if (!existing) {
      await neonSaveCloudProposal(ownerId, incoming);
      proposalMap.set(incoming.id, incoming);
      proposalsAdded += 1;
      continue;
    }
    if (existing.approvedSnapshot && existing.updatedAt >= incoming.updatedAt) {
      proposalsSkipped += 1;
      continue;
    }
    await neonSaveCloudProposal(ownerId, incoming);
    proposalMap.set(incoming.id, incoming);
    proposalsUpdated += 1;
  }

  const result: BackupRestoreResult = {
    mode,
    servicesAdded,
    servicesUpdated,
    proposalsAdded,
    proposalsUpdated,
    proposalsSkipped,
  };
  return { settings, proposals: Array.from(proposalMap.values()), result };
}
