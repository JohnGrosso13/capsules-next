import { NextResponse } from "next/server";
import { z } from "zod";

type ParseSuccess<T extends z.ZodTypeAny> = {
  success: true;
  data: z.infer<T>;
};

type ParseFailure = {
  success: false;
  response: NextResponse;
};

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export function returnError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): NextResponse {
  const payload: ErrorResponse = {
    error: code,
    message,
    ...(details === undefined ? {} : { details }),
  };
  const parsed = errorResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Error payload failed validation: ${parsed.error.message}`);
  }
  return NextResponse.json(parsed.data, { status });
}

export async function parseJsonBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
): Promise<ParseSuccess<T> | ParseFailure> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const formatted = result.error.flatten();
    return {
      success: false,
      response: returnError(400, "invalid_request", "Request body failed validation", formatted),
    };
  }
  return { success: true, data: result.data };
}

export function validatedJson<T extends z.ZodTypeAny>(
  schema: T,
  payload: z.infer<T>,
  init?: ResponseInit,
): NextResponse {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new Error(`Response payload failed validation: ${result.error.message}`);
  }
  return NextResponse.json(result.data, init);
}
