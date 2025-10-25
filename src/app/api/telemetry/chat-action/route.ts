import { NextResponse } from "next/server";
import { z } from "zod";

const payloadSchema = z.object({
  action: z.string(),
  conversationId: z.string().optional(),
  messageId: z.string().optional(),
  attachmentId: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const payload = payloadSchema.parse(body);
    console.info("chat.action.telemetry", {
      ...payload,
      timestamp: new Date().toISOString(),
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.warn("chat.action.telemetry.error", error);
    return NextResponse.json({ error: "Invalid telemetry payload" }, { status: 400 });
  }
}
