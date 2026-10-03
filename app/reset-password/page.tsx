"use client";

import { ArrowRight, CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setToken(query.get("token") || "");
    if (query.get("error")) setError("The password-reset link is invalid or expired.");
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!token) { setError("The password-reset link is invalid or expired."); return; }
    if (password.length < 8) { setError("Use at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("The passwords do not match."); return; }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/password-reset/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not update the password.");
      setDone(true);
      window.setTimeout(() => window.location.replace("/login?reset=success"), 900);
    } catch (caught: any) {
      setError(caught?.message || "Could not update the password.");
    } finally {
      setLoading(false);
    }
  }

  const ready = Boolean(token) && !error;

  return <main className="auth-simple-page"><section className="auth-simple-card"><div className="auth-simple-icon">{done ? <CheckCircle2 size={25} /> : <KeyRound size={25} />}</div><span className="eyebrow">Account security</span><h1>{done ? "Password updated" : "Choose a new password"}</h1><p>{done ? "Your new password is active. Returning to sign in…" : ready ? "Use a strong password you do not use elsewhere." : "Open this page from a valid password-reset email."}</p>{ready && !done && <form onSubmit={submit}><label><span>New password</span><input autoFocus type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><label><span>Confirm new password</span><input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>{error && <div className="login-error">{error}</div>}<button className="login-submit" disabled={loading || password.length < 8 || !confirmPassword}>{loading ? <><Loader2 className="spin" size={18} /> Updating…</> : <>Update password <ArrowRight size={18} /></>}</button></form>}{!ready && <a className="primary auth-full-button" href="/forgot-password">Request a new reset link</a>}</section></main>;
}
