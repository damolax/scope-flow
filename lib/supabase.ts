import { createClient } from "@supabase/supabase-js";

export const DEFAULT_PLATFORM_ADMIN_EMAIL = "oyekunleolalekan3168@gmail.com";

export function platformAdminEmail() {
  return (process.env.PLATFORM_ADMIN_EMAIL || DEFAULT_PLATFORM_ADMIN_EMAIL).toLowerCase().trim();
}

export function cloudEnabled() {
  return Boolean(process.env.DATABASE_URL || (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY));
}

export function publicAuthEnabled() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function friendlyDatabaseError(error: unknown) {
  const message = String((error as any)?.message || error || "Database request failed");
  if (message.includes("sf_accounts") || message.includes("sf_workspaces") || message.includes("schema cache") || message.includes("PGRST205") || message.includes("relation") && message.includes("does not exist")) {
    return process.env.DATABASE_URL
      ? "Neon database setup is incomplete. Apply the ScopeFlow Neon schema to the configured DATABASE_URL."
      : "Database setup is incomplete. Run supabase/schema.sql in the Supabase project connected to this deployment.";
  }
  return message;
}
