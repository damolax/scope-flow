import { NextResponse } from "next/server";
import { cloudEnabled, publicAuthEnabled } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    cloud: cloudEnabled(),
    auth: publicAuthEnabled(),
    runtime: {
      neonDatabase: Boolean(process.env.DATABASE_URL),
      neonAuth: Boolean(process.env.NEON_AUTH_BASE_URL),
      supabaseDatabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      supabaseAuth: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    },
  });
}
