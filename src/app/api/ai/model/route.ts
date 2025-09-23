import { NextResponse } from "next/server";

import { serverEnv } from "@/lib/env/server";

export function GET() {
  return NextResponse.json({ model: serverEnv.OPENAI_MODEL });
}
