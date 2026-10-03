import crypto from "crypto";
import { neon } from "@neondatabase/serverless";

let client: ReturnType<typeof neon> | null = null;

// Production fallback: AES-256-GCM encrypted DATABASE_URL.
// The encryption key is domain-separated from AUTH_SECRET at runtime.
// These remain empty until the final Vercel cutover step.
const ENCRYPTED_DATABASE_URL = "";
const ENCRYPTED_DATABASE_IV = "";
const ENCRYPTED_DATABASE_TAG = "";

export function encryptedNeonDatabaseConfigured() {
  return Boolean(
    process.env.AUTH_SECRET &&
    ENCRYPTED_DATABASE_URL &&
    ENCRYPTED_DATABASE_IV &&
    ENCRYPTED_DATABASE_TAG
  );
}

export function neonDatabaseEnabled() {
  return Boolean(process.env.DATABASE_URL || encryptedNeonDatabaseConfigured());
}

function decryptedDatabaseUrl() {
  const override = process.env.DATABASE_URL;
  if (override) return override;

  const secret = process.env.AUTH_SECRET;
  if (!secret || !ENCRYPTED_DATABASE_URL || !ENCRYPTED_DATABASE_IV || !ENCRYPTED_DATABASE_TAG) {
    throw new Error("Neon database is not configured.");
  }

  const key = crypto
    .createHmac("sha256", secret)
    .update("scopeflow/neon/database-url/v1")
    .digest();

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ENCRYPTED_DATABASE_IV, "base64"),
  );
  decipher.setAuthTag(Buffer.from(ENCRYPTED_DATABASE_TAG, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(ENCRYPTED_DATABASE_URL, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function neonSql(): any {
  if (!client) client = neon(decryptedDatabaseUrl());
  return client;
}
