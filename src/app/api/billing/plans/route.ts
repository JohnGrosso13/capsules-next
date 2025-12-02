import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { listPlans } from "@/server/billing/service";
import { ensureDefaultPlans } from "@/server/billing/plans";
import { returnError, validatedJson } from "@/server/validation/http";

export const runtime = "nodejs";

const responseSchema = z.object({
  personal: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      priceCents: z.number().nullable(),
      currency: z.string(),
      billingInterval: z.enum(["monthly", "yearly"]),
      includedCompute: z.number(),
      includedStorageBytes: z.number(),
      stripePriceId: z.string().nullable(),
    }),
  ),
  capsule: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      priceCents: z.number().nullable(),
      currency: z.string(),
      billingInterval: z.enum(["monthly", "yearly"]),
      includedCompute: z.number(),
      includedStorageBytes: z.number(),
      stripePriceId: z.string().nullable(),
    }),
  ),
});

export async function GET(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required");
  }

  await ensureDefaultPlans();
  const personal = await listPlans("user");
  const capsule = await listPlans("capsule");

  return validatedJson(responseSchema, {
    personal,
    capsule,
  });
}
