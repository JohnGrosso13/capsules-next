#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { Pinecone } from "@pinecone-database/pinecone";

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
  content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .forEach((line) => {
      const idx = line.indexOf("=");
      if (idx === -1) return;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value.replace(/^"|"$/g, "");
      }
    });
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-large";

const PINECONE_API_KEY = process.env.PINECONE_API_KEY ?? null;
const PINECONE_INDEX = process.env.PINECONE_INDEX ?? null;
const PINECONE_CONTROLLER_HOST =
  process.env.PINECONE_CONTROLLER_HOST ??
  process.env.PINECONE_HOST ??
  process.env.PINECONE_API_HOST ??
  null;
const PINECONE_NAMESPACE =
  process.env.PINECONE_NAMESPACE ?? process.env.PINECONE_PROJECT_NAMESPACE ?? null;

let pineconeIndex = null;

if (PINECONE_API_KEY && PINECONE_INDEX) {
  try {
    const options = { apiKey: PINECONE_API_KEY };
    if (PINECONE_CONTROLLER_HOST) options.controllerHostUrl = PINECONE_CONTROLLER_HOST;

    const pinecone = new Pinecone(options);
    pineconeIndex = pinecone.index(PINECONE_INDEX);
    if (PINECONE_NAMESPACE) {
      pineconeIndex = pineconeIndex.namespace(PINECONE_NAMESPACE);
    }
  } catch (error) {
    console.warn("Pinecone init failed", error);
  }
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY environment variable.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
  },
});

async function embedText(input) {
  const text = String(input || "").slice(0, 8000);
  if (!text.trim()) return null;
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: OPENAI_EMBED_MODEL, input: text, encoding_format: "float" }),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("Embedding request failed", json || response.statusText);
    return null;
  }
  const embedding = json?.data?.[0]?.embedding;
  return Array.isArray(embedding) && embedding.length ? embedding : null;
}

async function main() {
  const pageSize = 50;
  let offset = 0;
  let totalUpdated = 0;
  console.log("Backfilling memory embeddings using", OPENAI_EMBED_MODEL);

  for (;;) {
    const { data, error } = await supabase
      .from("memories")
      .select(
        "id, owner_user_id, kind, post_id, title, description, media_type, media_url, meta, embedding",
      )
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("Supabase select error", error);
      process.exit(1);
    }

    if (!data || !data.length) {
      break;
    }

    for (const row of data) {
      const existing = row.embedding;
      if (Array.isArray(existing) && existing.length === 3072) {
        continue;
      }
      const parts = [];
      if (row.title) parts.push(String(row.title));
      if (row.description) parts.push(String(row.description));
      if (row.media_type) parts.push(String(row.media_type));
      const metaPrompt = row.meta && typeof row.meta === "object" ? JSON.stringify(row.meta) : "";
      if (metaPrompt && metaPrompt !== "{}") {
        parts.push(metaPrompt);
      }
      const text = parts.join("\n");
      const embedding = await embedText(text);
      if (!embedding) {
        console.warn("Skipped memory", row.id, "(no text to embed)");
        continue;
      }
      const { error: updateError } = await supabase
        .from("memories")
        .update({ embedding })
        .eq("id", row.id);
      if (updateError) {
        console.error("Update failed for", row.id, updateError);
        process.exit(1);
      }
      totalUpdated += 1;

      if (pineconeIndex && typeof row.owner_user_id === "string") {
        const metadata = { ownerId: row.owner_user_id };
        if (typeof row.kind === "string" && row.kind) metadata.kind = row.kind;
        if (typeof row.post_id === "string" && row.post_id) metadata.postId = row.post_id;
        if (typeof row.title === "string" && row.title) metadata.title = row.title.slice(0, 256);
        if (typeof row.description === "string" && row.description) {
          metadata.description = row.description.slice(0, 768);
        }
        if (typeof row.media_url === "string" && row.media_url)
          metadata.mediaUrl = row.media_url.slice(0, 512);
        if (typeof row.media_type === "string" && row.media_type)
          metadata.mediaType = row.media_type.slice(0, 120);

        try {
          await pineconeIndex.upsert([
            {
              id: String(row.id),
              values: embedding,
              metadata,
            },
          ]);
        } catch (pineconeError) {
          console.warn("Pinecone upsert failed", pineconeError);
        }
      }

      // Friendly pacing to avoid hitting rate limits
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    offset += pageSize;
  }

  console.log(`Backfill complete. Updated ${totalUpdated} memory rows.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
