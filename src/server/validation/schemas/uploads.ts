import { z } from "zod";

const MAX_LABEL_LENGTH = 200;
const MAX_FILENAME_LENGTH = 260;
const MAX_CONTENT_TYPE_LENGTH = 180;
const MAX_KIND_LENGTH = 80;
const MAX_METADATA_KEY = 60;
const MAX_METADATA_VALUE = 1024;
const MAX_TURNSTILE_TOKEN = 2048;
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 * 1024; // 50 GB

export const uploadRequestSchema = z
  .object({
    filename: z.string().trim().min(1).max(MAX_LABEL_LENGTH).optional(),
    contentType: z.string().trim().min(1).max(MAX_LABEL_LENGTH).optional(),
    content_type: z.string().trim().min(1).max(MAX_LABEL_LENGTH).optional(),
    dataBase64: z.string().trim().min(1).optional(),
    data_base64: z.string().trim().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    const payload = value.dataBase64 ?? value.data_base64;
    if (!payload || !payload.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data_base64"],
        message: "data_base64 is required",
      });
    }
  })
  .transform((value) => {
    const filename = value.filename?.trim() ?? null;
    const contentTypeRaw = (value.contentType ?? value.content_type)?.trim() ?? null;
    const rawBase64 = (value.dataBase64 ?? value.data_base64)?.trim() ?? "";
    return {
      filename: filename && filename.length ? filename : null,
      contentType: contentTypeRaw && contentTypeRaw.length ? contentTypeRaw : null,
      dataBase64: rawBase64,
    };
  });

export type UploadRequest = z.infer<typeof uploadRequestSchema>;

export const uploadResponseSchema = z.object({
  url: z.string().url(),
  key: z.string().trim().min(1).optional(),
});

export type UploadResponse = z.infer<typeof uploadResponseSchema>;

const metadataValueSchema = z.union([
  z.string().max(MAX_METADATA_VALUE),
  z.number(),
  z.boolean(),
]);

export const directUploadRequestSchema = z
  .object({
    filename: z.string().optional(),
    contentType: z.string().optional(),
    content_type: z.string().optional(),
    contentLength: z.number().optional(),
    content_length: z.number().optional(),
    checksum: z.string().optional(),
    kind: z.string().optional(),
    metadata: z.record(z.string(), metadataValueSchema).optional(),
    turnstileToken: z.string().optional(),
    turnstile_token: z.string().optional(),
    totalParts: z.number().optional(),
    total_parts: z.number().optional(),
  })
  .refine((payload) => payload.filename ?? payload.contentType ?? payload.content_type, {
    path: ["filename"],
    message: "filename and contentType are required",
  })
  .transform((value) => {
    const filename = value.filename ?? null;
    const contentType = (value.contentType ?? value.content_type ?? "").trim();
    const contentLength = value.contentLength ?? value.content_length ?? null;
    const turnstileToken = (value.turnstileToken ?? value.turnstile_token ?? "").trim();
    const totalParts = value.totalParts ?? value.total_parts ?? null;
    return {
      filename: filename ? filename.trim() : null,
      contentType: contentType || null,
      contentLength,
      checksum: value.checksum ? value.checksum.trim() : null,
      kind: value.kind ? value.kind.trim() : null,
      metadata: value.metadata ?? null,
      turnstileToken,
      totalParts,
    };
  })
  .pipe(
    z.object({
      filename: z
        .string()
        .nullable()
        .refine((val) => !val || val.length <= MAX_FILENAME_LENGTH, {
          message: `filename must be <= ${MAX_FILENAME_LENGTH} characters`,
        }),
      contentType: z
        .string()
        .nullable()
        .refine((val) => !val || val.length <= MAX_CONTENT_TYPE_LENGTH, {
          message: `contentType must be <= ${MAX_CONTENT_TYPE_LENGTH} characters`,
        }),
      contentLength: z
        .number()
        .int()
        .positive()
        .max(MAX_FILE_SIZE_BYTES)
        .nullable(),
      checksum: z
        .string()
        .nullable()
        .refine((val) => !val || val.length <= 128, {
          message: "checksum must be <= 128 characters",
        }),
      kind: z
        .string()
        .nullable()
        .refine((val) => !val || val.length <= MAX_KIND_LENGTH, {
          message: `kind must be <= ${MAX_KIND_LENGTH} characters`,
        }),
      metadata: z
        .record(z.string().min(1).max(MAX_METADATA_KEY), metadataValueSchema)
        .nullable(),
      turnstileToken: z
        .string()
        .min(10)
        .max(MAX_TURNSTILE_TOKEN),
      totalParts: z
        .number()
        .int()
        .min(1)
        .max(10000)
        .nullable(),
    }),
  );

export type DirectUploadRequest = z.infer<typeof directUploadRequestSchema>;

export const directUploadResponseSchema = z.object({
  sessionId: z.string().uuid(),
  uploadId: z.string().min(1),
  key: z.string().min(1),
  bucket: z.string().min(1),
  partSize: z.number().positive(),
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().min(1),
        url: z.string().url(),
        expiresAt: z.string(),
      }),
    )
    .min(1),
  absoluteUrl: z.string().url().optional(),
});

export type DirectUploadResponse = z.infer<typeof directUploadResponseSchema>;

export const completeUploadSchema = z
  .object({
    sessionId: z.string().uuid().optional(),
    uploadId: z.string().min(1).optional(),
    key: z.string().min(1).optional(),
    parts: z
      .array(
        z.object({
          partNumber: z.number().int().min(1),
          etag: z.string().min(1).max(256),
        }),
      )
      .optional(),
    metadata: z.record(z.string(), metadataValueSchema).optional(),
  })
  .transform((value) => ({
    sessionId: value.sessionId ?? null,
    uploadId: value.uploadId ?? null,
    key: value.key ?? null,
    parts: value.parts ?? [],
    metadata: value.metadata ?? null,
  }))
  .pipe(
    z.object({
      sessionId: z.string().uuid().nullable(),
      uploadId: z.string().min(1).nullable(),
      key: z.string().min(1).nullable(),
      parts: z
        .array(
          z.object({
            partNumber: z.number().int().min(1),
            etag: z.string().min(1).max(256),
          }),
        )
        .min(1),
      metadata: z
        .record(z.string().min(1).max(MAX_METADATA_KEY), metadataValueSchema)
        .nullable(),
    }),
  )
  .superRefine((value, ctx) => {
    if (!value.sessionId && !value.uploadId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "sessionId or uploadId is required",
        path: ["sessionId"],
      })
    }
  });

export type CompleteUploadRequest = z.infer<typeof completeUploadSchema>;

export const completeUploadResponseSchema = z.object({
  sessionId: z.string().uuid().nullable(),
  key: z.string().min(1),
  url: z.string().url(),
});

export type CompleteUploadResponse = z.infer<typeof completeUploadResponseSchema>;

export const abortUploadSchema = z
  .object({
    sessionId: z.string().uuid().optional(),
    uploadId: z.string().min(1).optional(),
    key: z.string().min(1).optional(),
  })
  .transform((value) => ({
    sessionId: value.sessionId ?? null,
    uploadId: value.uploadId ?? null,
    key: value.key ?? null,
  }))
  .pipe(
    z.object({
      sessionId: z.string().uuid().nullable(),
      uploadId: z.string().min(1).nullable(),
      key: z.string().min(1).nullable(),
    }),
  );

export type AbortUploadRequest = z.infer<typeof abortUploadSchema>;
