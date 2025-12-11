import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod";

import { ensureSupabaseUser } from "@/lib/auth/payload";
import { CapsuleMembershipError, requireCapsuleOwnership } from "@/server/capsules/service";
import { getStoreDashboard } from "@/server/store/dashboard";
import { returnError, validatedJson } from "@/server/validation/http";

const dashboardSchema = z.object({
  capsuleId: z.string(),
  currency: z.string(),
  summary: z.object({
    grossLast30Cents: z.number(),
    netLast30Cents: z.number(),
    totalOrders: z.number(),
    openOrders: z.number(),
    inTransitOrders: z.number(),
    fulfilledOrders: z.number(),
    failedOrders: z.number(),
    pendingPayment: z.number(),
    lastOrderAt: z.string().nullable(),
  }),
  recentOrders: z.array(
    z.object({
      id: z.string(),
      confirmationCode: z.string().nullable(),
      status: z.string(),
      paymentStatus: z.string(),
      shippingStatus: z.string(),
      shippingTracking: z.string().nullable(),
      shippingCarrier: z.string().nullable(),
      createdAt: z.string(),
      totalCents: z.number(),
      netRevenueCents: z.number(),
      currency: z.string(),
      itemSummary: z.string(),
      itemCount: z.number(),
    }),
  ),
  catalog: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      priceCents: z.number(),
      currency: z.string(),
      active: z.boolean(),
      featured: z.boolean(),
      kind: z.string(),
      fulfillmentKind: z.string(),
    }),
  ),
});

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to view your store dashboard.");
  }

  const user = await currentUser();
  if (!user) {
    return returnError(401, "auth_required", "Sign in to view your store dashboard.");
  }

  const { searchParams } = new URL(req.url);
  const capsuleId = searchParams.get("capsuleId")?.trim();
  if (!capsuleId) {
    return returnError(400, "invalid_request", "capsuleId is required.");
  }

  const supabaseUserId = await ensureSupabaseUser({
    key: `clerk:${user.id}`,
    provider: "clerk",
    clerk_id: user.id,
    email: user.emailAddresses[0]?.emailAddress ?? null,
    full_name: user.fullName ?? null,
    avatar_url: user.imageUrl ?? null,
  });

  try {
    await requireCapsuleOwnership(capsuleId, supabaseUserId);
  } catch (error) {
    if (error instanceof CapsuleMembershipError) {
      return returnError(error.status, error.code, error.message);
    }
    return returnError(403, "forbidden", "You do not have permission to view this capsule.");
  }

  try {
    const dashboard = await getStoreDashboard(capsuleId);
    return validatedJson(dashboardSchema, dashboard, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("store.dashboard.error", { capsuleId, error });
    return returnError(500, "dashboard_error", "Unable to load store dashboard.");
  }
}
