import "dotenv/config";
import { createClient, type PostgrestSingleResponse } from "@supabase/supabase-js";

type MuxAiJob = {
  id: string;
  job_type: string;
  status: string;
  priority: number;
  payload: Record<string, unknown> | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to run mux-ai-jobs worker.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function fetchNextJob(): Promise<MuxAiJob | null> {
  const response: PostgrestSingleResponse<MuxAiJob | null> = await supabase
    .from("mux_ai_jobs")
    .select("*")
    .eq("status", "pending")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (response.error) {
    console.error("worker.fetchNextJob", response.error);
    return null;
  }
  return response.data ?? null;
}

async function markJob(
  id: string,
  patch: Partial<Pick<MuxAiJob, "status" | "started_at" | "completed_at">> & {
    error_message?: string | null;
    result?: Record<string, unknown> | null;
  },
) {
  const result = await supabase
    .from("mux_ai_jobs")
    .update(patch)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (result.error) {
    console.error("worker.markJob", id, result.error);
  }
}

async function handleJob(job: MuxAiJob) {
  const startedAt = new Date().toISOString();
  await markJob(job.id, { status: "processing", started_at: startedAt });

  try {
    switch (job.job_type) {
      case "live_transcription.start":
      case "live_transcription.stop":
      case "clips.detect":
      case "highlights.summary":
      case "thumbnails.generate":
      case "titles.generate":
      case "descriptions.generate":
      case "social.copy":
      case "recap.generate": {
        // TODO: implement real handlers. For now, mark as completed no-op to avoid pileup.
        break;
      }
      default: {
        console.warn("worker.unknownJobType", job.job_type);
      }
    }
    await markJob(job.id, {
      status: "completed",
      completed_at: new Date().toISOString(),
      result: { note: "No-op placeholder handler" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unhandled job error";
    await markJob(job.id, {
      status: "errored",
      error_message: message,
      completed_at: new Date().toISOString(),
    });
  }
}

async function main() {
  while (true) {
    const job = await fetchNextJob();
    if (!job) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      continue;
    }
    await handleJob(job);
  }
}

void main();
