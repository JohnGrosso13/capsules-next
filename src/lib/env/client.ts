import { z } from "zod";

const optionalPublicUrl = z
  .string()
  .url()
  .optional()
  .transform((value) => (value ? value.replace(/\/$/, "") : null));

const optionalPublicString = z.string().optional().transform((value) => value ?? null);

const clientEnvSchema = z.object({
  SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  SUPABASE_ANON_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY cannot be empty"),
  CLERK_PUBLISHABLE_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY cannot be empty"),
  TURNSTILE_SITE_KEY: optionalPublicString,
  R2_PUBLIC_BASE_URL: optionalPublicUrl,
});

const rawClientEnv = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  R2_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL,
};

const parsedClientEnv = clientEnvSchema.safeParse(rawClientEnv);

if (!parsedClientEnv.success) {
  const formattedErrors = parsedClientEnv.error.flatten();
  const details = Object.entries(formattedErrors.fieldErrors)
    .map(([field, issues]) => `${field}: ${issues?.join(", ") ?? "invalid"}`)
    .join("; ");
  throw new Error(`Invalid public environment configuration: ${details}`);
}

export const clientEnv = Object.freeze(parsedClientEnv.data);
export type ClientEnv = typeof clientEnv;
