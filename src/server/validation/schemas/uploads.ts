import { z } from "zod";

const MAX_LABEL_LENGTH = 200;

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
