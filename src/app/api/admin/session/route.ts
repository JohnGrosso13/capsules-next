import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { checkAdminAccess } from "@/lib/admin/guard";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const result = await checkAdminAccess(req);
    if (!result.ok) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }
    return NextResponse.json({ authenticated: true, via: result.via ?? null });
  } catch (error) {
    console.error("Admin session check failed", error);
    return NextResponse.json({ authenticated: false }, { status: 500 });
  }
}
