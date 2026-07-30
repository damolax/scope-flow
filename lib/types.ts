export type ProposalStatus = "draft" | "awaiting_client" | "needs_response" | "approved" | "closed";
export type ProposalResponseState = "none" | "sent" | "viewed" | "price_request" | "change_request" | "counteroffer" | "request_accepted" | "request_declined" | "expired" | "archived";
export type CurrencyCode = "USD" | "CAD" | "EUR" | "GBP" | "NGN" | "AUD" | "NZD" | "ZAR";
export type PricingUnit = "fixed" | "item" | "hour" | "day" | "month";
export type PriceFlexibility = "fixed" | "slight" | "flexible" | "custom";
export type DocumentType = "proposal" | "change_order";
export type InvoiceStatus = "unpaid" | "payment_reported" | "paid" | "cancelled";
export type InvoiceKind = "full" | "deposit" | "milestone" | "balance" | "custom";
export type DeliveryDayMode = "calendar_days" | "business_days";
export type DeliveryStartTrigger = "full_payment" | "deposit" | "manual";
export type ProjectStatus = "awaiting_payment" | "scheduled" | "in_progress" | "paused" | "ready_for_review" | "delivered" | "completed";

export interface CompanyProfile {
  name: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  accent: string;
  logoDataUrl?: string;
  currency: CurrencyCode;
  defaultTerms: string;
  defaultPaymentInstructions: string;
  defaultValidityDays: number;
  proposalPrefix: string;
  invoicePrefix: string;
  changeOrderPrefix?: string;
  useTax: boolean;
  taxLabel: string;
  defaultTaxPercent: number;
  defaultTimezone?: string;
  defaultDeliveryTime?: string;
  dueSoonHours?: number;
  almostDueHours?: number;
}

export interface ClientInfo {
  name: string;
  company: string;
  email: string;
  phone: string;
}

export interface ServiceCatalogItem {
  id: string;
  title: string;
  description: string;
  category: string;
  defaultUnitPrice: number;
  defaultQuantity: number;
  pricingUnit: PricingUnit;
  defaultOptional: boolean;
  recommended: boolean;
  flexibility: PriceFlexibility;
  minimumUnitPrice?: number;
  clientCanRequestPrice?: boolean;
  clientCanChangeQuantity?: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProposalItem {
  id: string;
  catalogItemId?: string;
  category?: string;
  title: string;
  description: string;
  quantity: number;
  unitPrice: number;
  pricingUnit: PricingUnit;
  optional: boolean;
  recommended: boolean;
  selected: boolean;
  flexibility: PriceFlexibility;
  minimumUnitPrice?: number;
  clientCanRequestPrice?: boolean;
  clientCanChangeQuantity?: boolean;
  clientOfferUnitPrice?: number;
  ownerCounterUnitPrice?: number;
  acceptedUnitPrice?: number;
  acceptanceProbability?: number;
}

export interface OrderIncentive {
  enabled: boolean;
  threshold: number;
  percent: number;
  label: string;
  message: string;
  allowWithNegotiation: boolean;
}

export interface ApprovalInfo {
  signedBy: string;
  email: string;
  signedAt: string;
  note: string;
  termsAccepted: boolean;
  reference: string;
}

export interface PriceRequestInfo {
  requestedBy: string;
  email: string;
  requestedAt: string;
  note: string;
  originalTotal: number;
  requestedTotal: number;
}

export interface InvoiceInfo {
  id: string;
  publicToken: string;
  number: string;
  kind: InvoiceKind;
  issuedAt: string;
  dueAt: string;
  amountDue: number;
  status: InvoiceStatus;
  note?: string;
  archived?: boolean;
  linkEnabled?: boolean;
  firstViewedAt?: string;
  lastViewedAt?: string;
  viewCount?: number;
  paymentReportedAt?: string;
  paymentReportedBy?: string;
  paymentReportedEmail?: string;
  paidAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DeliveryPlan {
  enabled: boolean;
  duration: number;
  dayMode: DeliveryDayMode;
  startTrigger: DeliveryStartTrigger;
  depositRequired?: number;
  autoStartOnPayment: boolean;
  deliveryTime: string;
  timezone: string;
  status: ProjectStatus;
  paymentConfirmedAt?: string;
  countdownStartedAt?: string;
  deadlineAt?: string;
  pausedAt?: string;
  pausedRemainingMs?: number;
  pauseReason?: string;
  totalPausedMs?: number;
  deliveredAt?: string;
  completedAt?: string;
  lastClientNotificationAt?: string;
  lastClientNotificationType?: string;
}

export interface ProposalHistoryEntry {
  id: string;
  version: number;
  action: string;
  detail: string;
  at: string;
  actor: "owner" | "client" | "system";
}

export interface ApprovedSnapshot {
  version: number;
  proposalNumber: string;
  documentType?: DocumentType;
  parentProposalNumber?: string;
  title: string;
  summary: string;
  client: ClientInfo;
  company: CompanyProfile;
  currency: CurrencyCode;
  items: ProposalItem[];
  timeline: string;
  paymentSchedule: string;
  paymentInstructions: string;
  terms: string;
  taxEnabled: boolean;
  taxPercent: number;
  taxLabel: string;
  incentive: OrderIncentive;
  delivery?: DeliveryPlan;
  approval: ApprovalInfo;
  approvedAt: string;
}

export interface Proposal {
  id: string;
  publicToken: string;
  proposalNumber: string;
  documentType?: DocumentType;
  parentProposalId?: string;
  parentProposalNumber?: string;
  title: string;
  summary: string;
  client: ClientInfo;
  company: CompanyProfile;
  currency: CurrencyCode;
  items: ProposalItem[];
  timeline: string;
  paymentSchedule: string;
  paymentInstructions: string;
  terms: string;
  validUntil: string;
  minimumProjectTotal?: number;
  incentive: OrderIncentive;
  taxEnabled: boolean;
  taxPercent: number;
  taxLabel: string;
  status: ProposalStatus;
  responseState: ProposalResponseState;
  archived: boolean;
  trashedAt?: string;
  clientNote: string;
  ownerResponseNote?: string;
  approval?: ApprovalInfo;
  priceRequest?: PriceRequestInfo;
  /** Legacy single invoice. New code migrates this into invoices. */
  invoice?: InvoiceInfo;
  invoices?: InvoiceInfo[];
  delivery?: DeliveryPlan;
  approvedSnapshot?: ApprovedSnapshot;
  version: number;
  history: ProposalHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
  firstViewedAt?: string;
  lastViewedAt?: string;
  viewCount: number;
}

export interface ProposalTotals {
  subtotal: number;
  incentiveDiscount: number;
  tax: number;
  total: number;
  incentiveUnlocked: boolean;
  remainingToUnlock: number;
  negotiated: boolean;
}

export interface WorkspaceSettings {
  company: CompanyProfile;
  services: ServiceCatalogItem[];
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  businessName?: string;
  source: "database";
  isAdmin: boolean;
}

export interface ScopeFlowBackup {
  backupVersion: number;
  product: "ScopeFlow";
  exportedAt: string;
  workspace: WorkspaceSettings;
  proposals: Proposal[];
}

export interface BackupRestoreResult {
  mode: "merge" | "replace";
  servicesAdded: number;
  servicesUpdated: number;
  proposalsAdded: number;
  proposalsUpdated: number;
  proposalsSkipped: number;
}
