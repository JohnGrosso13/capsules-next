import type { MessageBatch } from "@cloudflare/workers-types";

type ArtifactEmbeddingJob = {
  artifactId: string;
  version: number;
  reason?: string;
};

export interface Env {
  PINECONE_INDEX?: string;
  PINECONE_NAMESPACE?: string;
  ARTIFACT_EMBEDDING_GATEWAY?: string;
}

async function processJob(job: ArtifactEmbeddingJob, env: Env): Promise<void> {
  console.log("artifact embedding job", {
    job,
    index: env.PINECONE_INDEX,
    namespace: env.PINECONE_NAMESPACE,
  });
  if (!env.PINECONE_INDEX || !env.PINECONE_NAMESPACE) {
    console.warn("pinecone configuration missing; skipping embedding enqueue");
    return;
  }
  const gateway = env.ARTIFACT_EMBEDDING_GATEWAY;
  if (gateway) {
    await fetch(gateway, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(job),
    }).catch((error) => {
      console.error("artifact embedding gateway call failed", error);
    });
  }
}

const worker = {
  async fetch(_request: Request): Promise<Response> {
    return new Response("artifact-embeddings-ok", {
      headers: { "content-type": "text/plain" },
    });
  },

  async queue(batch: MessageBatch<ArtifactEmbeddingJob>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const body = message.body as Partial<ArtifactEmbeddingJob> | null | undefined;
      if (!body || typeof body.artifactId !== "string" || typeof body.version !== "number") {
        console.warn("artifact embedding queue received invalid payload", body);
        message.ack();
        continue;
      }
      try {
        const job: ArtifactEmbeddingJob = {
          artifactId: body.artifactId,
          version: body.version,
        };
        if (typeof body.reason === "string") {
          job.reason = body.reason;
        }
        await processJob(job, env);
        message.ack();
      } catch (error) {
        console.error("artifact embedding job failed", error);
        message.retry({ delaySeconds: 30 });
      }
    }
  },
};

export default worker;

