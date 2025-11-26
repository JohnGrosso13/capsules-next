import type { ExecutionContext, ScheduledEvent } from "@cloudflare/workers-types";

const worker = {
  async scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    const endpoint = env.CRON_ENDPOINT;
    const secret = env.CRON_SECRET;
    if (!endpoint || !secret) {
      console.warn("knowledge-cron: missing CRON_ENDPOINT or CRON_SECRET");
      return;
    }
    const url = new URL(endpoint);
    if (env.CAPSULE_ID) {
      url.searchParams.set("capsuleId", env.CAPSULE_ID);
    }
    const start = Date.now();
    try {
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "x-cron-secret": secret,
        },
      });
      const text = await response.text();
      console.log("knowledge-cron run", {
        status: response.status,
        elapsedMs: Date.now() - start,
        body: text,
      });
    } catch (error) {
      console.warn("knowledge-cron failed", { error, elapsedMs: Date.now() - start });
    }
  },
};

export default worker;

export type Env = {
  CRON_ENDPOINT?: string;
  CRON_SECRET?: string;
  CAPSULE_ID?: string;
};
