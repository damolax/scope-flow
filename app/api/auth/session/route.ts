import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Legacy session exchange is no longer used. ScopeFlow now authenticates with Neon." },
    { status: 410 },
  );
}
