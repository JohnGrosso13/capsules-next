import { z } from "zod";

export const ablyTokenRequestSchema = z
  .object({
    keyName: z.string(),
    ttl: z.union([z.number(), z.string()]).transform((value) => Number(value)).optional(),
    capability: z.string(),
    clientId: z.string().optional().nullable(),
    timestamp: z.union([z.number(), z.string()]).transform((value) => Number(value)),
    nonce: z.string(),
    mac: z.string(),
  })
  .passthrough();

export const realtimeTokenResponseSchema = z.object({
  tokenRequest: ablyTokenRequestSchema,
  environment: z.string().nullable(),
});
