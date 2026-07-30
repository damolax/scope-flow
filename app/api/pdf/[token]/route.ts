import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import { getCloudProposalByInvoiceToken, getCloudProposalByToken } from "@/lib/cloud-store";
import { dateLabel, invoiceByToken, itemUnitPrice, money, normalizeProposal, totalsFor } from "@/lib/helpers";
import { cloudEnabled } from "@/lib/supabase";
import { ApprovedSnapshot, InvoiceInfo } from "@/lib/types";

type RouteContext = { params: Promise<{ token: string }> };

type DocumentData = ApprovedSnapshot & { invoice?: InvoiceInfo };

function hexColor(value: string) {
  const normalized = String(value || "#5B6CFF").replace("#", "");
  const hex = normalized.length === 3 ? normalized.split("").map((x) => x + x).join("") : normalized;
  const number = Number.parseInt(hex, 16);
  if (!Number.isFinite(number)) return rgb(0.36, 0.42, 1);
  return rgb(((number >> 16) & 255) / 255, ((number >> 8) & 255) / 255, (number & 255) / 255);
}

function wrapText(text: string, font: PDFFont, size: number, width: number) {
  const paragraphs = String(text || "").split(/\n+/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(""); continue; }
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) line = next;
      else { if (line) lines.push(line); line = word; }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export async function GET(request: Request, context: RouteContext) {
  if (!cloudEnabled()) return NextResponse.json({ error: "Cloud storage is not configured" }, { status: 503 });
  const { token } = await context.params;
  const type = new URL(request.url).searchParams.get("type") === "invoice" ? "invoice" : "agreement";
  const raw = type === "invoice" ? await getCloudProposalByInvoiceToken(token) : await getCloudProposalByToken(token);
  if (!raw) return NextResponse.json({ error: type === "invoice" ? "Invoice not found" : "Proposal not found" }, { status: 404 });
  const proposal = normalizeProposal(raw);
  if (proposal.status !== "approved" || !proposal.approvedSnapshot) return NextResponse.json({ error: "The document becomes available after final approval" }, { status: 409 });
  const invoice = type === "invoice" ? invoiceByToken(proposal, token) : undefined;
  if (type === "invoice" && !invoice) return NextResponse.json({ error: "Create the invoice document first" }, { status: 409 });
  const data: DocumentData = { ...proposal.approvedSnapshot, invoice: invoice || undefined };
  const bytes = await buildPdf(data, type);
  const number = type === "invoice" ? invoice!.number : proposal.proposalNumber;
  const agreementName = proposal.documentType === "change_order" ? "Approved-Change-Order" : "Approved-Proposal";
  const filename = `${type === "invoice" ? "Invoice" : agreementName}-${number}-${proposal.client.company || proposal.client.name || "client"}.pdf`.replace(/[^a-z0-9._-]+/gi, "-");
  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" },
  });
}

