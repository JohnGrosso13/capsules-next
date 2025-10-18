import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { checkAdminAccess } from "@/lib/admin/guard";
import { loadSubscribers } from "@/lib/admin/subscribers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const access = await checkAdminAccess(req, { allowToken: true });
    if (!access.ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const subscribers = await loadSubscribers();
    const headers = ["email", "source", "confirmed_at", "created_at"];
    const rows = subscribers.map((row) => [
      row.email,
      row.source ?? "",
      row.confirmed_at ?? "",
      row.created_at ?? "",
    ]);
    const csv = [
      headers.join(","),
      ...rows.map((columns) => columns.map(escapeCsvField).join(",")),
    ].join("\r\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="confirmed-subscribers.csv"',
      },
    });
  } catch (error) {
    console.error("Admin export error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function escapeCsvField(value: string) {
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
