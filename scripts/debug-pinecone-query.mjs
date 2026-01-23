import fs from "node:fs";
import path from "node:path";
import { Pinecone } from "@pinecone-database/pinecone";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const contents = fs.readFileSync(envPath, "utf8");
  contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .forEach((line) => {
      const eqIndex = line.indexOf("=");
      if (eqIndex === -1) return;
      const key = line.slice(0, eqIndex).trim();
      const value = line.slice(eqIndex + 1).trim();
      if (!key || process.env[key] !== undefined) return;
      process.env[key] = value;
    });
}

async function embed(text) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  const model = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-large";
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: text,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI embeddings error: ${response.status} ${body}`);
  }
  const data = await response.json();
  const embedding = data?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error("No embedding returned");
  }
  return embedding;
}

async function main() {
  loadEnvLocal();

  const apiKey = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX;

  if (!apiKey || !indexName) {
    console.error("PINECONE_API_KEY or PINECONE_INDEX is not set");
    process.exit(1);
  }

  const queryText = process.argv[2] || "Can you find my birthday posts?";
  const ownerId =
    process.argv[3] || "f750d15e-e684-4964-a132-6105d3ffead0";

  console.log("Embedding query:", queryText);
  const vector = await embed(queryText);

  const client = new Pinecone({ apiKey });
  const index = client.index(indexName);

  const result = await index.query({
    topK: 10,
    vector,
    includeMetadata: true,
    filter: { ownerId },
  });

  console.log("Query matches:", JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("debug-pinecone-query error", error);
  process.exit(1);
});

