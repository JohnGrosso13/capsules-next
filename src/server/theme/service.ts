import { getDatabaseAdminClient } from "@/config/database";
import { decorateDatabaseError } from "@/lib/database/utils";
import { normalizeThemeVars } from "@/lib/theme/shared";

const db = getDatabaseAdminClient();
const TABLE = "theme_styles";

export type ThemeMode = "light" | "dark" | null;

export type ThemeStyle = {
  id: string;
  ownerId: string;
  title: string;
  summary: string | null;
  description: string | null;
  prompt: string | null;
  details: string | null;
  mode: ThemeMode;
  vars: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

type ThemeStyleRow = {
  id: string;
  owner_user_id: string | null;
  title: string | null;
  summary: string | null;
  description: string | null;
  prompt: string | null;
  details: string | null;
  theme_mode: string | null;
  vars: Record<string, string> | null;
  created_at: string | null;
  updated_at: string | null;
};

type ThemeStyleInsert = {
  owner_user_id: string;
  title: string;
  summary: string | null;
  description: string | null;
  prompt: string | null;
  details: string | null;
  theme_mode: ThemeMode;
  vars: Record<string, string>;
};

const TITLE_LIMIT = 120;
const SUMMARY_LIMIT = 280;
const DETAILS_LIMIT = 280;
const PROMPT_LIMIT = 1000;

function clampText(value: string | null | undefined, limit: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.length) return null;
  if (trimmed.length <= limit) return trimmed;
  return trimmed.slice(0, limit);
}

function sanitizeTitle(value: string | null | undefined): string {
  const trimmed = clampText(value, TITLE_LIMIT);
  return trimmed ?? "Saved theme";
}

function sanitizeMode(value: unknown): ThemeMode {
  if (value === "light" || value === "dark") return value;
  return null;
}

function mapRow(row: ThemeStyleRow | null): ThemeStyle | null {
  if (!row || typeof row.id !== "string" || typeof row.owner_user_id !== "string") {
    return null;
  }
  const vars = normalizeThemeVars(row.vars ?? {});
  return {
    id: row.id,
    ownerId: row.owner_user_id,
    title: sanitizeTitle(row.title),
    summary: clampText(row.summary, SUMMARY_LIMIT),
    description: clampText(row.description, PROMPT_LIMIT),
    prompt: clampText(row.prompt, PROMPT_LIMIT),
    details: clampText(row.details, DETAILS_LIMIT),
    mode: sanitizeMode(row.theme_mode),
    vars,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  };
}

function buildInsert(params: {
  ownerId: string;
  title?: string | null;
  summary?: string | null;
  description?: string | null;
  prompt?: string | null;
  details?: string | null;
  mode?: ThemeMode;
  vars: Record<string, string>;
}): ThemeStyleInsert {
  return {
    owner_user_id: params.ownerId,
    title: sanitizeTitle(params.title),
    summary: clampText(params.summary, SUMMARY_LIMIT),
    description: clampText(params.description, PROMPT_LIMIT),
    prompt: clampText(params.prompt, PROMPT_LIMIT),
    details: clampText(params.details, DETAILS_LIMIT),
    theme_mode: sanitizeMode(params.mode),
    vars: params.vars,
  };
}

export async function createThemeStyle(params: {
  ownerId: string;
  title?: string | null;
  summary?: string | null;
  description?: string | null;
  prompt?: string | null;
  details?: string | null;
  mode?: ThemeMode;
  vars: Record<string, unknown>;
}): Promise<ThemeStyle> {
  const sanitizedVars = normalizeThemeVars(params.vars);
  if (!Object.keys(sanitizedVars).length) {
    throw new Error("No theme variables to persist");
  }

  const insert = buildInsert({ ...params, vars: sanitizedVars });
  const result = await db
    .from(TABLE)
    .insert<ThemeStyleInsert>(insert)
    .select<ThemeStyleRow>(
      "id, owner_user_id, title, summary, description, prompt, details, theme_mode, vars, created_at, updated_at",
    )
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("themeStyles.create", result.error);
  }
  const mapped = mapRow(result.data ?? null);
  if (!mapped) {
    throw new Error("Failed to create theme style");
  }
  return mapped;
}

export async function listThemeStyles(ownerId: string): Promise<ThemeStyle[]> {
  const result = await db
    .from(TABLE)
    .select<ThemeStyleRow>(
      "id, owner_user_id, title, summary, description, prompt, details, theme_mode, vars, created_at, updated_at",
    )
    .eq("owner_user_id", ownerId)
    .order("created_at", { ascending: false })
    .fetch();

  if (result.error) {
    throw decorateDatabaseError("themeStyles.list", result.error);
  }

  return (result.data ?? [])
    .map(mapRow)
    .filter((row): row is ThemeStyle => row !== null);
}

export async function updateThemeStyleTitle(options: {
  ownerId: string;
  id: string;
  title: string;
}): Promise<void> {
  const title = sanitizeTitle(options.title);
  const result = await db
    .from(TABLE)
    .update({ title })
    .eq("owner_user_id", options.ownerId)
    .eq("id", options.id)
    .select("id")
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("themeStyles.updateTitle", result.error);
  }
}

export async function deleteThemeStyles(options: {
  ownerId: string;
  ids: string[];
}): Promise<number> {
  if (!options.ids.length) return 0;
  const result = await db
    .from(TABLE)
    .delete({ count: "exact" })
    .eq("owner_user_id", options.ownerId)
    .in("id", options.ids)
    .select("id")
    .fetch();

  if (result.error) {
    throw decorateDatabaseError("themeStyles.delete", result.error);
  }
  return (result.data ?? []).length;
}

export async function deleteAllThemeStyles(ownerId: string): Promise<number> {
  const result = await db
    .from(TABLE)
    .delete({ count: "exact" })
    .eq("owner_user_id", ownerId)
    .select("id")
    .fetch();

  if (result.error) {
    throw decorateDatabaseError("themeStyles.deleteAll", result.error);
  }
  return (result.data ?? []).length;
}
