import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { returnError, validatedJson } from "@/server/validation/http";
import { generatePrintfulMockup, hasPrintfulCredentials, type PrintfulMockupImage } from "@/server/store/printful";

const requestSchema = z.object({
  productId: z.number().int().positive(),
  variantIds: z.array(z.number().int().positive()).nonempty(),
  imageUrl: z.string().url(),
  placement: z.string().optional(),
  storeId: z.string().optional(),
});

const responseSchema = z.object({
  mockups: z.array(
    z.object({
      url: z.string().url(),
      position: z.string().nullable(),
      variantIds: z.array(z.number()),
    }),
  ),
});

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to generate mockups");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return returnError(400, "invalid_request", "Invalid JSON payload");
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return returnError(400, "invalid_request", "Invalid mockup request", parsed.error.flatten());
  }

  if (!hasPrintfulCredentials()) {
    return returnError(503, "printful_unavailable", "Printful API key is not configured.");
  }

  const result = await generatePrintfulMockup({
    productId: parsed.data.productId,
    variantIds: parsed.data.variantIds,
    imageUrl: parsed.data.imageUrl,
    placement: parsed.data.placement ?? "front",
    storeId: parsed.data.storeId ?? null,
  });

  if (result.status !== "completed") {
    return returnError(
      502,
      "mockup_failed",
      result.error ?? "Printful mockup could not be generated. Try again in a moment.",
    );
  }

  const payload: { mockups: PrintfulMockupImage[] } = {
    mockups: result.mockups,
  };

  return validatedJson(responseSchema, payload, { status: 200 });
}
