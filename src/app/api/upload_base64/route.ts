import { NextResponse } from "next/server";

import { storeImageSrcToSupabase } from "@/lib/supabase/storage";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const filename = typeof body?.filename === "string" && body.filename.trim().length
      ? body.filename.trim()
      : `file-${Date.now()}`;
    const contentType = typeof body?.content_type === "string" && body.content_type.trim().length
      ? body.content_type.trim()
      : typeof body?.contentType === "string" && body.contentType.trim().length
        ? body.contentType.trim()
        : "application/octet-stream";
    const dataBase64Raw = typeof body?.data_base64 === "string" && body.data_base64.trim().length
      ? body.data_base64.trim()
      : typeof body?.dataBase64 === "string"
        ? body.dataBase64.trim()
        : "";
    if (!dataBase64Raw) {
      return NextResponse.json({ error: "data_base64 required" }, { status: 400 });
    }

    const normalized = dataBase64Raw.startsWith("data:")
      ? dataBase64Raw
      : `data:${contentType || "application/octet-stream"};base64,${dataBase64Raw.split(",").pop()}`;

    const saved = await storeImageSrcToSupabase(normalized, filename);
    if (!saved?.url) {
      return NextResponse.json({ error: "Failed to save image" }, { status: 500 });
    }
    return NextResponse.json({ url: saved.url, key: saved.key });
  } catch (error) {
    console.error("upload_base64 error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
