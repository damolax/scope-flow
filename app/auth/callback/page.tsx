"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

async function establish(accessToken: string) {
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ accessToken }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Could not complete authentication.");
}

export default function AuthCallbackPage() {
  const [error, setError] = useState("");
  useEffect(() => {
    let finished = false;
    const auth = supabaseBrowser().auth;
    async function complete() {
      try {
        const query = new URLSearchParams(window.location.search);
        const code = query.get("code");
        if (code) await auth.exchangeCodeForSession(code);
        const hashError = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("error_description");
        if (hashError) throw new Error(hashError);
        const { data } = await auth.getSession();
        if (!data.session?.access_token) return false;
        await establish(data.session.access_token);
        finished = true;
        window.location.replace(query.get("next") || "/app");
        return true;
      } catch (caught: any) {
        finished = true;
        setError(caught?.message || "The authentication link is invalid or expired.");
        return true;
      }
    }
    void complete().then((done) => {
      if (done) return;
      const { data: subscription } = auth.onAuthStateChange((_event: string, session: any) => {
        if (!session?.access_token || finished) return;
        void establish(session.access_token).then(() => {
          finished = true;
          const query = new URLSearchParams(window.location.search);
          window.location.replace(query.get("next") || "/app");
        }).catch((caught) => { finished = true; setError(caught.message); });
      });
      const timer = window.setTimeout(() => { if (!finished) setError("The authentication link is invalid or expired. Request a new link."); }, 8000);
      return () => { subscription.subscription.unsubscribe(); window.clearTimeout(timer); };
    });
  }, []);

  return <main className="auth-simple-page"><section className="auth-simple-card"><div className="auth-simple-icon"><ShieldCheck size={25} /></div><span className="eyebrow">Secure authentication</span><h1>{error ? "Link could not be completed" : "Opening your workspace"}</h1><p>{error || "Confirming your account and preparing ScopeFlow…"}</p>{!error && <Loader2 className="spin auth-loader" size={24} />}{error && <a className="primary auth-full-button" href="/login">Return to sign in</a>}</section></main>;
}
