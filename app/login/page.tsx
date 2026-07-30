"use client";

import { ArrowRight, CheckCircle2, FileCheck2, Loader2, MailCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { browserAuthConfigured, supabaseBrowser } from "@/lib/supabase-browser";

async function establishAppSession(accessToken: string) {
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ accessToken }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Could not open your ScopeFlow workspace.");
}

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [showResend, setShowResend] = useState(false);
  const authConfigured = browserAuthConfigured();

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" }).then((response) => {
      if (response.ok) window.location.href = "/app";
    });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setShowResend(false);
    if (!authConfigured) {
      setError("Authentication setup is incomplete. Add the public Supabase URL and anon key in Vercel.");
      return;
    }
    setLoading(true);
    try {
      const auth = supabaseBrowser().auth;
      if (mode === "login") {
        const { data, error: signInError } = await auth.signInWithPassword({ email: email.trim(), password });
        if (signInError) throw signInError;
        if (!data.session?.access_token) throw new Error("Could not create a sign-in session.");
        await establishAppSession(data.session.access_token);
        window.location.href = "/app";
        return;
      }

      const redirectTo = `${window.location.origin}/auth/callback`;
      const { data, error: signUpError } = await auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: { name: name.trim(), business_name: businessName.trim() },
        },
      });
      if (signUpError) throw signUpError;
      if (data.session?.access_token) {
        await establishAppSession(data.session.access_token);
        window.location.href = "/app";
        return;
      }
      setNotice("Check your email to confirm your account. The confirmation link will open your new workspace.");
      setPassword("");
    } catch (caught: any) {
      const message = String(caught?.message || "Could not continue");
      if (message.toLowerCase().includes("email not confirmed")) {
        setError("Confirm your email before signing in.");
        setShowResend(true);
      } else {
        setError(message.includes("Invalid login credentials") ? "Incorrect email or password." : message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function resendConfirmation() {
    if (!email || !authConfigured) return;
    setLoading(true); setError("");
    try {
      const { error: resendError } = await supabaseBrowser().auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (resendError) throw resendError;
      setNotice("A new confirmation email has been sent.");
    } catch (caught: any) {
      setError(caught?.message || "Could not resend the confirmation email.");
    } finally { setLoading(false); }
  }

  return <main className="login-page">
    <section className="login-showcase">
      <div className="login-brand"><div className="brand-mark"><Sparkles size={20} /></div><div><strong>ScopeFlow</strong><span>Flexible proposals, clearly approved</span></div></div>
      <div className="showcase-copy"><span className="login-eyebrow">Built for independent professionals</span><h1>Make every offer easier to understand—and easier to approve.</h1><p>Create a branded proposal, let clients select optional scope or suggest prices, then lock the final agreement into a downloadable document.</p><div className="showcase-points"><span><CheckCircle2 size={19} /> Secure client links with no client login</span><span><CheckCircle2 size={19} /> Simple negotiation and incentive progress</span><span><CheckCircle2 size={19} /> Exact approved proposal and invoice PDFs</span></div></div>
      <div className="showcase-card"><div><FileCheck2 size={22} /><span><strong>Website redesign proposal</strong><small>Approved agreement ready</small></span></div><div className="showcase-value"><span>Final approved total</span><strong>$4,275</strong></div><div className="showcase-progress"><span /><span /><span /><span /></div></div>
    </section>
    <section className="login-form-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="auth-tabs"><button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); setNotice(""); }}>Sign in</button><button type="button" className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setError(""); setNotice(""); }}>Create account</button></div>
        <div className="login-card-heading"><span>{mode === "signup" ? "Your independent workspace" : "Welcome back"}</span><h2>{mode === "signup" ? "Create your business account" : "Open your dashboard"}</h2><p>{mode === "signup" ? "Your business, services and proposals stay separate from every other account." : "Sign in to manage proposals, approvals and documents."}</p></div>
        {mode === "signup" && <div className="login-two"><label><span>Your name</span><input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" /></label><label><span>Business name</span><input autoComplete="organization" value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="Studio or business" /></label></div>}
        <label><span>Email address</span><input autoFocus type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" /></label>
        <label><span>Password</span><input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "signup" ? "At least 8 characters" : "Enter your password"} /></label>
        {mode === "login" && <div className="auth-help-row"><Link href="/forgot-password">Forgot password?</Link></div>}
        {!authConfigured && <div className="login-error">Authentication setup is incomplete. Add the public Supabase URL and anon key in Vercel.</div>}
        {error && <div className="login-error">{error}</div>}
        {notice && <div className="login-notice"><MailCheck size={18} /><span>{notice}</span></div>}
        <button className="login-submit" disabled={!authConfigured || !email || !password || (mode === "signup" && (!name || !businessName || password.length < 8)) || loading}>{loading ? <><Loader2 className="spin" size={18} /> Working…</> : <>{mode === "signup" ? "Create my workspace" : "Open dashboard"} <ArrowRight size={18} /></>}</button>
        {(showResend || (notice && mode === "signup")) && <button type="button" className="auth-link-button" disabled={loading} onClick={resendConfirmation}>Resend confirmation email</button>}
      </form>
    </section>
  </main>;
}
