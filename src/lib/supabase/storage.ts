import { Buffer } from "node:buffer";

import { randomUUID } from "node:crypto";



import { getSupabaseAdminClient } from "./admin";

import { serverEnv } from "../env/server";



function extFromContentType(contentType: string) {

  const map: Record<string, string> = {

    "image/jpeg": "jpg",

    "image/png": "png",

    "image/gif": "gif",

    "image/webp": "webp",

    "image/svg+xml": "svg",

  };

  return map[contentType.toLowerCase()] ?? "png";

}



export async function uploadBufferToStorage(buffer: Buffer, contentType: string, filenameHint = "asset") {

  const supabase = getSupabaseAdminClient();

  const bucket = serverEnv.SUPABASE_BUCKET;

  const timestamp = Date.now();

  const key = `uploads/${new Date(timestamp).toISOString().slice(0, 10)}/${filenameHint}-${randomUUID()}.${extFromContentType(contentType)}`;

  const { error } = await supabase.storage.from(bucket).upload(key, buffer, {

    contentType,

    upsert: false,

  });

  if (error) throw error;

  const publicUrl = supabase.storage.from(bucket).getPublicUrl(key);

  let url: string | null = publicUrl.data.publicUrl ?? null;

  if (!url) {

    const signed = await supabase.storage.from(bucket).createSignedUrl(key, 3600 * 24 * 365);

    url = signed.data?.signedUrl ?? null;

  }

  return { url, key };

}



export async function storeImageSrcToSupabase(src: string, filenameHint = "image") {

  if (!src) throw new Error("No image source provided");

  if (/^data:/i.test(src)) {

    const match = src.match(/^data:([^;]+);base64,(.*)$/i);

    if (!match) throw new Error("Invalid data URI");

    const contentType = match[1] || "image/png";

    const base64 = match[2] || "";

    const buffer = Buffer.from(base64, "base64");

    return uploadBufferToStorage(buffer, contentType, filenameHint);

  }

  const response = await fetch(src);

  if (!response.ok) throw new Error(`Failed to fetch remote image (${response.status})`);

  const arrayBuffer = await response.arrayBuffer();

  const buffer = Buffer.from(arrayBuffer);

  const contentType = response.headers.get("content-type") || "image/png";

  return uploadBufferToStorage(buffer, contentType, filenameHint);

}

