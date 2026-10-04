export interface NeonAuthIdentity {
  id: string;
  email: string;
  name: string;
}

export const DEFAULT_NEON_AUTH_BASE_URL = "https://ep-quiet-mode-b53h20vo.neonauth.c-7.us-east-2.aws.neon.tech/scopeflow/auth";

function baseUrl() {
  return (process.env.NEON_AUTH_BASE_URL || DEFAULT_NEON_AUTH_BASE_URL).replace(/\/$/, "");
}

function errorMessage(body: any, fallback: string) {
  const message = String(body?.message || body?.error?.message || body?.error || fallback);
  const lower = message.toLowerCase();
  if (lower.includes("invalid") && lower.includes("credential")) return "Incorrect email or password.";
  if (lower.includes("password") && lower.includes("8")) return "Password must be at least 8 characters.";
  if (lower.includes("already") && lower.includes("exist")) return "An account with this email already exists.";
  return message;
}

async function neonAuthRequest(path: string, body: Record<string, unknown>, _origin?: string) {
  const response = await fetch(`${baseUrl()}/${path.replace(/^\//, "")}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(errorMessage(data, "Authentication request failed."));
    (error as any).status = response.status;
    (error as any).code = data?.code || data?.error?.code;
    throw error;
  }
  return data;
}

function identityFromResponse(data: any): NeonAuthIdentity {
  const raw = data?.user || data?.data?.user || data;
  const email = String(raw?.email || "").trim().toLowerCase();
  const id = String(raw?.id || raw?.userId || "").trim();
  const name = String(raw?.name || email.split("@")[0] || "ScopeFlow user").trim();
  if (!id || !email) throw new Error("Neon Auth returned an incomplete user record.");
  return { id, email, name };
}

export async function signInWithNeonAuth(email: string, password: string, origin?: string) {
  const data = await neonAuthRequest("sign-in/email", {
    email: email.trim().toLowerCase(),
    password,
    rememberMe: true,
  }, origin);
  return identityFromResponse(data);
}

export async function signUpWithNeonAuth(name: string, email: string, password: string, origin?: string) {
  const data = await neonAuthRequest("sign-up/email", {
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password,
  }, origin);
  return identityFromResponse(data);
}

export async function requestNeonPasswordReset(email: string, redirectTo: string, origin?: string) {
  await neonAuthRequest("request-password-reset", {
    email: email.trim().toLowerCase(),
    redirectTo,
  }, origin);
}

export async function resetNeonPassword(token: string, newPassword: string, origin?: string) {
  await neonAuthRequest("reset-password", { token, newPassword }, origin);
}
