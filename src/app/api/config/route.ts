import { NextResponse } from "next/server";

import { clientEnv } from "@/lib/env/client";
import { serverEnv } from "@/lib/env/server";

export async function GET() {
  try {
    const supabaseConfig =
      serverEnv.SUPABASE_URL && (clientEnv.SUPABASE_ANON_KEY || serverEnv.SUPABASE_ANON_KEY)
        ? {
            url: serverEnv.SUPABASE_URL,
            anonKey: clientEnv.SUPABASE_ANON_KEY || serverEnv.SUPABASE_ANON_KEY,
          }
        : null;
    return NextResponse.json({
      clerkPublishableKey: clientEnv.CLERK_PUBLISHABLE_KEY || serverEnv.CLERK_PUBLISHABLE_KEY || "",
      supabase: supabaseConfig,
      features: { realtime: !!supabaseConfig },
    });
  } catch (error) {
    console.error("Config endpoint error", error);
    return NextResponse.json({ error: "Failed to load config" }, { status: 500 });
  }
}
