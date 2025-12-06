import { handlePrintfulWebhook } from "@/server/store/service";
import { returnError } from "@/server/validation/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rawBody = await req.text();
  try {
    await handlePrintfulWebhook(rawBody, req.headers);
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("store.printful.webhook_error", error);
    return returnError(400, "invalid_webhook", "Failed to process Printful webhook");
  }
}
