import type { NeonAuthIdentity } from "./neon-auth";
import {
  neonDeleteCloudProposal,
  neonDeleteOwnAccount,
  neonEnsureAccountForAuthUser,
  neonGetCloudProposal,
  neonGetCloudProposalByInvoiceToken,
  neonGetCloudProposalByToken,
  neonGetProposalOwnerById,
  neonGetProposalOwnerByToken,
  neonGetWorkspaceSettings,
  neonListCloudProposals,
  neonListPlatformAccounts,
  neonRestoreCloudBackup,
  neonSaveCloudProposal,
  neonSaveWorkspaceSettings,
  neonSetAccountActive,
} from "./neon-store";
import type { Proposal, WorkspaceSettings } from "./types";

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

export async function ensureAccountForAuthUser(user: NeonAuthIdentity, businessName?: string): Promise<StoredAccount> {
  return neonEnsureAccountForAuthUser(user, businessName);
}

export async function listPlatformAccounts(): Promise<AdminAccountSummary[]> {
  return neonListPlatformAccounts();
}

export async function setAccountActive(accountId: string, active: boolean) {
  return neonSetAccountActive(accountId, active);
}

export async function deleteOwnAccount(accountId: string) {
  return neonDeleteOwnAccount(accountId);
}

export async function listCloudProposals(ownerId: string): Promise<Proposal[]> {
  return neonListCloudProposals(ownerId);
}

export async function getCloudProposal(ownerId: string, id: string): Promise<Proposal | null> {
  return neonGetCloudProposal(ownerId, id);
}

export async function getCloudProposalByToken(token: string): Promise<Proposal | null> {
  return neonGetCloudProposalByToken(token);
}

export async function saveCloudProposal(ownerId: string, proposal: Proposal): Promise<Proposal> {
  return neonSaveCloudProposal(ownerId, proposal);
}

export async function getCloudProposalByInvoiceToken(token: string): Promise<Proposal | null> {
  return neonGetCloudProposalByInvoiceToken(token);
}

export async function getProposalOwnerById(id: string): Promise<string | null> {
  return neonGetProposalOwnerById(id);
}

export async function getProposalOwnerByToken(token: string): Promise<string | null> {
  return neonGetProposalOwnerByToken(token);
}

export async function deleteCloudProposal(ownerId: string, id: string) {
  return neonDeleteCloudProposal(ownerId, id);
}

export async function getWorkspaceSettings(ownerId: string): Promise<WorkspaceSettings> {
  return neonGetWorkspaceSettings(ownerId);
}

export async function saveWorkspaceSettings(ownerId: string, settings: WorkspaceSettings) {
  return neonSaveWorkspaceSettings(ownerId, settings);
}

export async function restoreCloudBackup(ownerId: string, raw: unknown, mode: "merge" | "replace") {
  return neonRestoreCloudBackup(ownerId, raw, mode);
}
