import { NextResponse } from "next/server";

import { getDatabaseAdminClient } from "@/config/database";
import { serverEnv } from "@/lib/env/server";
import { refreshCapsuleKnowledge } from "@/server/capsules/knowledge";

const PAGE_SIZE = 200;

type CapsuleRow = {
  id: string | null;
  name: string | null;
};

function isAuthorized(req: Request): boolean {
  const secret = serverEnv.ASSISTANT_REMINDER_SECRET ?? null;
  if (!secret) return false;
  const headerSecret = req.headers.get("x-cron-secret")?.trim();
  const querySecret = new URL(req.url).searchParams.get("secret")?.trim();
  return headerSecret === secret || querySecret === secret;
}

async function fetchCapsules(targetId?: string | null): Promise<CapsuleRow[]> {
  const db = getDatabaseAdminClient();
  if (targetId) {
    const result = await db
      .from("capsules")
      .select<CapsuleRow>("id, name")
      .eq("id", targetId)
      .maybeSingle();
    if (result.error) {
      throw result.error;
    }
    return result.data ? [result.data] : [];
  }

  const rows: CapsuleRow[] = [];
  let offset = 0;
  while (true) {
    const result = await db
      .from("capsules")
      .select<CapsuleRow>("id, name")
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)
      .fetch();
    if (result.error) {
      throw result.error;
    }
    const data = result.data ?? [];
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const capsuleId = searchParams.get("capsuleId");

  try {
    const capsules = await fetchCapsules(capsuleId);
    let processed = 0;
    for (const capsule of capsules) {
      const id = capsule.id ?? null;
      if (!id) continue;
      await refreshCapsuleKnowledge(id, capsule.name ?? null);
      processed += 1;
    }
    return NextResponse.json({ ok: true, processed, target: capsuleId ?? "all" });
  } catch (error) {
    console.error("knowledge cron failed", error);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}

export const runtime = "nodejs";
