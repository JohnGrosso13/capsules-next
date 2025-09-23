import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { checkAdminAccess } from "@/lib/admin/guard";
import { loadSubscribers } from "@/lib/admin/subscribers";

export async function GET(req: NextRequest) {
  try {
    const access = await checkAdminAccess(req, { allowToken: true });
    if (!access.ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const subscribers = await loadSubscribers();
    return NextResponse.json({ count: subscribers.length, subscribers });
  } catch (error) {
    console.error("Admin subscribers endpoint error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
