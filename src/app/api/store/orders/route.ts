import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod";

import { listOrdersForCapsuleOwner, listViewerOrders } from "@/server/store/service";
import { returnError, validatedJson } from "@/server/validation/http";
import { ensureSupabaseUser } from "@/lib/auth/payload";
import { canCustomizeCapsule, resolveCapsuleActor } from "@/server/capsules/permissions";

const orderItemSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  productId: z.string().nullable(),
  title: z.string(),
  quantity: z.number(),
  unitPriceCents: z.number(),
  totalCents: z.number(),
  currency: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const orderSchema = z.object({
  id: z.string(),
  capsuleId: z.string().nullable(),
  status: z.string(),
  paymentStatus: z.string(),
  subtotalCents: z.number(),
  taxCents: z.number(),
  feeCents: z.number(),
  totalCents: z.number(),
  currency: z.string(),
  shippingStatus: z.string(),
  shippingTracking: z.string().nullable(),
  shippingCarrier: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  confirmationCode: z.string().nullable(),
});

const responseSchema = z.object({
  orders: z.array(
    z.object({
      order: orderSchema,
      items: z.array(orderItemSchema),
    }),
  ),
});

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to view orders");
  }

  const user = await currentUser();
  if (!user) {
    return returnError(401, "auth_required", "Sign in to view orders");
  }

  const supabaseUserId = await ensureSupabaseUser({
    key: `clerk:${user.id}`,
    provider: "clerk",
    clerk_id: user.id,
    email: user.emailAddresses[0]?.emailAddress ?? null,
    full_name: user.fullName ?? null,
    avatar_url: user.imageUrl ?? null,
  });

  const { searchParams } = new URL(req.url);
  const capsuleId = searchParams.get("capsuleId");
  const orderIdFilter = searchParams.get("orderId");

  try {
    let orders;

    if (capsuleId) {
      const actor = await resolveCapsuleActor(capsuleId, supabaseUserId);
      if (canCustomizeCapsule(actor)) {
        orders = await listOrdersForCapsuleOwner(capsuleId);
      } else {
        return returnError(403, "forbidden", "You do not have permission to view this capsule's orders.");
      }
    } else {
      orders = await listViewerOrders(supabaseUserId, capsuleId);
    }

    const filtered = orderIdFilter ? orders.filter((entry) => entry.order.id === orderIdFilter) : orders;
    return validatedJson(
      responseSchema,
      {
        orders: filtered.map((entry) => ({
          order: {
            id: entry.order.id,
            capsuleId: entry.order.capsuleId,
            status: entry.order.status,
            paymentStatus: entry.order.paymentStatus,
            subtotalCents: entry.order.subtotalCents,
            taxCents: entry.order.taxCents,
            feeCents: entry.order.feeCents,
            totalCents: entry.order.totalCents,
            currency: entry.order.currency,
            shippingStatus: entry.order.shippingStatus,
            shippingTracking: entry.order.shippingTracking,
            shippingCarrier: entry.order.shippingCarrier,
            createdAt: entry.order.createdAt,
            updatedAt: entry.order.updatedAt,
            confirmationCode: entry.order.confirmationCode,
          },
          items: entry.items.map((item) => ({
            id: item.id,
            orderId: item.orderId,
            productId: item.productId,
            title: item.title,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            totalCents: item.totalCents,
            currency: item.currency,
            metadata: item.metadata ?? {},
          })),
        })),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("store.orders.list_error", error);
    return returnError(500, "orders_error", "Unable to load orders");
  }
}
