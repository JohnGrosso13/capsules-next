import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod";

import { serverEnv } from "@/lib/env/server";
import { ensureSupabaseUser } from "@/lib/auth/payload";
import { canCustomizeCapsule, resolveCapsuleActor } from "@/server/capsules/permissions";
import {
  createConnectOnboardingLink,
  getStripeConnectSettings,
  loadStoredConnectAccount,
} from "@/server/store/connect";
import { returnError, validatedJson } from "@/server/validation/http";

const statusResponseSchema = z.object({
  connectEnabled: z.boolean(),
  requireAccount: z.boolean(),
  platformFeeBasisPoints: z.number(),
  accountId: z.string().nullable(),
  onboardingComplete: z.boolean(),
  chargesEnabled: z.boolean(),
  payoutsEnabled: z.boolean(),
  detailsSubmitted: z.boolean(),
});

const onboardingRequestSchema = z.object({
  capsuleId: z.string(),
});

const onboardingResponseSchema = z.object({
  onboardingUrl: z.string().url(),
  accountId: z.string(),
  onboardingComplete: z.boolean(),
});

async function requireCapsuleOwner(capsuleId: string) {
  const { userId } = await auth();
  if (!userId) {
    throw returnError(401, "auth_required", "Sign in to manage payouts");
  }
  const user = await currentUser();
  if (!user) {
    throw returnError(401, "auth_required", "Sign in to manage payouts");
  }
  const supabaseUserId = await ensureSupabaseUser({
    key: `clerk:${user.id}`,
    provider: "clerk",
    clerk_id: user.id,
    email: user.emailAddresses[0]?.emailAddress ?? null,
    full_name: user.fullName ?? null,
    avatar_url: user.imageUrl ?? null,
  });
  const actor = await resolveCapsuleActor(capsuleId, supabaseUserId);
  if (!canCustomizeCapsule(actor)) {
    throw returnError(403, "forbidden", "You do not have permission to manage payouts for this capsule.");
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const capsuleId = searchParams.get("capsuleId");
  if (!capsuleId) {
    return returnError(400, "invalid_request", "capsuleId is required");
  }

  try {
    await requireCapsuleOwner(capsuleId);
  } catch (error) {
    if (error instanceof Response) return error;
    return returnError(500, "forbidden", "Unable to verify permissions");
  }

  try {
    const settings = getStripeConnectSettings();
    const account = settings.enabled
      ? await loadStoredConnectAccount(capsuleId, { refreshFromStripe: true })
      : null;

    return validatedJson(
      statusResponseSchema,
      {
        connectEnabled: settings.enabled,
        requireAccount: settings.requireAccount,
        platformFeeBasisPoints: settings.platformFeeBasisPoints,
        accountId: account?.stripeAccountId ?? null,
        onboardingComplete: account?.onboardingComplete ?? false,
        chargesEnabled: account?.chargesEnabled ?? false,
        payoutsEnabled: account?.payoutsEnabled ?? false,
        detailsSubmitted: account?.detailsSubmitted ?? false,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("store.connect.status_error", error);
    return returnError(500, "connect_status_error", "Unable to load payouts status");
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return returnError(400, "invalid_request", "Invalid JSON body");
  }
  const parsed = onboardingRequestSchema.safeParse(body);
  if (!parsed.success) {
    return returnError(400, "invalid_request", "Invalid onboarding request", parsed.error.flatten());
  }

  try {
    await requireCapsuleOwner(parsed.data.capsuleId);
  } catch (error) {
    if (error instanceof Response) return error;
    return returnError(500, "forbidden", "Unable to verify permissions");
  }

  const settings = getStripeConnectSettings();
  if (!settings.enabled) {
    return returnError(400, "connect_disabled", "Stripe Connect is not enabled for this environment");
  }

  try {
    const baseUrl = serverEnv.SITE_URL;
    const returnUrl = `${baseUrl}/orders?capsuleId=${encodeURIComponent(parsed.data.capsuleId)}`;
    const refreshUrl = `${baseUrl}/orders?capsuleId=${encodeURIComponent(parsed.data.capsuleId)}&onboarding=1`;
    const { url, account } = await createConnectOnboardingLink(parsed.data.capsuleId, { refreshUrl, returnUrl });
    return validatedJson(
      onboardingResponseSchema,
      {
        onboardingUrl: url,
        accountId: account.stripeAccountId,
        onboardingComplete: account.onboardingComplete,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("store.connect.onboarding_error", error);
    const message = error instanceof Error ? error.message : "Failed to start Stripe onboarding";
    return returnError(500, "connect_onboarding_failed", message);
  }
}
