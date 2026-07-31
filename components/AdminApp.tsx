"use client";

import { ArrowLeft, CheckCircle2, Clock3, FileCheck2, Loader2, Search, ShieldCheck, UsersRound, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import LoadingScreen from "./LoadingScreen";

type Account = {
  id: string; name: string; businessName: string; email: string; active: boolean; isAdmin: boolean;
  createdAt?: string; lastSignInAt?: string; proposalCount: number; approvedCount: number; awaitingCount: number;
};

function date(value?: string) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export default function AdminApp() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  async function load() {
    const response = await fetch("/api/admin/accounts", { cache: "no-store" });
    const body = await response.json();
    if (response.status === 401) { window.location.href = "/login"; return; }
    if (response.status === 403) { window.location.href = "/app"; return; }
    if (!response.ok) throw new Error(body.error || "Could not load accounts.");
    setAccounts(body.accounts); setCurrentUserId(body.currentUserId);
  }

  useEffect(() => { load().catch((caught) => setError(caught.message)).finally(() => setLoading(false)); }, []);

  const visible = useMemo(() => accounts.filter((account) => `${account.name} ${account.businessName} ${account.email}`.toLowerCase().includes(search.toLowerCase())), [accounts, search]);
  const active = accounts.filter((account) => account.active).length;
  const proposals = accounts.reduce((sum, account) => sum + account.proposalCount, 0);
  const approved = accounts.reduce((sum, account) => sum + account.approvedCount, 0);

  async function toggle(account: Account) {
    if (account.id === currentUserId || account.isAdmin) return;
    setWorkingId(account.id); setError("");
    try {
      const response = await fetch(`/api/admin/accounts/${account.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !account.active }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not update the account.");
      setAccounts((items) => items.map((item) => item.id === account.id ? { ...item, active: body.account.active } : item));
    } catch (caught: any) { setError(caught.message); }
    finally { setWorkingId(""); }
  }

  if (loading) return <LoadingScreen title="Opening administrator console" text="Loading ScopeFlow accounts…" icon={ShieldCheck} />;

  return <main className="admin-page">
    <header className="admin-header"><a href="/app"><ArrowLeft size={17} /> Workspace</a><div><span className="brand-orb"><ShieldCheck size={19} /></span><strong>ScopeFlow administration</strong></div><small>Protected platform access</small></header>
    <div className="admin-content">
      <section className="admin-hero"><div><span className="eyebrow">Platform overview</span><h1>Independent businesses, safely separated.</h1><p>Manage account access without entering a user’s proposals or client documents.</p></div><div className="admin-shield"><ShieldCheck size={34} /><span><strong>Administrator</strong><small>oyekunleolalekan3168@gmail.com</small></span></div></section>
      <section className="admin-metrics"><div><UsersRound size={19} /><span><strong>{accounts.length}</strong><small>Total accounts</small></span></div><div><CheckCircle2 size={19} /><span><strong>{active}</strong><small>Active accounts</small></span></div><div><Clock3 size={19} /><span><strong>{proposals}</strong><small>Total proposals</small></span></div><div><FileCheck2 size={19} /><span><strong>{approved}</strong><small>Approved proposals</small></span></div></section>
      <section className="admin-panel"><div className="admin-panel-head"><div><h2>Business accounts</h2><p>Disable access when necessary. Data remains preserved.</p></div><label className="admin-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search accounts" /></label></div>{error && <div className="login-error admin-error">{error}</div>}<div className="admin-table-head"><span>Business</span><span>Usage</span><span>Last sign in</span><span>Status</span></div><div className="admin-account-list">{visible.map((account) => <article key={account.id} className={!account.active ? "disabled" : ""}><div className="admin-account-main"><span className="admin-avatar">{account.businessName.slice(0, 2).toUpperCase()}</span><div><strong>{account.businessName}</strong><small>{account.name} · {account.email}</small>{account.isAdmin && <em>Platform admin</em>}</div></div><div className="admin-usage"><strong>{account.proposalCount} proposals</strong><small>{account.approvedCount} approved · {account.awaitingCount} open</small></div><div className="admin-date"><strong>{date(account.lastSignInAt)}</strong><small>Joined {date(account.createdAt)}</small></div><div className="admin-status"><span className={account.active ? "active" : "inactive"}>{account.active ? <CheckCircle2 size={14} /> : <XCircle size={14} />}{account.active ? "Active" : "Disabled"}</span><button disabled={account.id === currentUserId || account.isAdmin || workingId === account.id} onClick={() => toggle(account)}>{workingId === account.id ? <Loader2 className="spin" size={15} /> : account.active ? "Disable" : "Enable"}</button></div></article>)}</div>{visible.length === 0 && <div className="admin-empty">No accounts match your search.</div>}</section>
    </div>
  </main>;
}
