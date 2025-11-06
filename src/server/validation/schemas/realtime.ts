import { z } from "zod";

const numericValue = z.preprocess((value) => {
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}, z.number());

const ablyTokenRequestPayloadSchema = z
  .object({
    keyName: z.string(),
    ttl: numericValue.optional(),
    capability: z.string(),
    clientId: z.string().optional().nullable(),
    timestamp: numericValue,
    nonce: z.string(),
    mac: z.string(),
  })
  .passthrough();

const ablyTokenDetailsSchema = z
  .object({
    token: z.string(),
    keyName: z.string(),
    capability: z.string(),
    clientId: z.string().optional().nullable(),
    issued: numericValue.optional(),
    expires: numericValue.optional(),
  })
  .passthrough();

export const ablyTokenRequestSchema = z.union([ablyTokenRequestPayloadSchema, ablyTokenDetailsSchema]);

export const realtimeTokenResponseSchema = z.object({
  provider: z.string(),
  token: z.unknown(),
  environment: z.string().nullable().optional(),
});
