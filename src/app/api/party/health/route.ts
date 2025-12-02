import { returnError } from "@/server/validation/http";

export const runtime = "nodejs";

function isLivekitConfigured() {
  const publishUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim();
  const serviceUrl = process.env.LIVEKIT_URL?.trim() ?? publishUrl;
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  return Boolean(publishUrl && serviceUrl && apiKey && apiSecret);
}

export async function GET() {
  try {
    const livekitConfigured = isLivekitConfigured();
    return Response.json(
      {
        livekitConfigured,
        transcriptionConfigured: livekitConfigured,
        assistantConfigured: livekitConfigured,
        timestamp: new Date().toISOString(),
      },
      { status: livekitConfigured ? 200 : 500 },
    );
  } catch (error) {
    console.error("Party health check failed", error);
    return returnError(500, "party_health_failed", "Party services could not be validated.");
  }
}
