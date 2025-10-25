import { NextResponse } from "next/server";
import { z } from "zod";

const telemetryPayloadSchema = z.object({
  action: z.enum(["select", "oversize_rejected"]),
  provider: z.string().min(1),
  gifId: z.string().min(1),
  size: z.number().int().nonnegative().nullable().optional(),
  conversationId: z.string().optional(),
  timestamp: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const payload = telemetryPayloadSchema.parse(body);
    console.info("chat.gif.telemetry", {
      ...payload,
      timestamp: new Date().toISOString(),
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.warn("chat.gif.telemetry.error", error);
    return NextResponse.json({ error: "Invalid telemetry payload" }, { status: 400 });
  }
}
