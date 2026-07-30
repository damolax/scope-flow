"use client";

import {
  CalendarDays, CheckCircle2, Clock3, Download, FileCheck2, LockKeyhole, Mail,
  ReceiptText, Send, ShieldCheck, Timer, X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cloudMode, proposalsRepository } from "@/lib/client-repository";
import {
  dateLabel, dateTimeLabel, deliveryUrgency, itemUnitPrice, money, normalizeProposal,
  remainingTimeLabel, totalsFor, urgencyLabel,
} from "@/lib/helpers";
import { InvoiceInfo, Proposal } from "@/lib/types";

export default function InvoiceView({ token }: { token: string }) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [invoice, setInvoice] = useState<InvoiceInfo | null>(null);
  const [cloud, setCloud] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reported, setReported] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const isCloud = await cloudMode();
        const result = await proposalsRepository.getInvoicePublic(token, isCloud, false);
        if (!active) return;
        setCloud(isCloud);
        setProposal(normalizeProposal(result.proposal));
        setInvoice(result.invoice);
        setName(result.proposal.client.name || "");
        setEmail(result.proposal.client.email || "");
      } catch (err: any) {
        setError(err.message || "This invoice could not be opened.");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  const snapshot = proposal?.approvedSnapshot;
  const totals = useMemo(() => snapshot ? totalsFor(snapshot) : null, [snapshot]);

  async function reportPayment() {
    if (!name.trim() || !email.trim()) { setError("Enter your name and email to report payment."); return; }
    setSubmitting(true); setError("");
    try {
      const updated = await proposalsRepository.reportInvoicePayment(token, { name: name.trim(), email: email.trim(), note: note.trim() }, cloud);
      setProposal(updated);
      const nextInvoice = updated.invoices?.find((item) => item.publicToken === token) || null;
      setInvoice(nextInvoice);
      setReported(true); setReportOpen(false);
    } catch (err: any) { setError(err.message || "Could not report payment."); }
    finally { setSubmitting(false); }
  }

  if (loading) return <main className="client-loading"><div className="client-brand-mark"><ReceiptText size={21} /></div><strong>Opening invoice</strong><span>Preparing the secure invoice page…</span></main>;
  if (!proposal || !snapshot || !invoice || !totals) return <main className="client-error"><X size={26} /><h1>Invoice unavailable</h1><p>{error || "The invoice has not been created or the link is no longer available."}</p></main>;

  const paid = invoice.status === "paid";
  const paymentReported = invoice.status === "payment_reported";
  const plan = proposal.delivery;
  const urgency = deliveryUrgency(plan);
  const googleCalendar = plan?.deadlineAt ? (() => {
    const deadline = new Date(plan.deadlineAt);
    const start = deadline.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const end = new Date(deadline.getTime() + 60 * 60 * 1000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const params = new URLSearchParams({ action: "TEMPLATE", text: `${proposal.company.name} — ${proposal.title}`, dates: `${start}/${end}`, details: `Project: ${proposal.title}\nAgreement: ${proposal.proposalNumber}\nView project: ${window.location.origin}/review/${proposal.publicToken}` });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  })() : "";

  return <main className="invoice-page" style={{ "--accent": snapshot.company.accent } as React.CSSProperties}>
    <header className="client-header"><div className="client-brand"><div className="client-logo">{snapshot.company.logoDataUrl ? <img src={snapshot.company.logoDataUrl} alt={`${snapshot.company.name} logo`} /> : snapshot.company.name.slice(0, 2).toUpperCase()}</div><span><strong>{snapshot.company.name}</strong><small>{snapshot.company.website || snapshot.company.email}</small></span></div><div className="secure-label"><LockKeyhole size={15} /> Secure invoice</div></header>

    <div className="invoice-container">
      {reported && <div className="client-success"><CheckCircle2 size={21} /><div><strong>Payment report sent</strong><span>{snapshot.company.name} will verify the payment before marking this invoice paid.</span></div></div>}
      <section className="invoice-hero"><div><span className="client-eyebrow">Invoice {invoice.number}</span><h1>{paid ? "Payment confirmed" : paymentReported ? "Payment awaiting confirmation" : "Invoice ready"}</h1><p>This invoice reflects the approved agreement. It is read-only and cannot be changed from this page.</p></div><div className={`invoice-status-card ${paid ? "paid" : "unpaid"}`}>{paid ? <CheckCircle2 size={22} /> : <Clock3 size={22} />}<span><small>Status</small><strong>{paid ? "Paid" : paymentReported ? "Payment reported" : "Payment due"}</strong></span></div></section>

      {plan?.enabled && (plan.countdownStartedAt || plan.status !== "awaiting_payment") && <section className="client-project-card"><div className="client-project-head"><span><Timer size={20} /><div><strong>Your project</strong><small>Return to this link at any time to see the delivery status.</small></div></span><em className={`project-status-badge ${urgency}`}>{urgencyLabel(urgency)}</em></div><div className="client-project-grid"><div><small>Project status</small><strong>{plan.status.replace(/_/g, " ")}</strong></div><div><small>Delivery window</small><strong>{plan.duration} {plan.dayMode === "business_days" ? "business" : "calendar"} days</strong></div><div><small>Time remaining</small><strong>{remainingTimeLabel(plan)}</strong></div><div><small>Expected delivery</small><strong>{plan.deadlineAt ? dateTimeLabel(plan.deadlineAt, plan.timezone) : "Starts after confirmation"}</strong></div></div>{plan.pauseReason && <div className="client-project-note">Paused: {plan.pauseReason}</div>}{plan.deadlineAt && <div className="client-project-actions"><a href={`/api/calendar/${proposal.publicToken}`}><CalendarDays size={17} /> Download calendar file</a><a href={googleCalendar} target="_blank" rel="noreferrer"><CalendarDays size={17} /> Add to Google Calendar</a><a href={`/review/${proposal.publicToken}`}><FileCheck2 size={17} /> View project details</a></div>}</section>}

      <div className="invoice-layout">
        <section className="invoice-document-card">
          <div className="invoice-document-head"><div><span>Invoice number</span><strong>{invoice.number}</strong></div><div><span>Issued</span><strong>{dateLabel(invoice.issuedAt)}</strong></div><div><span>Due</span><strong>{dateLabel(invoice.dueAt)}</strong></div></div>
          <div className="invoice-parties"><div><span>From</span><strong>{snapshot.company.name}</strong><p>{snapshot.company.email}<br />{snapshot.company.phone}<br />{snapshot.company.address}</p></div><div><span>Bill to</span><strong>{snapshot.client.company || snapshot.client.name}</strong><p>{snapshot.client.name}<br />{snapshot.client.email}<br />{snapshot.client.phone}</p></div></div>
          <div className="invoice-reference"><FileCheck2 size={18} /><div><strong>Approved agreement reference</strong><span>{snapshot.proposalNumber} · Approved {dateLabel(snapshot.approvedAt)} · {snapshot.approval.reference}</span></div><a href={`/api/pdf/${proposal.publicToken}?type=agreement`}><Download size={16} /> Agreement</a></div>
          <div className="invoice-lines"><div className="invoice-lines-head"><span>Description</span><span>Qty</span><span>Amount</span></div>{snapshot.items.map((item) => <div key={item.id}><span><strong>{item.title}</strong><small>{item.description}</small></span><b>{item.quantity}</b><strong>{money(item.quantity * itemUnitPrice(item), snapshot.currency)}</strong></div>)}</div>
          <div className="invoice-total-block"><span><small>Approved project total</small><b>{money(totals.total, snapshot.currency)}</b></span><span className="invoice-due-row"><small>Amount due on this invoice</small><strong>{money(invoice.amountDue, snapshot.currency)}</strong></span></div>
          {invoice.note && <div className="invoice-note"><strong>Invoice note</strong><p>{invoice.note}</p></div>}
          <div className="payment-instructions"><ShieldCheck size={19} /><div><strong>Payment instructions</strong><p>{snapshot.paymentInstructions}</p></div></div>
        </section>

        <aside className="invoice-side-card"><ReceiptText size={25} /><span>Amount due</span><strong>{money(invoice.amountDue, snapshot.currency)}</strong><small>Due {dateLabel(invoice.dueAt)}</small><a className="primary" href={`/api/pdf/${token}?type=invoice`}><Download size={18} /> Download invoice PDF</a>{!paid && !paymentReported && <button className="secondary" onClick={() => setReportOpen(!reportOpen)}><Send size={17} /> I have sent payment</button>}<a className="secondary" href={`mailto:${snapshot.company.email}?subject=${encodeURIComponent(`Question about invoice ${invoice.number}`)}`}><Mail size={17} /> Ask a question</a>{reportOpen && <div className="payment-report-form"><label><span>Your name</span><input value={name} onChange={(event) => setName(event.target.value)} /></label><label><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label><span>Payment note <em>optional</em></span><textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Reference or method used" /></label>{error && <div className="client-form-error">{error}</div>}<button className="primary" disabled={submitting} onClick={reportPayment}>{submitting ? "Sending…" : "Report payment"}</button><small>This does not mark the invoice paid. The business owner must verify it.</small></div>}<div className="invoice-next-steps"><strong>What happens next?</strong><ol><li>Follow the payment instructions.</li><li>Report payment if you want to notify the business.</li><li>The delivery countdown begins only after the business confirms payment.</li></ol></div></aside>
      </div>
    </div>
    <footer className="client-footer"><span>{snapshot.company.name}</span><small>Secure invoice powered by ScopeFlow</small></footer>
  </main>;
}