async function buildPdf(data: DocumentData, type: "agreement" | "invoice") {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const accent = hexColor(data.company.accent);
  const dark = rgb(0.06, 0.08, 0.13);
  const muted = rgb(0.38, 0.42, 0.49);
  const line = rgb(0.88, 0.9, 0.93);
  const soft = rgb(0.97, 0.975, 0.985);
  const pageSize: [number, number] = [595.28, 841.89];
  let page = pdf.addPage(pageSize);
  let y = 720;

  const drawHeader = async (target: PDFPage) => {
    target.drawRectangle({ x: 0, y: 748, width: 595.28, height: 93.89, color: dark });
    let logoDrawn = false;
    if (data.company.logoDataUrl?.startsWith("data:image/")) {
      try {
        const [meta, base64] = data.company.logoDataUrl.split(",");
        const image = meta.includes("png") ? await pdf.embedPng(Buffer.from(base64, "base64")) : await pdf.embedJpg(Buffer.from(base64, "base64"));
        const scaled = image.scaleToFit(48, 48);
        target.drawImage(image, { x: 42, y: 770, width: scaled.width, height: scaled.height });
        logoDrawn = true;
      } catch { logoDrawn = false; }
    }
    if (!logoDrawn) {
      target.drawRectangle({ x: 42, y: 770, width: 48, height: 48, color: accent });
      target.drawText(data.company.name.slice(0, 2).toUpperCase(), { x: 55, y: 787, size: 14, font: bold, color: rgb(1, 1, 1) });
    }
    target.drawText(data.company.name, { x: 104, y: 796, size: 15, font: bold, color: rgb(1, 1, 1) });
    target.drawText(data.company.email, { x: 104, y: 779, size: 8.5, font: regular, color: rgb(0.72, 0.76, 0.84) });
    const agreementLabel = data.documentType === "change_order" ? "APPROVED CHANGE ORDER" : "APPROVED PROPOSAL";
    const label = type === "invoice" ? `INVOICE ${data.invoice?.number}` : `${agreementLabel} ${data.proposalNumber}`;
    target.drawText(label, { x: 350, y: 792, size: 9, font: bold, color: rgb(1, 1, 1) });
    const date = type === "invoice" ? data.invoice?.issuedAt : data.approvedAt;
    target.drawText(`${type === "invoice" ? "Issued" : "Approved"} ${dateLabel(date)}`, { x: 350, y: 776, size: 8.5, font: regular, color: rgb(0.72, 0.76, 0.84) });
  };

  const ensureSpace = async (needed: number) => {
    if (y - needed > 70) return;
    page = pdf.addPage(pageSize);
    await drawHeader(page);
    y = 720;
  };

  await drawHeader(page);
  page.drawText(type === "invoice" ? `Invoice for ${data.title}` : data.title, { x: 42, y, size: 23, font: bold, color: dark });
  if (type === "agreement" && data.documentType === "change_order" && data.parentProposalNumber) {
    y -= 18;
    page.drawText(`Additional work for approved agreement ${data.parentProposalNumber}`, { x: 42, y, size: 8.5, font: bold, color: accent });
  }
  y -= 25;
  for (const textLine of wrapText(data.summary, regular, 9.5, 505)) { page.drawText(textLine, { x: 42, y, size: 9.5, font: regular, color: muted }); y -= 13; }
  y -= 14;

  const infoY = y;
  const blocks = [
    ["PREPARED FOR", data.client.company || data.client.name, data.client.email],
    ["PREPARED BY", data.company.name, data.company.website || data.company.email],
    [type === "invoice" ? "PAYMENT DUE" : "APPROVAL", dateLabel(type === "invoice" ? data.invoice?.dueAt : data.approvedAt), type === "invoice" ? data.invoice?.status.toUpperCase() || "UNPAID" : `Version ${data.version}`],
  ];
  blocks.forEach((block, index) => {
    const x = 42 + index * 170;
    page.drawText(String(block[0]), { x, y: infoY, size: 7, font: bold, color: accent });
    page.drawText(String(block[1] || "—"), { x, y: infoY - 15, size: 10, font: bold, color: dark });
    page.drawText(String(block[2] || ""), { x, y: infoY - 29, size: 8, font: regular, color: muted });
  });
  y -= 62;

  page.drawText(type === "invoice" ? "BILLABLE SCOPE" : "APPROVED SCOPE", { x: 42, y, size: 8, font: bold, color: accent });
  y -= 18;
  for (let index = 0; index < data.items.length; index++) {
    const item = data.items[index];
    const descLines = wrapText(item.description, regular, 8.2, 320);
    const height = Math.max(58, 36 + descLines.length * 11);
    await ensureSpace(height + 12);
    page.drawRectangle({ x: 42, y: y - height + 9, width: 511, height, color: index % 2 ? soft : rgb(1, 1, 1), borderColor: line, borderWidth: 0.7 });
    page.drawText(String(index + 1).padStart(2, "0"), { x: 54, y: y - 12, size: 8, font: bold, color: accent });
    page.drawText(item.title, { x: 82, y: y - 12, size: 10.5, font: bold, color: dark });
    let descY = y - 27;
    for (const desc of descLines) { page.drawText(desc, { x: 82, y: descY, size: 8.2, font: regular, color: muted }); descY -= 11; }
    const unit = itemUnitPrice(item, "accepted");
    page.drawText(`${item.quantity} × ${money(unit, data.currency)}`, { x: 395, y: y - 12, size: 8, font: regular, color: muted });
    page.drawText(money(item.quantity * unit, data.currency), { x: 455, y: y - 29, size: 10.5, font: bold, color: dark });
    y -= height + 8;
  }

  await ensureSpace(160);
  const totals = totalsFor(data, "accepted");
  const invoiceAmount = type === "invoice" ? Math.min(data.invoice?.amountDue || totals.total, totals.total) : totals.total;
  const boxY = y - 122;
  page.drawRectangle({ x: 328, y: boxY, width: 225, height: 122, color: soft, borderColor: line, borderWidth: 0.8 });
  const rows: Array<[string, string, boolean?]> = [
    ["Subtotal", money(totals.subtotal, data.currency)],
    ...(totals.incentiveDiscount > 0 ? [[`${data.incentive.label} (${data.incentive.percent}%)`, `-${money(totals.incentiveDiscount, data.currency)}`] as [string, string]] : []),
    ...(totals.tax > 0 ? [[`${data.taxLabel} (${data.taxPercent}%)`, money(totals.tax, data.currency)] as [string, string]] : []),
    [type === "invoice" ? "Amount due" : "Approved total", money(invoiceAmount, data.currency), true],
  ];
  let rowY = y - 24;
  rows.forEach(([label, value, total]) => {
    if (total) page.drawLine({ start: { x: 342, y: rowY + 9 }, end: { x: 539, y: rowY + 9 }, thickness: 0.8, color: line });
    page.drawText(label, { x: 342, y: rowY, size: total ? 9.5 : 8.2, font: total ? bold : regular, color: total ? dark : muted });
    const size = total ? 13 : 8.5;
    page.drawText(value, { x: 539 - bold.widthOfTextAtSize(value, size), y: rowY - (total ? 2 : 0), size, font: total ? bold : regular, color: total ? dark : muted });
    rowY -= total ? 28 : 20;
  });

  page.drawText(type === "invoice" ? "PAYMENT DETAILS" : "PROJECT DETAILS", { x: 42, y: y - 4, size: 8, font: bold, color: accent });
  let detailY = y - 22;
  const details = type === "invoice"
    ? [data.paymentInstructions]
    : [`Timeline: ${data.timeline}`, `Payment schedule: ${data.paymentSchedule}`];
  for (const detail of details) {
    for (const textLine of wrapText(detail, regular, 8.3, 250)) { page.drawText(textLine, { x: 42, y: detailY, size: 8.3, font: regular, color: muted }); detailY -= 11; }
    detailY -= 7;
  }
  y = Math.min(detailY - 15, boxY - 18);

  if (type === "agreement") {
    await ensureSpace(185);
    page.drawText("TERMS AND CONDITIONS", { x: 42, y, size: 8, font: bold, color: accent });
    y -= 18;
    for (const termsLine of wrapText(data.terms, regular, 8.2, 505)) { await ensureSpace(14); page.drawText(termsLine, { x: 42, y, size: 8.2, font: regular, color: muted }); y -= 11; }
    y -= 12;
    await ensureSpace(92);
    page.drawRectangle({ x: 42, y: y - 74, width: 511, height: 74, color: rgb(0.94, 0.985, 0.965), borderColor: rgb(0.76, 0.91, 0.84), borderWidth: 0.8 });
    page.drawText("APPROVAL RECORD", { x: 56, y: y - 18, size: 8, font: bold, color: rgb(0.05, 0.45, 0.3) });
    page.drawText(`Approved by ${data.approval.signedBy}`, { x: 56, y: y - 38, size: 10, font: bold, color: dark });
    page.drawText(`${data.approval.email} · ${dateLabel(data.approval.signedAt)}`, { x: 56, y: y - 54, size: 8.2, font: regular, color: muted });
    page.drawText(`Reference ${data.approval.reference}`, { x: 360, y: y - 42, size: 8.2, font: regular, color: muted });
  }

  pdf.getPages().forEach((p: PDFPage, index: number, pages: PDFPage[]) => {
    p.drawText(`${data.company.name} · ${data.company.email}`, { x: 42, y: 32, size: 7.5, font: regular, color: muted });
    const pageText = `${index + 1} / ${pages.length}`;
    p.drawText(pageText, { x: 553 - regular.widthOfTextAtSize(pageText, 7.5), y: 32, size: 7.5, font: regular, color: muted });
  });
  return pdf.save();
}
