import { z } from "zod";

export const userPayloadSchema = z
  .object({
    key: z.string().min(1).optional(),
    provider: z.string().min(1).optional(),
    clerk_id: z.string().min(1).optional().or(z.null()),
    email: z.string().email().optional().or(z.null()),
    full_name: z.string().min(1).optional().or(z.null()),
    avatar_url: z.string().url().optional().or(z.null()),
  })
  .catchall(z.unknown());

export const requestUserEnvelopeSchema = z.object({
  user: userPayloadSchema.optional(),
});
