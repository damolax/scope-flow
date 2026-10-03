"use client";

import { ShieldCheck } from "lucide-react";
import { useEffect } from "react";

export default function AuthCallbackPage() {
  useEffect(() => {
    window.location.replace("/login");
  }, []);

  return <main className="auth-simple-page"><section className="auth-simple-card"><div className="auth-simple-icon"><ShieldCheck size={25} /></div><span className="eyebrow">Secure authentication</span><h1>Opening ScopeFlow</h1><p>ScopeFlow now uses Neon authentication. Returning you to sign in…</p></section></main>;
}
