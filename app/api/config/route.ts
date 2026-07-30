import { NextResponse } from "next/server";
import { cloudEnabled, publicAuthEnabled } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ cloud: cloudEnabled(), auth: publicAuthEnabled() });
}
