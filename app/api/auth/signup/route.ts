import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json({ error: "Use Supabase Auth through the ScopeFlow account-creation page." }, { status: 410 });
}
