import { NextResponse } from "next/server";
import { authEnabled, cloudEnabled } from "@/lib/platform";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ cloud: cloudEnabled(), auth: authEnabled(), provider: "neon" });
}
