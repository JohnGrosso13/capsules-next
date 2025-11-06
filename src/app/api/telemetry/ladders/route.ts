import { NextResponse } from "next/server";
import { z } from "zod";

const telemetrySchema = z.object({
  event: z.string(),
  capsuleId: z.string().optional().nullable(),
  ladderId: z.string().optional().nullable(),
  timestamp: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const payload = telemetrySchema.parse(json);
    console.info("ladders.telemetry", payload);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.warn("ladders.telemetry.error", error);
    return NextResponse.json({ error: "Invalid telemetry payload" }, { status: 400 });
  }
}
