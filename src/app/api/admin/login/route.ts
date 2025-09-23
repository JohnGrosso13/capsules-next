import { NextResponse } from "next/server";

import { buildAdminSessionCookie, verifyAdminCredentials } from "@/lib/admin/guard";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { username?: unknown; password?: unknown } | null;
    const username = typeof body?.username === "string" ? body.username.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!username || !password) {
      return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
    }

    const ok = await verifyAdminCredentials(username, password);
    if (!ok) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const response = NextResponse.json({ success: true });
    const session = buildAdminSessionCookie();
    response.cookies.set(session.name, session.value, session.options);
    return response;
  } catch (error) {
    console.error("Admin login error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
