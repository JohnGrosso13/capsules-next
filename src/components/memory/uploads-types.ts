export type MemoryUploadItem = {
  id: string;
  kind?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  title?: string | null;
  description?: string | null;
  created_at?: string | null;
  meta?: Record<string, unknown> | null;
  version_index?: number | null;
  version_group_id?: string | null;
  is_latest?: boolean | null;
  uploaded_by?: string | null;
  last_viewed_by?: string | null;
  last_viewed_at?: string | null;
  view_count?: number | null;
};

export type DisplayMemoryUpload = MemoryUploadItem & {
  displayUrl: string;
  fullUrl: string;
};
