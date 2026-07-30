import { Proposal, ProposalItem, ServiceCatalogItem, WorkspaceSettings } from "./types";
import { uid } from "./helpers";

const now = new Date();
const inDays = (days: number) => { const date = new Date(now); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); };
const ago = (days: number) => { const date = new Date(now); date.setDate(date.getDate() - days); return date.toISOString(); };

export const defaultCompany = {
  name: "Your Business",
  email: "hello@yourbusiness.com",
  phone: "",
  website: "",
  address: "",
  accent: "#5B6CFF",
  logoDataUrl: "",
  currency: "USD" as const,
  defaultTerms: "1. Work begins after written approval of this proposal.\n2. Additional work outside the approved scope requires a revised proposal.\n3. Timelines depend on the timely delivery of client feedback and materials.\n4. This proposal remains valid until the date shown above.",
  defaultPaymentInstructions: "Payment instructions will be provided separately by the business owner.",
  defaultValidityDays: 14,
  proposalPrefix: "PROP",
  invoicePrefix: "INV",
  changeOrderPrefix: "CHG",
  useTax: false,
  taxLabel: "Tax",
  defaultTaxPercent: 0,
  defaultTimezone: "UTC",
  defaultDeliveryTime: "17:00",
  dueSoonHours: 72,
  almostDueHours: 12,
};

const service = (
  id: string,
  title: string,
  description: string,
  category: string,
  price: number,
  optional: boolean,
  flexibility: ServiceCatalogItem["flexibility"],
  minimumUnitPrice?: number,
): ServiceCatalogItem => ({
  id, title, description, category, defaultUnitPrice: price, defaultQuantity: 1,
  pricingUnit: "fixed", defaultOptional: optional, recommended: false, flexibility,
  minimumUnitPrice, clientCanRequestPrice: true, clientCanChangeQuantity: false, active: true, createdAt: ago(30), updatedAt: ago(2),
});

export const demoServices: ServiceCatalogItem[] = [
  service("svc-audit", "Strategy and conversion audit", "A focused review of the current experience, offer hierarchy and conversion path.", "Strategy", 450, false, "fixed", 450),
  service("svc-redesign", "Premium website redesign", "A responsive page system with clearer messaging, trust and conversion paths.", "Website", 2350, false, "slight", 2100),
  service("svc-seo", "SEO foundation", "Page titles, metadata, search structure and launch recommendations.", "Growth", 650, true, "flexible", 500),
  service("svc-support", "Growth support", "Monthly review, recommendations and priority improvements.", "Support", 250, true, "flexible", 175),
];

export const defaultWorkspace: WorkspaceSettings = { company: defaultCompany, services: demoServices };

export function itemFromService(service: ServiceCatalogItem): ProposalItem {
  return {
    id: uid(), catalogItemId: service.id, category: service.category, title: service.title,
    description: service.description, quantity: service.defaultQuantity, unitPrice: service.defaultUnitPrice,
    pricingUnit: service.pricingUnit, optional: service.defaultOptional, recommended: service.recommended,
    selected: true, flexibility: service.flexibility, minimumUnitPrice: service.minimumUnitPrice,
    clientCanRequestPrice: service.clientCanRequestPrice !== false,
    clientCanChangeQuantity: service.clientCanChangeQuantity ?? service.pricingUnit !== "fixed",
  };
}

export function blankProposal(workspace: WorkspaceSettings = defaultWorkspace, sequence?: number): Proposal {
  const created = new Date().toISOString();
  const number = sequence || Math.floor(1000 + Math.random() * 8999);
  const proposal: Proposal = {
    id: uid(), publicToken: uid(), proposalNumber: `${workspace.company.proposalPrefix || "PROP"}-${number}`,
    documentType: "proposal",
    title: "New client proposal", summary: "Describe the outcome, the value and why this is the right next step.",
    client: { name: "", company: "", email: "", phone: "" },
    company: structuredClone(workspace.company), currency: workspace.company.currency,
    items: workspace.services.filter((item) => item.active).slice(0, 1).map(itemFromService),
    timeline: "Estimated delivery: 3–4 weeks after approval and receipt of required materials.",
    paymentSchedule: "Payment schedule to be agreed before work begins.",
    paymentInstructions: workspace.company.defaultPaymentInstructions,
    terms: workspace.company.defaultTerms,
    validUntil: inDays(workspace.company.defaultValidityDays || 14), minimumProjectTotal: undefined,
    incentive: { enabled: false, threshold: 1000, percent: 10, label: "Package saving", message: "Select services above the minimum to unlock this saving.", allowWithNegotiation: false },
    taxEnabled: workspace.company.useTax, taxPercent: workspace.company.defaultTaxPercent, taxLabel: workspace.company.taxLabel,
    status: "draft", responseState: "none", archived: false, clientNote: "", version: 1,
    invoices: [],
    delivery: { enabled: true, duration: 14, dayMode: "calendar_days", startTrigger: "full_payment", autoStartOnPayment: true, deliveryTime: workspace.company.defaultDeliveryTime || "17:00", timezone: workspace.company.defaultTimezone || "UTC", status: "awaiting_payment", totalPausedMs: 0 },
    history: [{ id: uid(), version: 1, action: "Proposal created", detail: "Draft created", at: created, actor: "owner" }],
    createdAt: created, updatedAt: created, viewCount: 0,
  };
  if (!proposal.items.length) {
    proposal.items = [{ id: uid(), title: "Core service", description: "Explain the service and expected result.", quantity: 1, unitPrice: 1000, pricingUnit: "fixed", optional: false, recommended: false, selected: true, flexibility: "fixed", minimumUnitPrice: 1000, clientCanRequestPrice: true, clientCanChangeQuantity: false }];
  }
  return proposal;
}

const demo = blankProposal(defaultWorkspace, 1048);
demo.title = "Website redesign and conversion system";
demo.summary = "A focused redesign that clarifies the offer, improves trust and gives visitors an easier path from first visit to enquiry.";
demo.client = { name: "Robert Miles", company: "Objects in Motion", email: "robert@example.com", phone: "" };
demo.items = demoServices.map(itemFromService).map((item, index) => ({ ...item, selected: index < 3, recommended: index === 2 }));
demo.incentive = { enabled: true, threshold: 3000, percent: 12, label: "Project saving", message: "Build a complete project scope and unlock 12% off.", allowWithNegotiation: false };
demo.status = "awaiting_client";
demo.responseState = "viewed";
demo.sentAt = ago(4);
demo.firstViewedAt = ago(2);
demo.lastViewedAt = ago(1);
demo.viewCount = 3;

export const demoProposals: Proposal[] = [demo];
