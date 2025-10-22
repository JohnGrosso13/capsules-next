import { NextResponse } from "next/server";

import { safeUnwrapMuxWebhookEvent } from "@/adapters/mux/server";
import { handleMuxWebhook } from "@/server/mux/service";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const event = safeUnwrapMuxWebhookEvent(rawBody, headers);
  if (!event) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  try {
    await handleMuxWebhook(event);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("mux.webhook.unhandled", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
