import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { requireCapsuleOwnership } from "@/server/capsules/domain/common";
import { resolveWalletContext } from "@/server/billing/entitlements";
import { transferBetweenWallets, getWalletWithBalance } from "@/server/billing/service";
import { returnError, validatedJson } from "@/server/validation/http";

export const runtime = "nodejs";

const requestSchema = z.object({
  fromCapsuleId: z.string().optional().nullable(),
  toCapsuleId: z.string(),
  metric: z.enum(["compute", "storage"]),
  amount: z.number().positive(),
  message: z.string().optional().nullable(),
});

const responseSchema = z.object({
  success: z.literal(true),
  fromWalletId: z.string(),
  toWalletId: z.string(),
});

export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return returnError(400, "invalid_request", "Invalid transfer payload", parsed.error.flatten());
  }

  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required");
  }

  const { fromCapsuleId, toCapsuleId, metric, amount, message } = parsed.data;

  if (fromCapsuleId) {
    try {
      await requireCapsuleOwnership(fromCapsuleId, ownerId);
    } catch (error) {
      const status = (error as { status?: number }).status ?? 403;
      return returnError(status, "forbidden", "You cannot transfer from this capsule");
    }
  }

  const fromContext = await resolveWalletContext({
    ownerType: fromCapsuleId ? "capsule" : "user",
    ownerId: fromCapsuleId ?? ownerId,
    supabaseUserId: ownerId,
    req,
  });

  const toContext = await getWalletWithBalance("capsule", toCapsuleId);

  try {
    await transferBetweenWallets({
      fromWalletId: fromContext.wallet.id,
      toWalletId: toContext.wallet.id,
      metric,
      amount,
      createdBy: ownerId,
      message: message ?? null,
    });
  } catch (error) {
    console.error("billing.transfer.failed", error);
    return returnError(500, "transfer_failed", "Unable to complete transfer");
  }

  return validatedJson(responseSchema, {
    success: true,
    fromWalletId: fromContext.wallet.id,
    toWalletId: toContext.wallet.id,
  });
}
