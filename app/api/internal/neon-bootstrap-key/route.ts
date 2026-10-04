import crypto from "crypto";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const TOKEN_HASH = "4d792adcede68d9fdb3be30a0ba0687916767c19114d212e6443dddb160b37bd";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  const actual = crypto.createHash("sha256").update(token).digest("hex");
  if (
    actual.length !== TOKEN_HASH.length ||
    !crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(TOKEN_HASH))
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "AUTH_SECRET is not configured" }, { status: 503 });
  }

  const key = crypto
    .createHmac("sha256", secret)
    .update("scopeflow/neon/database-url/v1")
    .digest("hex");

  return NextResponse.json({ key });
}
