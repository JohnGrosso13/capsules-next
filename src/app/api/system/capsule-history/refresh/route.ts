import { NextResponse } from "next/server";

import { refreshStaleCapsuleHistories } from "@/server/capsules/service";

const REFRESH_TOKEN = process.env.CAPSULE_HISTORY_REFRESH_TOKEN ?? "";

export const runtime = "nodejs";

function isAuthorized(request: Request): boolean {
  if (!REFRESH_TOKEN) return false;
  const header = request.headers.get("authorization");
  if (header && header.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    if (token === REFRESH_TOKEN) return true;
  }
  const url = new URL(request.url);
  const tokenQuery = url.searchParams.get("token");
  if (tokenQuery && tokenQuery === REFRESH_TOKEN) return true;
  return false;
}

function parseOptionalInteger(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function handleRequest(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const queryLimit = parseOptionalInteger(url.searchParams.get("limit"));
  const queryStale = parseOptionalInteger(url.searchParams.get("stale"));

  let bodyLimit: number | undefined;
  let bodyStale: number | undefined;
  try {
    const body = await request.json();
    if (body && typeof body === "object") {
      if (typeof body.limit === "number" && Number.isFinite(body.limit)) {
        bodyLimit = body.limit;
      }
      if (
        typeof body.staleAfterMinutes === "number" &&
        Number.isFinite(body.staleAfterMinutes)
      ) {
        bodyStale = body.staleAfterMinutes;
      }
    }
  } catch {
    // ignore invalid JSON bodies
  }

  const result = await refreshStaleCapsuleHistories({
    limit: bodyLimit ?? queryLimit,
    staleAfterMinutes: bodyStale ?? queryStale,
  });

  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request);
}

export async function GET(request: Request): Promise<Response> {
  return handleRequest(request);
}
