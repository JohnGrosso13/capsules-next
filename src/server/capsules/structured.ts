"use server";

import { randomUUID } from "node:crypto";

import { getDatabaseAdminClient } from "@/config/database";
import { listCapsuleAssets, findCapsuleById } from "@/server/capsules/repository";
import { listCapsuleLadderMemberRecords, listCapsuleLaddersByCapsule } from "@/server/ladders/repository";
import type { CapsuleLadderSummary } from "@/types/ladders";

const db = getDatabaseAdminClient();
const DAY_MS = 24 * 60 * 60 * 1000;
const FILE_LIKE_TYPES = ["application/", "text/", "pdf", "ppt", "word", "sheet", "doc", "xls"];
const PRESENTATION_HINTS = ["ppt", "deck", "slides", "keynote"];
type CapsuleMemberStatsRow = {
  role: string | null;
  joined_at: string | null;
};

type PostViewRow = {
  id: string | null;
  client_id: string | null;
  user_name: string | null;
  content: string | null;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
};

export type StructuredIntent =
  | { kind: "membership"; rangeDays?: number | null }
  | {
      kind: "posts";
      author?: string | null;
      tags?: string[];
      rangeDays?: number | null;
    }
  | { kind: "files"; fileType?: string | null }
  | { kind: "ladder"; name?: string | null };

export type StructuredPayload =
  | {
      kind: "membership";
      totalMembers: number;
      roleCounts: Array<{ role: string; count: number }>;
      recentJoins: Array<{ label: string; count: number }>;
    }
  | {
      kind: "posts";
      posts: Array<{ id: string; title: string; author: string; createdAt: string | null }>;
      filters: { author?: string | null; tags?: string[]; rangeDays?: number | null };
    }
  | {
      kind: "files";
      files: Array<{ id: string; title: string; mimeType: string | null; url: string | null }>;
      fileType?: string | null;
    }
  | {
      kind: "ladder";
      ladder: CapsuleLadderSummary;
      standings: Array<{
        id: string;
        displayName: string;
        rank: number | null;
        rating: number | null;
        record: string | null;
      }>;
    };

export type StructuredRecord = {
  id: string;
  title: string;
  subtitle: string | null;
  detail: string;
  kind: StructuredPayload["kind"];
};

function normalizeRangeDays(value: number | null | undefined, fallback = 365): number {
  if (!value || !Number.isFinite(value)) return fallback;
  return Math.max(7, Math.min(Math.floor(value), 730));
}

