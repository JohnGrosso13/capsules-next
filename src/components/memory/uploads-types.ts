export type MemoryUploadItem = {
  id: string;
  kind?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  title?: string | null;
  description?: string | null;
  created_at?: string | null;
  meta?: Record<string, unknown> | null;
};

export type DisplayMemoryUpload = MemoryUploadItem & {
  displayUrl: string;
  fullUrl: string;
};

