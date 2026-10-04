"use client";

import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Mail } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not send the reset email.");
      setSent(true);
    } catch (caught: any) {
      setError(caught?.message || "Could not send the reset email.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="auth-simple-page"><section className="auth-simple-card"><Link className="auth-back" href="/login"><ArrowLeft size={16} /> Back to sign in</Link><div className="auth-simple-icon">{sent ? <CheckCircle2 size={25} /> : <Mail size={25} />}</div><span className="eyebrow">Account recovery</span><h1>{sent ? "Check your email" : "Reset your password"}</h1><p>{sent ? `If an account exists for ${email}, Neon Auth sent a secure password-reset link.` : "Enter the email connected to your ScopeFlow account."}</p>{!sent && <form onSubmit={submit}><label><span>Email address</span><input autoFocus type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" /></label>{error && <div className="login-error">{error}</div>}<button className="login-submit" disabled={!email || loading}>{loading ? <><Loader2 className="spin" size={18} /> Sending…</> : <>Send reset link <ArrowRight size={18} /></>}</button></form>}{sent && <><small>The reset link expires for security. Check spam if it does not arrive.</small><button className="secondary auth-full-button" onClick={() => setSent(false)}>Use another email</button></>}</section></main>;
}
