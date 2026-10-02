import crypto from "crypto";
import { cookies } from "next/headers";
import { SessionUser } from "./types";
import { cloudEnabled, platformAdminEmail, supabaseAdmin } from "./supabase";
import { neonDatabaseEnabled, neonSql } from "./neon";

const COOKIE_NAME = "scopeflow_session";
const maxAge = 60 * 60 * 24 * 14;

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value && process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is required in production.");
  return value || "scopeflow-local-development-only";
}

function sign(value: string) {
  return crypto.createHmac("sha256", secret()).update(value).digest("hex");
}

export async function createSessionCookie(user: SessionUser) {
  const payload = Buffer.from(JSON.stringify({ ...user, issuedAt: Date.now() })).toString("base64url");
  const value = `${payload}.${sign(payload)}`;
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
}

function decode(value: string): SessionUser | null {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (Date.now() - Number(parsed.issuedAt) >= maxAge * 1000) return null;
    return {
      id: String(parsed.id),
      name: String(parsed.name),
      email: String(parsed.email).toLowerCase(),
      businessName: parsed.businessName ? String(parsed.businessName) : undefined,
      source: "database",
      isAdmin: Boolean(parsed.isAdmin),
    };
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value;
  if (!value) return null;
  const session = decode(value);
  if (!session) return null;
  if (!cloudEnabled()) return null;

  if (neonDatabaseEnabled()) {
    const rows = await neonSql()`select id,name,email,business_name,active,is_admin from sf_accounts where id=${session.id} limit 1`;
    const data: any = rows[0];
    if (!data?.active) return null;
    const email = String(data.email || session.email).toLowerCase();
    return {
      id: String(data.id),
      name: String(data.name || session.name),
      email,
      businessName: String(data.business_name || session.businessName || ""),
      source: "database",
      isAdmin: Boolean(data.is_admin) || email === platformAdminEmail(),
    };
  }

  const { data, error } = await supabaseAdmin()
    .from("sf_accounts")
    .select("id,name,email,business_name,active,is_admin")
    .eq("id", session.id)
    .maybeSingle();
  if (error || !data?.active) return null;
  const email = String(data.email || session.email).toLowerCase();
  return {
    id: String(data.id),
    name: String(data.name || session.name),
    email,
    businessName: String(data.business_name || session.businessName || ""),
    source: "database",
    isAdmin: Boolean(data.is_admin) || email === platformAdminEmail(),
  };
}
