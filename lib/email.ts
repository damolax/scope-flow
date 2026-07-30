export interface EmailResult {
  configured: boolean;
  sent: boolean;
  id?: string;
  error?: string;
}

export async function sendTransactionalEmail(input: { to: string; subject: string; html: string; replyTo?: string }): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return { configured: false, sent: false };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html, reply_to: input.replyTo || undefined }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return { configured: true, sent: false, error: String(body.message || "Email provider rejected the message") };
    return { configured: true, sent: true, id: body.id ? String(body.id) : undefined };
  } catch (error: any) {
    return { configured: true, sent: false, error: error.message || "Email could not be sent" };
  }
}

export function emailLayout(input: { business: string; heading: string; intro: string; rows?: Array<[string, string]>; actionLabel?: string; actionUrl?: string; note?: string }) {
  const rows = (input.rows || []).map(([label, value]) => `<tr><td style="padding:8px 0;color:#667085;font-size:13px">${escapeHtml(label)}</td><td style="padding:8px 0;text-align:right;color:#101828;font-weight:700;font-size:13px">${escapeHtml(value)}</td></tr>`).join("");
  const action = input.actionUrl && input.actionLabel ? `<p style="margin:24px 0"><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">${escapeHtml(input.actionLabel)}</a></p>` : "";
  return `<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#101828"><div style="max-width:620px;margin:0 auto;padding:30px 18px"><div style="background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:28px"><div style="font-size:13px;font-weight:800;color:#667085;margin-bottom:18px">${escapeHtml(input.business)}</div><h1 style="font-size:26px;line-height:1.2;margin:0 0 12px">${escapeHtml(input.heading)}</h1><p style="font-size:15px;line-height:1.65;color:#475467;margin:0 0 18px">${escapeHtml(input.intro)}</p>${rows ? `<table style="width:100%;border-collapse:collapse;border-top:1px solid #eaecf0;border-bottom:1px solid #eaecf0">${rows}</table>` : ""}${action}${input.note ? `<p style="font-size:13px;line-height:1.6;color:#667085">${escapeHtml(input.note)}</p>` : ""}</div><p style="text-align:center;color:#98a2b3;font-size:12px">Sent securely through ScopeFlow</p></div></body></html>`;
}

function escapeHtml(value: string) {
  return String(value || "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character);
}
