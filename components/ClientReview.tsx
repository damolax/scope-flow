"use client";

import {
  ArrowRight, CalendarDays, Check, CheckCircle2, ChevronDown, Clock3, Download, FileCheck2,
  FileText, Info, ListChecks, LockKeyhole, Mail, MessageSquareText, Minus, Plus,
  RefreshCcw, ShieldCheck, Sparkles, Timer, X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cloudMode, proposalsRepository } from "@/lib/client-repository";
import { activeInvoices, currentUnitPrice, dateLabel, dateTimeLabel, deliveryUrgency, isExpired, money, normalizeProposal, probabilityLabel, remainingTimeLabel, totalsFor, urgencyLabel } from "@/lib/helpers";
import { Proposal, ProposalItem } from "@/lib/types";

export default function ClientReview({ token }: { token: string }) {
  const [cloud, setCloud] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [items, setItems] = useState<ProposalItem[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [suggesting, setSuggesting] = useState<Record<string, boolean>>({});
  const [probabilities, setProbabilities] = useState<Record<string, number>>({});
  const [termsOpen, setTermsOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [preview, setPreview] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => { setPreview(new URLSearchParams(window.location.search).get("preview") === "1"); }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const isCloud = await cloudMode();
        const isPreview = new URLSearchParams(window.location.search).get("preview") === "1";
        const result = await proposalsRepository.getPublic(token, isCloud, isPreview, "proposal");
        if (!active) return;
        setCloud(isCloud);
        setProposal(normalizeProposal(result));
        setItems(structuredClone(result.items));
        setName(result.client.name || "");
        setEmail(result.client.email || "");
      } catch (err: any) {
        setError(err.message || "This proposal could not be opened.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [token]);


  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 60_000);
    return () => clearInterval(timer);
  }, []);
  const working = useMemo(() => proposal ? { ...proposal, items } : null, [proposal, items]);
  const totals = useMemo(() => working ? totalsFor(working, "client_offer") : null, [working]);
  const hasPriceChanges = useMemo(() => items.some((item) =>
    (!item.optional || item.selected) && item.clientOfferUnitPrice !== undefined &&
    Math.abs(item.clientOfferUnitPrice - currentUnitPrice(item)) > 0.005,
  ), [items]);
  const requestMode = hasPriceChanges || Boolean(note.trim());

  useEffect(() => {
    if (!proposal || !hasPriceChanges) { setProbabilities({}); return; }
    const offers = items
      .filter((item) => item.clientOfferUnitPrice !== undefined)
      .map((item) => ({ id: item.id, unitPrice: Number(item.clientOfferUnitPrice) }));
    const timer = setTimeout(async () => {
      try { setProbabilities(await proposalsRepository.estimate(token, offers, cloud, proposal)); }
      catch { /* Estimate failure must not block the proposal. */ }
    }, 350);
    return () => clearTimeout(timer);
  }, [items, proposal, token, cloud, hasPriceChanges]);

  function updateItem(id: string, patch: Partial<ProposalItem>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function toggleOptional(item: ProposalItem) {
    if (!proposal || !totals) return;
    const nextItems = items.map((entry) => entry.id === item.id ? { ...entry, selected: !entry.selected } : entry);
    const nextTotals = totalsFor({ ...proposal, items: nextItems }, "client_offer");
    if (item.selected && totals.incentiveUnlocked && !nextTotals.incentiveUnlocked) {
      const accepted = confirm(
        `Removing ${item.title} removes the ${proposal.incentive.percent}% ${proposal.incentive.label}.\n\n` +
        `Current total: ${money(totals.total, proposal.currency)}\n` +
        `New total: ${money(nextTotals.total, proposal.currency)}\n\nContinue?`,
      );
      if (!accepted) return;
    }
    setItems(nextItems);
  }

  async function submit() {
    if (!proposal) return;
    if (!name.trim() || !email.trim()) { setError("Enter your name and email to continue."); return; }
    if (!requestMode && !termsAccepted) { setError("Review and accept the terms before approving."); return; }
    setSubmitting(true);
    setError("");
    try {
      const updated = await proposalsRepository.publicAction(token, {
        action: requestMode ? "request" : "approve",
        signedBy: name.trim(),
        email: email.trim(),
        note: note.trim(),
        termsAccepted,
        items: items.map((item) => ({
          id: item.id,
          selected: item.selected,
          quantity: item.quantity,
          clientOfferUnitPrice: item.clientOfferUnitPrice,
        })),
      }, cloud);
      setProposal(updated);
      setItems(structuredClone(updated.items));
      setReviewOpen(false);
      setSuccess(requestMode
        ? "Your requested changes were sent. The business owner will review them."
        : "Proposal approved. Your agreement is now locked and ready.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      setError(err.message || "Could not submit your response.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <main className="client-loading"><div className="client-brand-mark"><Sparkles size={21} /></div><strong>Opening proposal</strong><span>Preparing your secure review page…</span></main>;
  if (!proposal || !working || !totals) return <main className="client-error"><X size={26} /><h1>Proposal unavailable</h1><p>{error || "The link may be incorrect or no longer active."}</p></main>;

  const expired = isExpired(proposal) && proposal.status === "awaiting_client";
  const locked = proposal.status === "approved";
  const waiting = proposal.status === "needs_response";
  const selected = items.filter((item) => !item.optional || item.selected);
  const included = items.filter((item) => !item.optional);
  const optional = items.filter((item) => item.optional);
  const progress = proposal.incentive.threshold > 0 ? Math.min(100, totals.subtotal / proposal.incentive.threshold * 100) : 100;
  const documentLabel = proposal.documentType === "change_order" ? "additional work order" : "proposal";

  return <main className="client-page" style={{ "--accent": proposal.company.accent } as React.CSSProperties}>
    {preview && <div className="preview-banner"><FileText size={17} /> Preview mode — this is exactly what your client sees.</div>}
    <header className="client-header">
      <div className="client-brand"><div className="client-logo">{proposal.company.logoDataUrl ? <img src={proposal.company.logoDataUrl} alt={`${proposal.company.name} logo`} /> : proposal.company.name.slice(0, 2).toUpperCase()}</div><span><strong>{proposal.company.name}</strong><small>{proposal.company.website || proposal.company.email}</small></span></div>
      <div className="secure-label"><LockKeyhole size={15} /> Secure {documentLabel}</div>
    </header>

    <div className="client-container">
      {success && <div className="client-success"><CheckCircle2 size={21} /><div><strong>{success}</strong><span>{locked ? "Download the approved agreement or open the invoice when it becomes available." : "Return to this secure link after the business owner responds."}</span></div></div>}
      {proposal.ownerResponseNote && proposal.status === "awaiting_client" && <div className="owner-message"><MessageSquareText size={19} /><div><strong>Message from {proposal.company.name}</strong><p>{proposal.ownerResponseNote}</p></div></div>}
      {expired && <div className="client-notice warning"><Clock3 size={20} /><div><strong>This {documentLabel} expired on {dateLabel(proposal.validUntil)}</strong><span>You can still review it, but approval is unavailable. Contact {proposal.company.name} for an updated offer.</span></div></div>}
      {waiting && <div className="client-notice"><RefreshCcw size={20} /><div><strong>Your request is being reviewed</strong><span>The business owner will return an updated version to this same secure link.</span></div></div>}
      {locked && <><div className="client-notice success"><FileCheck2 size={20} /><div><strong>Approved agreement</strong><span>Approved by {proposal.approval?.signedBy} on {dateLabel(proposal.approval?.signedAt)} · Reference {proposal.approval?.reference}</span></div><div className="client-doc-actions"><a href={`/api/pdf/${token}?type=agreement`}><Download size={17} /> Agreement PDF</a>{activeInvoices(proposal).map((invoice) => <a key={invoice.id} href={`/invoice/${invoice.publicToken}`}><FileText size={17} /> {invoice.number}</a>)}</div></div>{proposal.delivery?.enabled && <div className="client-project-card"><div className="client-project-head"><span><Timer size={20} /><div><strong>Project delivery</strong><small>Return to this secure link any time to check the remaining delivery time.</small></div></span><em className={`project-status-badge ${deliveryUrgency(proposal.delivery)}`}>{urgencyLabel(deliveryUrgency(proposal.delivery))}</em></div><div className="client-project-grid"><div><small>Status</small><strong>{proposal.delivery.status.replace(/_/g, " ")}</strong></div><div><small>Delivery window</small><strong>{proposal.delivery.duration} {proposal.delivery.dayMode === "business_days" ? "business" : "calendar"} days</strong></div><div><small>Time remaining</small><strong>{remainingTimeLabel(proposal.delivery)}</strong></div><div><small>Expected delivery</small><strong>{proposal.delivery.deadlineAt ? dateTimeLabel(proposal.delivery.deadlineAt, proposal.delivery.timezone) : "Starts after payment confirmation"}</strong></div></div>{proposal.delivery.pauseReason && <div className="client-project-note">Paused: {proposal.delivery.pauseReason}</div>}{proposal.delivery.deadlineAt && <div className="client-project-actions"><a href={`/api/calendar/${proposal.publicToken}`}><CalendarDays size={17} /> Download calendar file</a></div>}</div>}</>}

      <section className="client-hero">
        <span className="client-eyebrow">{proposal.proposalNumber} · Prepared for {proposal.client.company || proposal.client.name}</span>
        {proposal.documentType === "change_order" && proposal.parentProposalNumber && <div className="parent-reference">Additional work for agreement {proposal.parentProposalNumber}</div>}
        <h1>{proposal.title}</h1>
        <p>{proposal.summary}</p>
        <div className="client-summary-chips"><span><FileText size={15} /> {selected.length} selected services</span><span><Clock3 size={15} /> Valid until {dateLabel(proposal.validUntil)}</span><span><ShieldCheck size={15} /> Version {proposal.version}</span></div>
      </section>

      {!locked && <section className="proposal-flow-card">
        <button className="flow-card-heading" onClick={() => setHowOpen(!howOpen)}><span><Info size={18} /><strong>How this {documentLabel} works</strong></span><ChevronDown className={howOpen ? "rotated" : ""} size={18} /></button>
        {howOpen && <><p>Included services are already part of the offer. Optional extras can be added or removed. Where enabled, you can request a different price. Nothing becomes final until you review the summary and approve it.</p><div className="client-flow-steps"><span><b>1</b> Review scope</span><span><b>2</b> Choose extras</span><span><b>3</b> Review and respond</span></div></>}
      </section>}

      <div className="client-layout"><div className="client-content">
        <section className="client-section"><div className="client-section-heading"><span>01</span><div><h2>Included in your offer</h2><p>These services form the core scope and cannot be removed.</p></div></div><div className="client-items">{included.map((item) => <ClientItem key={item.id} item={item} proposal={proposal} locked={locked || waiting || expired || preview} suggesting={suggesting[item.id]} setSuggesting={(value: boolean) => setSuggesting((current) => ({ ...current, [item.id]: value }))} probability={probabilities[item.id]} update={(patch: Partial<ProposalItem>) => updateItem(item.id, patch)} />)}</div></section>

        {optional.length > 0 && <section className="client-section"><div className="client-section-heading"><span>02</span><div><h2>Optional extras</h2><p>Add the extras that fit your project. Your total and package-saving progress update immediately.</p></div></div><div className="client-items">{optional.map((item) => <ClientItem key={item.id} item={item} proposal={proposal} locked={locked || waiting || expired || preview} optional onToggle={() => toggleOptional(item)} suggesting={suggesting[item.id]} setSuggesting={(value: boolean) => setSuggesting((current) => ({ ...current, [item.id]: value }))} probability={probabilities[item.id]} update={(patch: Partial<ProposalItem>) => updateItem(item.id, patch)} />)}</div></section>}

        <section className="client-section"><div className="client-section-heading"><span>03</span><div><h2>Project details</h2><p>Review delivery, payment information and conditions before responding.</p></div></div><div className="detail-cards"><div><Clock3 size={18} /><span><strong>Timeline</strong><p>{proposal.timeline}</p></span></div><div><Mail size={18} /><span><strong>Payment schedule</strong><p>{proposal.paymentSchedule}</p></span></div></div><button className="terms-toggle" onClick={() => setTermsOpen(!termsOpen)}><span><ShieldCheck size={18} /><strong>Terms and conditions</strong></span><ChevronDown className={termsOpen ? "rotated" : ""} size={18} /></button>{termsOpen && <div className="terms-box">{proposal.terms.split("\n").map((line, index) => <p key={index}>{line}</p>)}</div>}</section>

        {!locked && !waiting && !expired && !preview && <section className="client-section decision-section"><div className="client-section-heading"><span>04</span><div><h2>Review your selection</h2><p>Check every selected service and the final total before approving or sending requested changes.</p></div></div><div className="decision-card"><ListChecks size={24} /><div><strong>{selected.length} services selected</strong><span>Current total: {money(totals.total, proposal.currency)}</span></div><button className="client-submit" onClick={() => { setError(""); setReviewOpen(true); }}>Review and continue <ArrowRight size={18} /></button></div></section>}
      </div>

      <aside className="client-sidebar"><div className="client-total-card"><span>Current selection</span><strong>{money(totals.total, proposal.currency)}</strong><div className="client-total-lines"><span><small>Subtotal</small><b>{money(totals.subtotal, proposal.currency)}</b></span>{totals.incentiveDiscount > 0 && <span className="client-saving"><small>{proposal.incentive.label}</small><b>-{money(totals.incentiveDiscount, proposal.currency)}</b></span>}{totals.tax > 0 && <span><small>{proposal.taxLabel}</small><b>{money(totals.tax, proposal.currency)}</b></span>}</div>{proposal.incentive.enabled && <div className={`client-incentive ${totals.incentiveUnlocked ? "unlocked" : ""}`}><div><span>{totals.incentiveUnlocked ? <CheckCircle2 size={16} /> : <Sparkles size={16} />}<strong>{totals.incentiveUnlocked ? `${proposal.incentive.percent}% saving unlocked` : proposal.incentive.label}</strong></span><b>{Math.round(progress)}%</b></div><small className="incentive-owner-message">{proposal.incentive.message}</small><div className="progress-track"><i style={{ width: `${progress}%` }} /></div><p>{totals.incentiveUnlocked ? `You save ${money(totals.incentiveDiscount, proposal.currency)}.` : totals.negotiated && !proposal.incentive.allowWithNegotiation ? "A negotiated price request is reviewed separately from this incentive." : `Add ${money(totals.remainingToUnlock, proposal.currency)} more to unlock ${proposal.incentive.percent}% off.`}</p></div>}<div className="selected-mini-list">{selected.map((item) => <span key={item.id}><small>{item.title}</small><b>{money(item.quantity * (item.clientOfferUnitPrice ?? currentUnitPrice(item)), proposal.currency)}</b></span>)}</div>{!locked && !waiting && !expired && !preview && <button className="client-submit sidebar-review" onClick={() => { setError(""); setReviewOpen(true); }}>Review selection <ArrowRight size={17} /></button>}</div><div className="client-help"><strong>Questions about this offer?</strong><p>Contact {proposal.company.name} directly.</p><a href={`mailto:${proposal.company.email}`}><Mail size={15} /> {proposal.company.email}</a></div></aside>
      </div>
    </div>

    {!locked && !waiting && !expired && !preview && <div className="mobile-total-bar"><span><small>{selected.length} services</small><strong>{money(totals.total, proposal.currency)}</strong></span><button onClick={() => { setError(""); setReviewOpen(true); }}>Review <ArrowRight size={16} /></button></div>}

    {reviewOpen && <div className="review-drawer-backdrop" onMouseDown={() => !submitting && setReviewOpen(false)}><section className="review-drawer" onMouseDown={(event) => event.stopPropagation()}><header><div><span className="eyebrow">Final check</span><h2>{requestMode ? "Review your requested changes" : "Review your agreement"}</h2><p>{requestMode ? "Nothing is approved yet. Your request will be sent to the business owner." : "Confirm the selected services, total and terms before approval."}</p></div><button className="icon-button" aria-label="Close review" onClick={() => setReviewOpen(false)}><X size={19} /></button></header><div className="review-drawer-body"><div className="review-selection-list">{selected.map((item) => <div key={item.id}><span><strong>{item.title}</strong><small>{item.quantity > 1 ? `${item.quantity} × ${money(item.clientOfferUnitPrice ?? currentUnitPrice(item), proposal.currency)}` : item.optional ? "Optional extra selected" : "Included service"}</small></span><b>{money(item.quantity * (item.clientOfferUnitPrice ?? currentUnitPrice(item)), proposal.currency)}</b></div>)}</div><div className="review-totals"><span><small>Subtotal</small><b>{money(totals.subtotal, proposal.currency)}</b></span>{totals.incentiveDiscount > 0 && <span className="client-saving"><small>{proposal.incentive.label}</small><b>-{money(totals.incentiveDiscount, proposal.currency)}</b></span>}{totals.tax > 0 && <span><small>{proposal.taxLabel}</small><b>{money(totals.tax, proposal.currency)}</b></span>}<span className="review-grand-total"><small>Final total</small><b>{money(totals.total, proposal.currency)}</b></span></div><div className="review-detail-summary"><span><strong>Timeline</strong><small>{proposal.timeline}</small></span><span><strong>Payment schedule</strong><small>{proposal.paymentSchedule}</small></span></div><div className="response-fields"><label><span>Your full name</span><input value={name} onChange={(event) => setName(event.target.value)} /></label><label><span>Email address</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label className="wide"><span>Note or requested change <em>optional</em></span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add context about your budget, scope or question" /></label></div>{!requestMode && <label className="client-terms-check"><input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} /><span>I have reviewed and agree to this {documentLabel} and its terms and conditions.</span></label>}{error && <div className="client-form-error">{error}</div>}<button className="client-submit review-submit" disabled={submitting} onClick={submit}>{submitting ? "Submitting…" : requestMode ? <>Send my requested changes <ArrowRight size={18} /></> : <>Confirm and approve <Check size={18} /></>}</button><small className="estimate-disclaimer">Price likelihoods are estimates. The business owner reviews every requested change.</small></div></section></div>}

    <footer className="client-footer"><span>{proposal.company.name}</span><small>Secure {documentLabel} powered by ScopeFlow</small></footer>
  </main>;
}

function ClientItem({ item, proposal, locked, optional = false, onToggle, suggesting, setSuggesting, probability, update }: any) {
  const base = currentUnitPrice(item);
  const amount = item.clientOfferUnitPrice ?? base;
  const probabilityValue = probability ?? item.acceptanceProbability;
  const canChangeQuantity = item.clientCanChangeQuantity !== false && item.pricingUnit !== "fixed";
  const canRequestPrice = item.clientCanRequestPrice !== false;
  return <article className={`client-item ${optional ? "optional-item" : "included-item"} ${optional && item.selected ? "selected" : ""} ${optional && !item.selected ? "not-selected" : ""}`}>
    <div className="client-item-top">
      {optional ? <button disabled={locked} className={`select-control text-select-control ${item.selected ? "selected" : ""}`} aria-label={item.selected ? `Remove ${item.title}` : `Add ${item.title}`} onClick={onToggle}>{item.selected ? <><Check size={16} /> Added</> : <><Plus size={16} /> Add extra</>}</button> : <div className="included-check"><Check size={15} /></div>}
      <div className="client-item-copy"><div><h3>{item.title}</h3>{item.recommended && <span className="recommended">Recommended for this project</span>}</div><p>{item.description}</p></div>
      <div className="client-item-price"><strong>{optional ? "+" : ""}{money(item.quantity * base, proposal.currency)}</strong>{item.quantity > 1 && <small>{item.quantity} × {money(base, proposal.currency)}</small>}</div>
    </div>
    {(!optional || item.selected) && <div className="client-item-actions">{canChangeQuantity && <div className="quantity-control"><button disabled={locked || item.quantity <= 1} onClick={() => update({ quantity: Math.max(1, item.quantity - 1) })}><Minus size={14} /></button><span>{item.quantity}</span><button disabled={locked} onClick={() => update({ quantity: item.quantity + 1 })}><Plus size={14} /></button></div>}{canRequestPrice && <button disabled={locked} className="suggest-button" onClick={() => setSuggesting(!suggesting)}>{suggesting ? "Close price request" : "Request a different price"}</button>}{optional && item.selected && <button disabled={locked} className="remove-extra-button" onClick={onToggle}>Remove extra</button>}</div>}
    {suggesting && canRequestPrice && (!optional || item.selected) && <div className="price-suggestion"><label><span>Your requested price per {item.pricingUnit === "fixed" ? "service" : item.pricingUnit}</span><div><em>{proposal.currency}</em><input disabled={locked} type="number" min="0" value={amount} onChange={(event) => update({ clientOfferUnitPrice: Number(event.target.value) })} /></div></label>{item.clientOfferUnitPrice !== undefined && Math.abs(item.clientOfferUnitPrice - base) > 0.005 && <><div className="price-comparison-inline"><span>Current {money(base, proposal.currency)}</span><strong>Requested {money(item.clientOfferUnitPrice, proposal.currency)}</strong></div><div className={`probability probability-${probabilityLabel(probabilityValue).toLowerCase().replaceAll(" ", "-")}`}><span><strong>{probabilityLabel(probabilityValue)}</strong><small>Estimated approval likelihood</small></span><b>about {Math.round(probabilityValue || 0)}%</b></div></>}</div>}
  </article>;
}
