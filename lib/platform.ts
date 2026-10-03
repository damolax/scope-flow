export const DEFAULT_PLATFORM_ADMIN_EMAIL = "oyekunleolalekan3168@gmail.com";

export function platformAdminEmail() {
  return (process.env.PLATFORM_ADMIN_EMAIL || DEFAULT_PLATFORM_ADMIN_EMAIL).toLowerCase().trim();
}

export function cloudEnabled() {
  return Boolean(process.env.DATABASE_URL);
}

export function authEnabled() {
  return true;
}

export function friendlyDatabaseError(error: unknown) {
  const message = String((error as any)?.message || error || "Database request failed");
  const lower = message.toLowerCase();
  if (
    lower.includes("sf_accounts") ||
    lower.includes("sf_workspaces") ||
    lower.includes("sf_proposals") ||
    (lower.includes("relation") && lower.includes("does not exist"))
  ) {
    return "Neon database setup is incomplete. Apply neon/schema.sql to the configured ScopeFlow database.";
  }
  return message;
}