export function parseStructuredQuery(query: string): StructuredIntent[] {
  const intents: StructuredIntent[] = [];
  const lower = query.toLowerCase();

  const rangeMatch = query.match(/last\s+(\d+)\s*(days?|weeks?|months?|years?)/i);
  let rangeDays: number | null = null;
  if (rangeMatch && typeof rangeMatch[1] === "string") {
    const amount = Number.parseInt(rangeMatch[1], 10);
    if (Number.isFinite(amount)) {
      const unitSource = typeof rangeMatch[2] === "string" ? rangeMatch[2] : "";
      const unit = unitSource.toLowerCase();
      if (unit.startsWith("day")) rangeDays = amount;
      else if (unit.startsWith("week")) rangeDays = amount * 7;
      else if (unit.startsWith("month")) rangeDays = amount * 30;
      else if (unit.startsWith("year")) rangeDays = amount * 365;
    }
  } else if (/\blast\s+month\b/i.test(query)) {
    rangeDays = 30;
  } else if (/\blast\s+week\b/i.test(query)) {
    rangeDays = 7;
  } else if (/\blast\s+year\b/i.test(query)) {
    rangeDays = 365;
  }

  if (/\b(member|membership|joined|join|headcount|growth)\b/.test(lower)) {
    intents.push({ kind: "membership", rangeDays });
  }

  if (/\bpost(s)?\b/.test(lower)) {
    const authorMatch = query.match(/posts?\s+by\s+([A-Za-z0-9 .,'-]+)/i);
    const author =
      authorMatch && typeof authorMatch[1] === "string" ? authorMatch[1].trim() : null;
    const tags = Array.from(query.matchAll(/#([A-Za-z0-9_\-]+)/g))
      .map((match) => (match[1] ?? "").trim().toLowerCase())
      .filter((tag) => tag.length > 0);
    const intent: StructuredIntent = { kind: "posts" };
    if (author) intent.author = author;
    if (tags.length) intent.tags = Array.from(new Set(tags));
    if (rangeDays !== null) intent.rangeDays = rangeDays;
    intents.push(intent);
  }

  if (/(file|document|pdf|ppt|deck|slides|spreadsheet|sheet|report)/i.test(query)) {
    let fileType: string | null = null;
    if (/pdf/i.test(query)) fileType = "pdf";
    else if (PRESENTATION_HINTS.some((hint) => query.toLowerCase().includes(hint))) {
      fileType = "presentation";
    } else if (/sheet|xls|spreadsheet/i.test(query)) {
      fileType = "sheet";
    }
    const intent: StructuredIntent = { kind: "files" };
    if (fileType) intent.fileType = fileType;
    intents.push(intent);
  }

  if (/(ladder|bracket|tournament|standings|results)/i.test(query)) {
    const ladderMatch = query.match(/(?:ladder|tournament)\s+([A-Za-z0-9 .'-]+)/i);
    const ladderName =
      ladderMatch && typeof ladderMatch[1] === "string" ? ladderMatch[1].trim() : null;
    const intent: StructuredIntent = { kind: "ladder" };
    if (ladderName) intent.name = ladderName;
    intents.push(intent);
  }

  return intents;
}

export async function getCapsuleMembershipStats(params: {
  capsuleId: string;
  rangeDays?: number | null;
}): Promise<StructuredPayload & { kind: "membership" }> {
  const { capsuleId } = params;
  const rangeDays = normalizeRangeDays(params.rangeDays ?? null);
  const result = await db
    .from("capsule_members")
    .select<CapsuleMemberStatsRow>("role, joined_at")
    .eq("capsule_id", capsuleId)
    .order("joined_at", { ascending: true })
    .fetch();

  const rows = (result.data ?? []) as CapsuleMemberStatsRow[];
  const totalMembers = rows.length;
  const roleCounts = new Map<string, number>();
  const now = Date.now();
  const rangeStart = now - rangeDays * DAY_MS;
  const monthly = new Map<string, number>();

  rows.forEach((row) => {
    const role = typeof row.role === "string" && row.role.trim().length ? row.role.trim() : "member";
    roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
    if (row.joined_at) {
      const joined = new Date(row.joined_at);
      if (!Number.isNaN(joined.getTime()) && joined.getTime() >= rangeStart) {
        const label = `${joined.getUTCFullYear()}-${String(joined.getUTCMonth() + 1).padStart(2, "0")}`;
        monthly.set(label, (monthly.get(label) ?? 0) + 1);
      }
    }
  });

  const recentJoins = Array.from(monthly.entries())
    .sort(([a], [b]) => (a > b ? -1 : 1))
    .slice(0, 6)
    .map(([label, count]) => ({ label, count }));

  const sortedRoles = Array.from(roleCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([role, count]) => ({ role, count }));

  return {
    kind: "membership",
    totalMembers,
    roleCounts: sortedRoles,
    recentJoins,
  };
}

export async function findCapsulePosts(params: {
  capsuleId: string;
  author?: string | null;
  tags?: string[];
  rangeDays?: number | null;
  limit?: number;
}): Promise<StructuredPayload & { kind: "posts" }> {
  const { capsuleId } = params;
  const limit = Math.max(1, Math.min(params.limit ?? 5, 10));
  let query = db
    .from("posts_view")
    .select<PostViewRow>("id, client_id, user_name, content, created_at, metadata")
    .eq("capsule_id", capsuleId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (typeof params.author === "string" && params.author.trim().length) {
    query = query.ilike("user_name", `%${params.author.trim()}%`);
  }

  if (params.rangeDays !== undefined && params.rangeDays !== null) {
    const since = new Date(
      Date.now() - normalizeRangeDays(params.rangeDays) * DAY_MS,
    ).toISOString();
    query = query.gte("created_at", since);
  }

  if (params.tags && params.tags.length) {
    query = query.contains("metadata->tags", params.tags);
  }

  const result = await query.fetch();
  const rows = (result.data ?? []) as PostViewRow[];
  const posts = rows.map((row) => {
    const fallbackTitle =
      row.content && row.content.trim().length
        ? row.content
        : typeof row.metadata?.title === "string"
          ? row.metadata.title
          : "Capsule post";
    return {
      id: String(row.id ?? row.client_id ?? randomUUID()),
      title: fallbackTitle.slice(0, 80),
      author: row.user_name ?? "Member",
      createdAt: row.created_at ?? null,
    };
  });

  return {
    kind: "posts",
    posts,
    filters: {
      author: params.author ?? null,
      tags: params.tags ?? [],
      rangeDays: params.rangeDays ?? null,
    },
  };
}

export async function listCapsuleFilesStructured(params: {
  capsuleId: string;
  fileType?: string | null;
  limit?: number;
}): Promise<StructuredPayload & { kind: "files" }> {
  const assets = await listCapsuleAssets({
    capsuleId: params.capsuleId,
    limit: Math.max(5, Math.min(params.limit ?? 8, 20)),
    includeInternal: true,
  });
  const fileType = params.fileType ?? null;
  const files = assets
    .filter((asset) => {
      const mime = (asset.media_type ?? "").toLowerCase();
      const isFile = FILE_LIKE_TYPES.some((hint) => mime.startsWith(hint) || mime.includes(hint));
      if (!isFile) return false;
      if (!fileType) return true;
      if (fileType === "pdf") return mime.includes("pdf");
      if (fileType === "presentation") return PRESENTATION_HINTS.some((hint) => mime.includes(hint));
      if (fileType === "sheet") return mime.includes("sheet") || mime.includes("excel") || mime.includes("csv");
      return true;
    })
    .slice(0, params.limit ?? 6)
    .map((asset) => ({
      id: String(asset.id ?? randomUUID()),
      title: asset.title ?? asset.description ?? "Capsule file",
      mimeType: asset.media_type ?? null,
      url: asset.media_url ?? null,
    }));

  return {
    kind: "files",
    files,
    fileType,
  };
}

export async function getLadderResultsStructured(params: {
  capsuleId: string;
  nameHint?: string | null;
}): Promise<StructuredPayload & { kind: "ladder" } | null> {
  const ladders = await listCapsuleLaddersByCapsule(params.capsuleId);
  if (!ladders.length) return null;

  const target =
    (params.nameHint &&
      ladders.find((ladder) =>
        ladder.name.toLowerCase().includes(params.nameHint!.toLowerCase()),
      )) ||
    ladders.find((ladder) => ladder.status === "active") ||
    ladders[0];

  if (!target) return null;
  const members = await listCapsuleLadderMemberRecords(target.id);
  const standings = members.slice(0, 5).map((member) => ({
    id: member.id,
    displayName: member.displayName,
    rank: member.rank,
    rating: member.rating,
    record:
      member.wins || member.losses || member.draws
        ? `${member.wins ?? 0}-${member.losses ?? 0}${
            member.draws && member.draws > 0 ? `-${member.draws}` : ""
          }`
        : null,
  }));

  return {
    kind: "ladder",
    ladder: target,
    standings,
  };
}

export async function fetchStructuredPayloads(params: {
  capsuleId: string;
  intents: StructuredIntent[];
}): Promise<StructuredPayload[]> {
  const outputs: StructuredPayload[] = [];
  const intents = dedupeIntents(params.intents);
  for (const intent of intents) {
    switch (intent.kind) {
      case "membership": {
        const payload = await getCapsuleMembershipStats({
          capsuleId: params.capsuleId,
          ...(intent.rangeDays !== undefined ? { rangeDays: intent.rangeDays } : {}),
        });
        if (payload.totalMembers > 0) outputs.push(payload);
        break;
      }
      case "posts": {
        const payload = await findCapsulePosts({
          capsuleId: params.capsuleId,
          ...(intent.author !== undefined ? { author: intent.author } : {}),
          ...(intent.tags !== undefined ? { tags: intent.tags } : {}),
          ...(intent.rangeDays !== undefined ? { rangeDays: intent.rangeDays } : {}),
        });
        if (payload.posts.length) outputs.push(payload);
        break;
      }
      case "files": {
        const payload = await listCapsuleFilesStructured({
          capsuleId: params.capsuleId,
          ...(intent.fileType !== undefined ? { fileType: intent.fileType } : {}),
        });
        if (payload.files.length) outputs.push(payload);
        break;
      }
      case "ladder": {
        const payload = await getLadderResultsStructured({
          capsuleId: params.capsuleId,
          ...(intent.name ? { nameHint: intent.name } : {}),
        });
        if (payload) outputs.push(payload);
        break;
      }
      default:
        break;
    }
  }
  return outputs;
}

export function structuredPayloadToRecords(payload: StructuredPayload): StructuredRecord[] {
  switch (payload.kind) {
    case "membership": {
      const topRoles = payload.roleCounts
        .slice(0, 3)
        .map((entry) => `${entry.role}: ${entry.count}`);
      const trend =
        payload.recentJoins.length && payload.recentJoins[0]
          ? `${payload.recentJoins[0].label}: ${payload.recentJoins[0].count} joins`
          : null;
      return [
        {
          id: "capsule-membership",
          title: "Membership snapshot",
          subtitle: trend,
          detail: `Members: ${payload.totalMembers}${
            topRoles.length ? ` | ${topRoles.join(" | ")}` : ""
          }`,
          kind: "membership",
        },
      ];
    }
    case "posts": {
      const detail = payload.posts
        .map((post) => `${post.author} - ${post.title}`)
        .slice(0, 3)
        .join(" | ");
      return [
        {
          id: "capsule-posts",
          title: payload.filters.author ? `Posts by ${payload.filters.author}` : "Recent posts",
          subtitle: payload.filters.rangeDays ? `Last ${payload.filters.rangeDays} days` : null,
          detail: detail || "No matching posts",
          kind: "posts",
        },
      ];
    }
    case "files": {
      const detail = payload.files
        .map((file) => file.title)
        .slice(0, 3)
        .join(" | ");
      return [
        {
          id: "capsule-files",
          title: payload.fileType ? `${payload.fileType.toUpperCase()} files` : "Capsule files",
          subtitle: null,
          detail: detail || "No files found",
          kind: "files",
        },
      ];
    }
    case "ladder": {
      const detail = payload.standings
        .map(
          (entry, index) =>
            `${index + 1}. ${entry.displayName}${entry.record ? ` (${entry.record})` : ""}`,
        )
        .slice(0, 3)
        .join(" | ");
      return [
        {
          id: payload.ladder.id,
          title: `${payload.ladder.name} standings`,
          subtitle: payload.ladder.status === "active" ? "Active" : payload.ladder.status,
          detail: detail || "No participants yet",
          kind: "ladder",
        },
      ];
    }
    default:
      return [];
  }
}

function dedupeIntents(intents: StructuredIntent[]): StructuredIntent[] {
  const seen = new Set<string>();
  const results: StructuredIntent[] = [];
  intents.forEach((intent) => {
    const key = intent.kind;
    if (seen.has(key)) return;
    seen.add(key);
    results.push(intent);
  });
  return results;
}

export async function resolveCapsuleLabel(capsuleId: string): Promise<string | null> {
  try {
    const capsule = await findCapsuleById(capsuleId);
    const label =
      typeof capsule?.name === "string" && capsule.name.trim().length
        ? capsule.name.trim()
        : null;
    return label;
  } catch {
    return null;
  }
}
