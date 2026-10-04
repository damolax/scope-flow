"use client";

import { ArrowRight, CheckCircle2, FileCheck2, Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import ScopeFlowMark from "@/components/ScopeFlowMark";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [authConfigured, setAuthConfigured] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" }).then((response) => {
      if (response.ok) window.location.href = "/app";
    });

    fetch("/api/config", { cache: "no-store" })
      .then((response) => response.json())
      .then((config) => setAuthConfigured(Boolean(config.cloud && config.auth)))
      .catch(() => setAuthConfigured(false));

    const params = new URLSearchParams(window.location.search);
    if (params.get("account") === "deleted") {
      setNotice("Your ScopeFlow workspace was deleted and the account was disabled.");
    }
    if (params.get("reset") === "success") {
      setNotice("Your password was updated. Sign in with your new password.");
    }
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!authConfigured) {
      setError("Neon authentication setup is incomplete.");
      return;
    }

    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/signup";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "login"
            ? { email: email.trim(), password }
            : { name: name.trim(), businessName: businessName.trim(), email: email.trim(), password },
        ),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not continue.");
      window.location.href = "/app";
    } catch (caught: any) {
      setError(String(caught?.message || "Could not continue."));
    } finally {
      setLoading(false);
    }
  }

  return <main className="login-page">
    <section className="login-showcase">
      <div className="login-brand"><div className="brand-mark"><ScopeFlowMark size={22} /></div><div><strong>ScopeFlow</strong><span>Flexible proposals, clearly approved</span></div></div>
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
        {!authConfigured && <div className="login-error">Neon authentication setup is incomplete.</div>}
        {error && <div className="login-error">{error}</div>}
        {notice && <div className="login-notice"><MailCheck size={18} /><span>{notice}</span></div>}
        <button className="login-submit" disabled={!authConfigured || !email || !password || (mode === "signup" && (!name || !businessName || password.length < 8)) || loading}>{loading ? <><Loader2 className="spin" size={18} /> Working…</> : <>{mode === "signup" ? "Create my workspace" : "Open dashboard"} <ArrowRight size={18} /></>}</button>
      </form>
    </section>
  </main>;
}
