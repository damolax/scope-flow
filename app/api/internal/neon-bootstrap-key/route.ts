import crypto from "crypto";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const TOKEN_HASH = "3affec11cc4c11223173cf289c4a9b2f919b3ebf66e08c337e72a043908bdcec";

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
