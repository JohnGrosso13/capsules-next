import { getDatabaseAdminClient } from "@/config/database";
import { listCapsuleAssets, type CapsuleAssetRow } from "@/server/capsules/repository";
import {
  listCapsuleLaddersByCapsule,
  listCapsuleLadderMemberRecords,
} from "@/server/ladders/repository";
import { listPollVoteAggregates } from "@/server/posts/repository";
import type { CapsuleKnowledgeDoc } from "./knowledge-index";
import type { CapsuleLadderMember, CapsuleLadderSummary } from "@/types/ladders";

const PAGE_SIZE = 500;
const LADDER_LIMIT = 20;
const LADDER_RESULTS_LIMIT = 4;
const LADDER_MEMBER_SAMPLE_LIMIT = 8;
const STREAM_EVENT_LIMIT = 12;
const TITLE_LIMIT = 160;
const DOC_TEXT_LIMIT = 1400;
const TRANSCRIPT_SOURCES = new Set(["voice_transcription", "party_summary", "live_transcript", "chat_transcript"]);
const BRAND_SOURCES = new Map<string, string>([
  ["capsule_banner", "banner"],
  ["capsule_store_banner", "store banner"],
  ["capsule_logo", "logo"],
  ["capsule_tile", "promo tile"],
]);
const DOCUMENT_MIME_HINTS = ["application/pdf", "application/msword", "application/vnd.", "text/"];

type PostKnowledgeRow = {
  id: string | null;
  client_id: string | null;
  capsule_id: string | null;
  user_name: string | null;
  content: string | null;
  media_prompt: string | null;
  media_url: string | null;
  metadata: unknown;
  created_at: string | null;
  poll: unknown;
  kind: string | null;
};

type MemberKnowledgeRow = {
  role: string | null;
  joined_at: string | null;
};

type PollVoteAggregateRow = {
  post_id: string | number | null;
  option_index: number | null;
  vote_count: number | null;
};

type LiveStreamSessionRow = {
  id: string | null;
  status: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  metadata: Record<string, unknown> | null;
};

type CapsuleMetaRow = {
  id: string | null;
  name: string | null;
  slug: string | null;
  created_at: string | null;
  created_by_id: string | null;
  owner_name: string | null;
  owner_key: string | null;
};

const db = getDatabaseAdminClient();

async function fetchAllPages<T>(
  factory: (rangeStart: number, rangeEnd: number) => Promise<{ data: T[] | null; error: unknown }>,
  pageSize = PAGE_SIZE,
): Promise<T[]> {
  const results: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await factory(offset, offset + pageSize - 1);
    if (error) {
      console.warn("knowledge backfill page fetch failed", { offset, error });
      break;
    }
    const rows = data ?? [];
    if (!rows.length) break;
    results.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return results;
}

function computeMonthSpan(values: Array<string | null | undefined>): number {
  const timestamps = values
    .map((value) => {
      if (!value) return null;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    })
    .filter((value): value is Date => value !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  if (!timestamps.length) return 24;
  const first = timestamps[0]!;
  const now = new Date();
  const years = now.getUTCFullYear() - first.getUTCFullYear();
  const months = now.getUTCMonth() - first.getUTCMonth();
  const span = years * 12 + months + 1;
  return Math.max(span, 1);
}

function computeYearSpan(values: Array<string | null | undefined>): number {
  const timestamps = values
    .map((value) => {
      if (!value) return null;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    })
    .filter((value): value is Date => value !== null);
  if (!timestamps.length) return 8;
  const years = timestamps.map((date) => date.getUTCFullYear());
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years, new Date().getUTCFullYear());
  return Math.max(maxYear - minYear + 1, 1);
}

function truncate(value: string | null | undefined, limit: number): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized.length) return null;
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 3)}...`;
}

function truncateTitle(value: string | null | undefined): string | null {
  return truncate(value, TITLE_LIMIT);
}

function truncateText(value: string | null | undefined): string | null {
  return truncate(value, DOC_TEXT_LIMIT);
}

function formatDateLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function formatDuration(seconds: number | null | undefined): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.trunc(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h${remMins ? ` ${remMins}m` : ""}`;
  }
  if (mins > 0) {
    return `${mins}m${secs ? ` ${secs}s` : ""}`;
  }
  if (secs > 0) {
    return `${secs}s`;
  }
  return null;
}

function formatAge(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
  if (diffDays < 30) return `${diffDays} days`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 18) return `${diffMonths} months`;
  const diffYears = Math.floor(diffMonths / 12);
  return diffYears === 1 ? "1 year" : `${diffYears} years`;
}

function earliestDate(values: Array<string | null | undefined>): string | null {
  const timestamps = values
    .map((value) => {
      if (!value) return null;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    })
    .filter((date): date is Date => date !== null);
  if (!timestamps.length) return null;
  return timestamps.reduce((acc, current) => (current.getTime() < acc.getTime() ? current : acc)).toISOString();
}

function groupByYear(values: Array<string | null | undefined>): Map<string, number> {
  const buckets = new Map<string, number>();
  values.forEach((value) => {
    if (!value) return;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return;
    const year = date.getUTCFullYear().toString();
    buckets.set(year, (buckets.get(year) ?? 0) + 1);
  });
  return buckets;
}

function buildMonthlyCumulative(
  values: Array<string | null | undefined>,
  months: number,
): Array<{ label: string; count: number }> {
  const timestamps = values
    .map((value) => {
      if (!value) return null;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    })
    .filter((date): date is Date => date !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  const results: Array<{ label: string; count: number }> = [];
  let running = 0;
  let cursor = 0;
  const now = new Date();

  for (let i = months - 1; i >= 0; i -= 1) {
    const bucket = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1, 0, 0, 0));
    const nextBucket = new Date(Date.UTC(bucket.getUTCFullYear(), bucket.getUTCMonth() + 1, 1, 0, 0, 0));
    while (cursor < timestamps.length) {
      const current = timestamps[cursor];
      if (!current) break;
      if (current.getTime() < nextBucket.getTime()) {
        running += 1;
        cursor += 1;
      } else {
        break;
      }
    }
    const label = `${bucket.getUTCFullYear()}-${String(bucket.getUTCMonth() + 1).padStart(2, "0")}`;
    results.push({ label, count: running });
  }
  return results;
}

function buildYearlyCumulative(
  values: Array<string | null | undefined>,
  years: number,
): Array<{ label: string; count: number }> {
  const timestamps = values
    .map((value) => {
      if (!value) return null;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    })
    .filter((date): date is Date => date !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  const results: Array<{ label: string; count: number }> = [];
  let running = 0;
  let cursor = 0;
  const now = new Date();
  const startYear = now.getUTCFullYear() - (years - 1);

  for (let year = startYear; year <= now.getUTCFullYear(); year += 1) {
    const bucketEnd = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));
    while (cursor < timestamps.length) {
      const current = timestamps[cursor];
      if (!current) break;
      if (current.getTime() < bucketEnd.getTime()) {
        running += 1;
        cursor += 1;
      } else {
        break;
      }
    }
    results.push({ label: year.toString(), count: running });
  }
  return results.reverse();
}

function getAssetSource(row: CapsuleAssetRow): string | null {
  const meta = row.meta && typeof row.meta === "object" ? (row.meta as Record<string, unknown>) : null;
  const source =
    typeof meta?.source === "string"
      ? meta.source
      : typeof row.kind === "string"
        ? row.kind
        : null;
  if (!source) return null;
  const normalized = source.trim().toLowerCase();
  return normalized.length ? normalized : null;
}

function isTranscriptAsset(row: CapsuleAssetRow): boolean {
  const source = getAssetSource(row);
  if (source && TRANSCRIPT_SOURCES.has(source)) {
    return true;
  }
  const mime = row.media_type?.toLowerCase() ?? "";
  return mime === "text/plain";
}

function isDocumentAsset(row: CapsuleAssetRow): boolean {
  const source = getAssetSource(row);
  if (source && (source.includes("document") || source.includes("file"))) {
    return true;
  }
  const mime = row.media_type?.toLowerCase() ?? "";
  return DOCUMENT_MIME_HINTS.some((hint) => mime.startsWith(hint));
}

function isBrandAsset(row: CapsuleAssetRow): string | null {
  const source = getAssetSource(row);
  if (!source) return null;
  return BRAND_SOURCES.get(source) ?? null;
}

function getLadderVariant(ladder: CapsuleLadderSummary): string | null {
  const meta = ladder.meta && typeof ladder.meta === "object" ? (ladder.meta as Record<string, unknown>) : null;
  if (!meta) return null;
  const variant = typeof meta.variant === "string" ? meta.variant : null;
  return variant?.toLowerCase() ?? null;
}

function extractTags(meta: unknown): string[] {
  if (!meta || typeof meta !== "object") return [];
  const record = meta as Record<string, unknown>;
  const sets: unknown[] = [];
  if (Array.isArray(record.tags)) sets.push(...record.tags);
  if (Array.isArray(record.summary_tags)) sets.push(...record.summary_tags);
  if (Array.isArray(record.keywords)) sets.push(...record.keywords);
  return Array.from(
    new Set(
      sets
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((tag) => tag.length > 0),
    ),
  );
}

function extractPollSummary(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const question = typeof record.question === "string" ? record.question.trim() : null;
  const options = Array.isArray(record.options)
    ? record.options.map((option, index) => {
        if (typeof option === "string" && option.trim().length) return `- ${option.trim()}`;
        return `- Option ${index + 1}`;
      })
    : [];
  if (!question || !options.length) return null;
  return [`Poll: ${question}`, ...options].join("\n");
}

function extractPollQuestion(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const question = typeof record.question === "string" ? record.question.trim() : null;
  return question && question.length ? question : null;
}

async function fetchCapsuleMeta(capsuleId: string): Promise<CapsuleMetaRow | null> {
  try {
    const base = await db
      .from("capsules")
      .select<CapsuleMetaRow>("id, name, slug, created_at, created_by_id")
      .eq("id", capsuleId)
      .maybeSingle();
    if (base.error) {
      console.warn("capsule knowledge meta fetch failed", { capsuleId, error: base.error });
      return null;
    }
    const row = base.data as CapsuleMetaRow;
    if (!row?.created_by_id) {
      return row;
    }
    try {
      const owner = await db
        .from("users")
        .select<{ full_name: string | null; user_key: string | null }>("full_name, user_key")
        .eq("id", row.created_by_id)
        .maybeSingle();
      if (!owner.error && owner.data) {
        row.owner_name = owner.data.full_name ?? null;
        row.owner_key = owner.data.user_key ?? null;
      }
    } catch (ownerError) {
      console.warn("capsule owner lookup failed", { capsuleId, error: ownerError });
    }
    return row;
  } catch (error) {
    console.warn("capsule knowledge meta fetch failed", { capsuleId, error });
    return null;
  }
}

function buildPostDoc(row: PostKnowledgeRow, capsuleLabel: string): CapsuleKnowledgeDoc | null {
  const id = row.id ?? row.client_id;
  if (!id) return null;
  const author = row.user_name?.trim() || "Member";
  const created = formatDateLabel(row.created_at);
  const title = truncateTitle(
    created ? `${capsuleLabel} post by ${author} (${created})` : `${capsuleLabel} post by ${author}`,
  );
  const poll = extractPollSummary(row.poll);
  const tags = extractTags(row.metadata);
  const segments = [
    truncateText(row.content),
    truncateText(row.media_prompt ? `Media prompt: ${row.media_prompt}` : null),
    row.media_url ? `Media reference: ${row.media_url}` : null,
    poll,
    tags.length ? `Tags: ${tags.join(", ")}` : null,
  ].filter((segment): segment is string => Boolean(segment));
  if (!segments.length || !title) return null;
  return {
    id: `capsule-post:${id}`,
    title,
    text: truncateText(segments.join("\n\n")) ?? segments.join("\n\n"),
    kind: "capsule_post",
    source: "capsule_post",
    createdAt: row.created_at ?? null,
    tags,
  };
}

function isTournament(ladder: CapsuleLadderSummary): boolean {
  return getLadderVariant(ladder) === "tournament";
}

function extractTournamentMeta(ladder: CapsuleLadderSummary): {
  formatLabel: string;
  participants: number | null;
  startsAt: string | null;
} {
  const meta =
    ladder.meta && typeof ladder.meta === "object" ? (ladder.meta as Record<string, unknown>) : {};
  const rawFormat =
    typeof meta.formatLabel === "string"
      ? meta.formatLabel
      : typeof meta.format === "string"
        ? meta.format
        : null;
  const formatLabel = rawFormat ? rawFormat.replace(/_/g, " ") : "Tournament";
  const participantHints = [
    meta.teamsCount,
    meta.playersCount,
    meta.entrants,
    meta.participantCount,
  ];
  let participants: number | null = null;
  for (const hint of participantHints) {
    if (typeof hint === "number" && Number.isFinite(hint)) {
      participants = hint;
      break;
    }
    if (typeof hint === "string" && hint.trim().length) {
      const parsed = Number.parseInt(hint, 10);
      if (Number.isFinite(parsed)) {
        participants = parsed;
        break;
      }
    }
  }
  const schedule =
    meta.schedule && typeof meta.schedule === "object"
      ? ((meta.schedule as Record<string, unknown>).start as string | undefined)
      : null;
  const startsAt =
    typeof meta.startsAt === "string" && meta.startsAt.trim().length
      ? meta.startsAt
      : typeof schedule === "string"
        ? schedule
        : null;

  return { formatLabel, participants, startsAt };
}

function buildTournamentDoc(
  ladder: CapsuleLadderSummary,
  capsuleLabel: string,
): CapsuleKnowledgeDoc | null {
  if (!ladder.id) return null;
  const { formatLabel, participants, startsAt } = extractTournamentMeta(ladder);
  const lines = [
    `Format: ${formatLabel}`,
    `Status: ${ladder.status}`,
    participants !== null ? `Entrants: ${participants}` : null,
    startsAt ? `Starts: ${formatDateLabel(startsAt) ?? startsAt}` : null,
    ladder.summary ? `Overview: ${ladder.summary}` : null,
  ].filter((line): line is string => Boolean(line));
  if (!lines.length) return null;
  return {
    id: `capsule-tournament:${ladder.id}`,
    title:
      truncateTitle(`${capsuleLabel} tournament: ${ladder.name ?? "Untitled bracket"}`) ??
      "Capsule tournament",
    text: truncateText(lines.join("\n")) ?? lines.join("\n"),
    kind: "capsule_tournament",
    source: "capsule_tournament",
    createdAt: ladder.updatedAt ?? ladder.createdAt ?? null,
  };
}

function buildLadderDoc(ladder: CapsuleLadderSummary, capsuleLabel: string): CapsuleKnowledgeDoc | null {
  if (!ladder.id) return null;
  const segments = [
    ladder.summary ? `Summary: ${ladder.summary}` : null,
    ladder.game?.title ? `Game: ${ladder.game.title}` : null,
    ladder.game?.summary ? `Game notes: ${ladder.game.summary}` : null,
    `Status: ${ladder.status}`,
    `Visibility: ${ladder.visibility}`,
  ].filter((segment): segment is string => Boolean(segment));
  if (!segments.length) return null;
  return {
    id: `capsule-ladder:${ladder.id}`,
    title: truncateTitle(`${capsuleLabel} ladder: ${ladder.name ?? "Unnamed ladder"}`) ?? "Capsule ladder",
    text: truncateText(segments.join("\n\n")) ?? segments.join("\n\n"),
    kind: "capsule_ladder",
    source: "capsule_ladder",
    createdAt: ladder.updatedAt ?? ladder.createdAt ?? null,
  };
}

function buildLadderResultsDoc(
  ladder: CapsuleLadderSummary,
  members: CapsuleLadderMember[],
  capsuleLabel: string,
): CapsuleKnowledgeDoc | null {
  if (!ladder.id || !members.length) return null;
  const sample = members.slice(0, LADDER_MEMBER_SAMPLE_LIMIT);
  const lines = sample.map((member, index) => {
    const pieces: string[] = [];
    if (typeof member.rank === "number") {
      pieces.push(`#${member.rank}`);
    }
    if (
      typeof member.wins === "number" &&
      typeof member.losses === "number" &&
      (member.wins > 0 || member.losses > 0)
    ) {
      const draws = typeof member.draws === "number" && member.draws > 0 ? `-${member.draws}` : "";
      pieces.push(`Record ${member.wins}-${member.losses}${draws}`);
    }
    if (typeof member.rating === "number") {
      pieces.push(`ELO ${member.rating}`);
    }
    if (typeof member.streak === "number" && member.streak !== 0) {
      pieces.push(`Streak ${member.streak > 0 ? "+" : ""}${member.streak}`);
    }
    const detail = pieces.length ? ` (${pieces.join(" · ")})` : "";
    return `${index + 1}. ${member.displayName}${detail}`;
  });
  if (!lines.length) return null;
  const variantLabel = isTournament(ladder) ? "tournament standings" : "ladder standings";
  return {
    id: `capsule-ladder-results:${ladder.id}`,
    title:
      truncateTitle(`${capsuleLabel} ${variantLabel}: ${ladder.name ?? "latest results"}`) ??
      `${capsuleLabel} standings`,
    text: truncateText(lines.join("\n")) ?? lines.join("\n"),
    kind: "capsule_ladder_results",
    source: "capsule_ladder",
    createdAt: ladder.updatedAt ?? ladder.createdAt ?? null,
  };
}

function buildMembershipDocs(rows: MemberKnowledgeRow[], capsuleLabel: string): CapsuleKnowledgeDoc[] {
  if (!rows.length) {
    return [
      {
        id: `capsule-membership:${capsuleLabel}:empty`,
        title: `${capsuleLabel} membership snapshot`,
        text: "No members have joined yet.",
        kind: "capsule_membership_summary",
        source: "capsule_membership",
      },
    ];
  }
  const roleCounts = new Map<string, number>();
  const yearlyCounts = new Map<string, number>();
  rows.forEach((row) => {
    const role = row.role?.trim().toLowerCase() || "member";
    roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
    if (row.joined_at) {
      const date = new Date(row.joined_at);
      if (!Number.isNaN(date.getTime())) {
        const year = date.getUTCFullYear().toString();
        yearlyCounts.set(year, (yearlyCounts.get(year) ?? 0) + 1);
      }
    }
  });

  const summaryLines = [
    `Total members: ${rows.length}`,
    roleCounts.size
      ? `Roles — ${Array.from(roleCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([role, count]) => `${role}: ${count}`)
          .join(", ")}`
      : null,
    yearlyCounts.size
      ? `Yearly joins — ${Array.from(yearlyCounts.entries())
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([year, count]) => `${year}: ${count}`)
          .join(", ")}`
      : null,
  ].filter((line): line is string => Boolean(line));

  const docs: CapsuleKnowledgeDoc[] = [
    {
      id: `capsule-membership:${capsuleLabel}:summary`,
      title: `${capsuleLabel} membership snapshot`,
      text: truncateText(summaryLines.join("\n")) ?? summaryLines.join("\n"),
      kind: "capsule_membership_summary",
      source: "capsule_membership",
    },
  ];

  Array.from(yearlyCounts.entries())
    .sort(([a], [b]) => Number(a) - Number(b))
    .forEach(([year, count]) => {
      docs.push({
        id: `capsule-membership:${capsuleLabel}:year:${year}`,
        title: `${capsuleLabel} membership in ${year}`,
        text: `Members joined ${year}: ${count}.`,
        kind: "capsule_membership_year",
        source: "capsule_membership",
      });
    });

  const monthly = buildMonthlyCumulative(
    rows.map((row) => row.joined_at),
    computeMonthSpan(rows.map((row) => row.joined_at)),
  );
  const yearly = buildYearlyCumulative(
    rows.map((row) => row.joined_at),
    computeYearSpan(rows.map((row) => row.joined_at)),
  );
  const timelineLines = [
    "Headcount by month (last 24 months):",
    ...monthly.map((entry) => `${entry.label}: ${entry.count}`),
    "",
    "Headcount by year (last 8 years):",
    ...yearly.map((entry) => `${entry.label}: ${entry.count}`),
  ].filter((line) => line !== "");
  docs.push({
    id: `capsule-membership:${capsuleLabel}:timeline`,
    title: `${capsuleLabel} membership timeline`,
    text: truncateText(timelineLines.join("\n")) ?? timelineLines.join("\n"),
    kind: "capsule_membership_timeline",
    source: "capsule_membership",
    tags: ["timeline", "membership"],
  });

  return docs;
}

function buildAssetDoc(row: CapsuleAssetRow, capsuleLabel: string): CapsuleKnowledgeDoc | null {
  if (!row.id) return null;
  const baseTitle =
    row.title?.trim() ||
    (typeof row.meta === "object" && row.meta && typeof (row.meta as Record<string, unknown>).original_name === "string"
      ? ((row.meta as Record<string, unknown>).original_name as string)
      : null) ||
    "Library item";
  const metaTags = extractTags(row.meta);
  const lines = [
    row.description?.trim() || null,
    row.media_type ? `Type: ${row.media_type}` : null,
    row.media_url ? `URL: ${row.media_url}` : null,
    typeof row.view_count === "number" ? `Views: ${row.view_count}` : null,
    row.uploaded_by ? `Uploaded by: ${row.uploaded_by}` : null,
  ].filter((line): line is string => Boolean(line));
  if (!lines.length) return null;
  return {
    id: `capsule-asset:${row.id}`,
    title: truncateTitle(`${capsuleLabel} asset: ${baseTitle}`) ?? `${capsuleLabel} asset`,
    text: truncateText(lines.join("\n")) ?? lines.join("\n"),
    kind: "capsule_asset",
    source: "capsule_asset",
    createdAt: row.created_at ?? null,
    tags: metaTags,
  };
}

function buildBrandAssetDoc(
  row: CapsuleAssetRow,
  capsuleLabel: string,
  variantLabel: string,
): CapsuleKnowledgeDoc | null {
  if (!row.id) return null;
  const created = formatDateLabel(row.created_at);
  const lines = [
    row.description?.trim() || null,
    row.media_url ? `Asset URL: ${row.media_url}` : null,
    created ? `Saved: ${created}` : null,
  ].filter((line): line is string => Boolean(line));
  if (!lines.length) return null;
  return {
    id: `capsule-brand:${row.id}`,
    title: truncateTitle(`${capsuleLabel} ${variantLabel}`) ?? `${capsuleLabel} brand asset`,
    text: truncateText(lines.join("\n")) ?? lines.join("\n"),
    kind: "capsule_brand_asset",
    source: "capsule_asset",
    createdAt: row.created_at ?? null,
    tags: [`brand:${variantLabel.replace(/\s+/g, "_")}`],
  };
}

function buildFileDoc(row: CapsuleAssetRow, capsuleLabel: string): CapsuleKnowledgeDoc | null {
  if (!row.id) return null;
  const description = row.description?.trim() ?? row.title ?? "Document reference";
  return {
    id: `capsule-file:${row.id}`,
    title: truncateTitle(`${capsuleLabel} file: ${row.title ?? "Document"}`) ?? "Capsule document",
    text: truncateText(description) ?? description,
    kind: "capsule_file",
    source: "capsule_asset",
    createdAt: row.created_at ?? null,
    tags: ["document", row.media_type ?? ""].filter(Boolean),
  };
}

function buildTranscriptDoc(row: CapsuleAssetRow, capsuleLabel: string): CapsuleKnowledgeDoc | null {
  if (!row.id) return null;
  const text = row.description?.trim() ?? row.title ?? null;
  if (!text) return null;
  const created = formatDateLabel(row.created_at);
  return {
    id: `capsule-transcript:${row.id}`,
    title:
      truncateTitle(
        `${capsuleLabel} transcript${created ? ` (${created})` : ""}`,
      ) ?? `${capsuleLabel} transcript`,
    text: truncateText(text) ?? text,
    kind: "capsule_transcript",
    source: "capsule_transcript",
    createdAt: row.created_at ?? null,
    tags: ["transcript"],
  };
}

async function collectLadderResultDocs(
  ladders: CapsuleLadderSummary[],
  capsuleLabel: string,
): Promise<CapsuleKnowledgeDoc[]> {
  const docs: CapsuleKnowledgeDoc[] = [];
  for (const ladder of ladders.slice(0, LADDER_RESULTS_LIMIT)) {
    try {
      const members = await listCapsuleLadderMemberRecords(ladder.id);
      const doc = buildLadderResultsDoc(ladder, members, capsuleLabel);
      if (doc) {
        docs.push(doc);
      }
    } catch (error) {
      console.warn("capsule knowledge ladder members fetch failed", {
        ladderId: ladder.id,
        error,
      });
    }
  }
  return docs;
}

function buildStreamLogDoc(
  capsuleId: string,
  capsuleLabel: string,
  sessions: LiveStreamSessionRow[],
): CapsuleKnowledgeDoc | null {
  if (!sessions.length) return null;
  const entries = sessions.map((session) => {
    const start = formatDateLabel(session.started_at);
    const descriptor = [session.status ?? "session", formatDuration(session.duration_seconds)]
      .filter(Boolean)
      .join(" · ");
    const meta = session.metadata && typeof session.metadata === "object" ? session.metadata : null;
    const title =
      typeof meta?.title === "string" && meta.title.trim().length
        ? meta.title.trim()
        : typeof meta?.topic === "string" && meta.topic.trim().length
          ? meta.topic.trim()
          : null;
    return `- ${start ?? "Recent session"}: ${descriptor}${title ? ` — ${title}` : ""}`;
  });
  const text = entries.join("\n");
  return {
    id: `capsule-events:${capsuleId}`,
    title: `${capsuleLabel} live stream log`,
    text: truncateText(text) ?? text,
    kind: "capsule_event_log",
    source: "capsule_event",
    createdAt: sessions[0]?.started_at ?? null,
    tags: ["live", "stream"],
  };
}

function buildCapsuleProfileDoc(params: {
  capsuleId: string;
  capsuleLabel: string;
  meta: CapsuleMetaRow | null;
  memberRows: MemberKnowledgeRow[];
  postRows: PostKnowledgeRow[];
  assetRows: CapsuleAssetRow[];
}): CapsuleKnowledgeDoc | null {
  const { capsuleId, capsuleLabel, meta, memberRows, postRows, assetRows } = params;
  const createdAt = meta?.created_at ?? null;
  const age = formatAge(createdAt);
  const createdLabel = formatDateLabel(createdAt);
  const ownerLabel = meta?.owner_name?.trim().length
    ? meta.owner_name
    : meta?.owner_key?.trim().length
      ? `@${meta.owner_key}`
      : null;

  const totalMembers = memberRows.length;
  const roleCounts = memberRows.reduce<Record<string, number>>((acc, row) => {
    const role = row.role?.trim().toLowerCase() || "member";
    acc[role] = (acc[role] ?? 0) + 1;
    return acc;
  }, {});
  const roleSummary = Object.entries(roleCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([role, count]) => `${role}: ${count}`)
    .join(", ");
  const earliestJoin = earliestDate(memberRows.map((row) => row.joined_at));

  const totalPosts = postRows.length;
  const now = Date.now();
  const posts30 = postRows.filter((row) => {
    if (!row.created_at) return false;
    const ts = new Date(row.created_at).getTime();
    return Number.isFinite(ts) && now - ts <= 30 * 24 * 60 * 60 * 1000;
  }).length;
  const posts90 = postRows.filter((row) => {
    if (!row.created_at) return false;
    const ts = new Date(row.created_at).getTime();
    return Number.isFinite(ts) && now - ts <= 90 * 24 * 60 * 60 * 1000;
  }).length;
  const earliestPost = earliestDate(postRows.map((row) => row.created_at));

  const totalAssets = assetRows.length;
  const transcriptCount = assetRows.filter((asset) => isTranscriptAsset(asset)).length;
  const documentCount = assetRows.filter((asset) => isDocumentAsset(asset)).length;
  const brandCount = assetRows.filter((asset) => Boolean(isBrandAsset(asset))).length;

  const lines = [
    createdLabel ? `Created: ${createdLabel}${age ? ` (${age} ago)` : ""}` : null,
    ownerLabel ? `Owner: ${ownerLabel}` : null,
    totalMembers
      ? `Members: ${totalMembers}${roleSummary ? ` (${roleSummary})` : ""}${
          earliestJoin ? ` | First join: ${formatDateLabel(earliestJoin) ?? earliestJoin}` : ""
        }`
      : null,
    totalPosts
      ? `Posts: ${totalPosts}${posts30 ? ` | Last 30d: ${posts30}` : ""}${
          posts90 ? ` | Last 90d: ${posts90}` : ""
        }${earliestPost ? ` | First post: ${formatDateLabel(earliestPost) ?? earliestPost}` : ""}`
      : null,
    totalAssets
      ? `Media & files: ${totalAssets}${transcriptCount ? ` transcripts:${transcriptCount}` : ""}${
          documentCount ? ` docs:${documentCount}` : ""
        }${brandCount ? ` brand:${brandCount}` : ""}`
      : null,
  ].filter((line): line is string => Boolean(line));

  if (!lines.length) return null;

  return {
    id: `capsule-profile:${capsuleId}`,
    title: `${capsuleLabel} profile`,
    text: truncateText(lines.join("\n")) ?? lines.join("\n"),
    kind: "capsule_profile",
    source: "capsule_profile",
    createdAt: createdAt ?? null,
    tags: ["profile", "capsule"],
  };
}

function buildCapsuleMilestonesDoc(params: {
  capsuleId: string;
  capsuleLabel: string;
  meta: CapsuleMetaRow | null;
  memberRows: MemberKnowledgeRow[];
  postRows: PostKnowledgeRow[];
  streamSessions: LiveStreamSessionRow[];
}): CapsuleKnowledgeDoc | null {
  const { capsuleId, capsuleLabel, meta, memberRows, postRows, streamSessions } = params;
  const firstJoin = earliestDate(memberRows.map((row) => row.joined_at));
  const firstPost = earliestDate(postRows.map((row) => row.created_at));
  const firstStream = earliestDate(streamSessions.map((row) => row.started_at));
  const created = meta?.created_at ?? null;

  const lines = [
    created ? `Capsule created: ${formatDateLabel(created) ?? created}` : null,
    firstJoin ? `First member joined: ${formatDateLabel(firstJoin) ?? firstJoin}` : null,
    firstPost ? `First post: ${formatDateLabel(firstPost) ?? firstPost}` : null,
    firstStream ? `First live session: ${formatDateLabel(firstStream) ?? firstStream}` : null,
  ].filter((line): line is string => Boolean(line));

  if (!lines.length) return null;

  return {
    id: `capsule-milestones:${capsuleId}`,
    title: `${capsuleLabel} milestones`,
    text: truncateText(lines.join("\n")) ?? lines.join("\n"),
    kind: "capsule_milestones",
    source: "capsule_milestones",
    createdAt: created ?? null,
    tags: ["milestones", "capsule"],
  };
}

function buildCapsuleActivityTimelineDoc(params: {
  capsuleId: string;
  capsuleLabel: string;
  memberRows: MemberKnowledgeRow[];
  postRows: PostKnowledgeRow[];
}): CapsuleKnowledgeDoc | null {
  const { capsuleId, capsuleLabel, memberRows, postRows } = params;
  const memberByYear = groupByYear(memberRows.map((row) => row.joined_at));
  const postByYear = groupByYear(postRows.map((row) => row.created_at));
  const years = Array.from(new Set([...memberByYear.keys(), ...postByYear.keys()]))
    .map((year) => Number.parseInt(year, 10))
    .filter((year) => Number.isFinite(year))
    .sort((a, b) => b - a)
    .slice(0, 8);

  if (!years.length) return null;

  const lines = years
    .map((year) => {
      const label = year.toString();
      const joins = memberByYear.get(label) ?? 0;
      const posts = postByYear.get(label) ?? 0;
      return `${label}: +${joins} members, +${posts} posts`;
    })
    .reverse();

  const text = truncateText(lines.join("\n")) ?? lines.join("\n");

  return {
    id: `capsule-activity:${capsuleId}`,
    title: `${capsuleLabel} activity timeline`,
    text,
    kind: "capsule_activity_timeline",
    source: "capsule_activity",
    createdAt: null,
    tags: ["timeline", "capsule"],
  };
}

function buildContributorDoc(params: {
  capsuleId: string;
  capsuleLabel: string;
  postRows: PostKnowledgeRow[];
  assetRows: CapsuleAssetRow[];
}): CapsuleKnowledgeDoc | null {
  const contributions = new Map<
    string,
    {
      posts: number;
      media: number;
    }
  >();

  const addContribution = (name: string, field: "posts" | "media") => {
    const key = name && name.trim().length ? name.trim() : "Member";
    const entry = contributions.get(key) ?? { posts: 0, media: 0 };
    entry[field] += 1;
    contributions.set(key, entry);
  };

  params.postRows.forEach((row) => {
    const name = row.user_name ?? "Member";
    addContribution(name, "posts");
  });

  params.assetRows.forEach((row) => {
    const name = row.uploaded_by ?? "Member";
    addContribution(name, "media");
  });

  if (!contributions.size) return null;

  const ranked = Array.from(contributions.entries())
    .map(([name, stats]) => ({ name, total: stats.posts + stats.media, ...stats }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  const lines = ranked.map((entry) => {
    const parts = [`posts: ${entry.posts}`];
    if (entry.media) parts.push(`media: ${entry.media}`);
    return `${entry.name} — ${parts.join(" | ")}`;
  });

  const text = truncateText(lines.join("\n")) ?? lines.join("\n");
  return {
    id: `capsule-contributors:${params.capsuleId}`,
    title: `${params.capsuleLabel} contributors`,
    text,
    kind: "capsule_contributors",
    source: "capsule_profile",
    createdAt: null,
    tags: ["contributors", "capsule"],
  };
}

function buildAnalyticsDoc(params: {
  capsuleId: string;
  capsuleLabel: string;
  posts: PostKnowledgeRow[];
  ladders: CapsuleLadderSummary[];
  pollAggregates: PollVoteAggregateRow[];
  memberCount: number;
  streamSessions: LiveStreamSessionRow[];
}): CapsuleKnowledgeDoc | null {
  const { capsuleId, capsuleLabel, posts, ladders, pollAggregates, memberCount, streamSessions } =
    params;
  const uniqueAuthors = new Set(
    posts.map((post) => (post.user_name ?? "").trim()).filter((name) => name.length),
  );
  const mediaPosts = posts.filter((post) => Boolean(post.media_url)).length;
  const pollTotals = pollAggregates.reduce<Record<string, number>>((acc, row) => {
    const postId = row.post_id ? String(row.post_id) : null;
    if (!postId) return acc;
    const previous = acc[postId] ?? 0;
    const count = typeof row.vote_count === "number" ? row.vote_count : Number(row.vote_count ?? 0);
    if (Number.isFinite(count)) {
      acc[postId] = previous + count;
    }
    return acc;
  }, {});
  let topPollId: string | null = null;
  let topPollVotes = 0;
  Object.entries(pollTotals).forEach(([postId, count]) => {
    if (count > topPollVotes) {
      topPollId = postId;
      topPollVotes = count;
    }
  });
  const topPollQuestion = topPollId
    ? (() => {
        const target = posts.find((post) => post.id === topPollId || post.client_id === topPollId);
        return target ? extractPollQuestion(target.poll) : null;
      })()
    : null;

  const activeLadders = ladders.filter((ladder) => ladder.status === "active" && !isTournament(ladder));
  const tournaments = ladders.filter((ladder) => isTournament(ladder));
  const lines = [
    `Posts analyzed: ${posts.length} (media-rich: ${mediaPosts}, unique authors: ${uniqueAuthors.size})`,
    memberCount ? `Recorded members: ${memberCount}` : null,
    activeLadders.length ? `Active ladders: ${activeLadders.length}` : null,
    tournaments.length ? `Tournaments scheduled: ${tournaments.length}` : null,
    topPollQuestion && topPollVotes
      ? `Top poll "${topPollQuestion}" with ${topPollVotes} votes`
      : null,
    streamSessions.length
      ? `Recent live sessions: ${streamSessions.length} (latest ${formatDateLabel(
          streamSessions[0]?.started_at,
        ) ?? "recent"})`
      : null,
  ].filter((line): line is string => Boolean(line));

  if (!lines.length) return null;
  const text = lines.join("\n");
  return {
    id: `capsule-analytics:${capsuleId}`,
    title: `${capsuleLabel} activity snapshot`,
    text: truncateText(text) ?? text,
    kind: "capsule_analytics",
    source: "capsule_analytics",
    createdAt: posts[0]?.created_at ?? null,
    tags: ["analytics", "activity"],
  };
}

export async function loadCapsuleKnowledgeDocs(
  capsuleId: string,
  capsuleName?: string | null,
): Promise<CapsuleKnowledgeDoc[]> {
  const meta = await fetchCapsuleMeta(capsuleId);
  const capsuleLabel = capsuleName?.trim().length
    ? capsuleName.trim()
    : meta?.name?.trim().length
      ? meta.name!.trim()
      : "Capsule";
  const docs: CapsuleKnowledgeDoc[] = [];
  const seen = new Set<string>();
  const addDoc = (doc: CapsuleKnowledgeDoc | null) => {
    if (!doc || !doc.id || seen.has(doc.id)) return;
    seen.add(doc.id);
    docs.push(doc);
  };

  let postRows: PostKnowledgeRow[] = [];
  try {
    postRows = await fetchAllPages<PostKnowledgeRow>(
      async (from, to) =>
        await db
          .from("posts_view")
          .select<PostKnowledgeRow>(
            "id, client_id, capsule_id, user_name, content, media_prompt, media_url, metadata, created_at, poll, kind",
          )
          .eq("capsule_id", capsuleId)
          .order("created_at", { ascending: false })
          .range(from, to)
          .fetch(),
    );
    postRows.forEach((row) => addDoc(buildPostDoc(row, capsuleLabel)));
  } catch (error) {
    console.warn("capsule knowledge posts fetch failed", { capsuleId, error });
  }

  let pollAggregates: PollVoteAggregateRow[] = [];
  if (postRows.length) {
    try {
      const postIds = Array.from(
        new Set(
          postRows
            .map((row) => row.id ?? row.client_id ?? null)
            .filter((id): id is string => typeof id === "string" && id.length > 0),
        ),
      );
      if (postIds.length) {
        pollAggregates = await listPollVoteAggregates(postIds);
      }
    } catch (error) {
      console.warn("capsule knowledge poll aggregate fetch failed", { capsuleId, error });
    }
  }

  let ladders: CapsuleLadderSummary[] = [];
  try {
    ladders = await listCapsuleLaddersByCapsule(capsuleId);
    ladders.slice(0, LADDER_LIMIT).forEach((ladder) => {
      addDoc(buildLadderDoc(ladder, capsuleLabel));
      if (isTournament(ladder)) {
        addDoc(buildTournamentDoc(ladder, capsuleLabel));
      }
    });
  } catch (error) {
    console.warn("capsule knowledge ladders fetch failed", { capsuleId, error });
  }

  if (ladders.length) {
    const ladderDocs = await collectLadderResultDocs(
      ladders.filter((ladder) => ladder.status !== "archived"),
      capsuleLabel,
    );
    ladderDocs.forEach((doc) => addDoc(doc));
  }

  let assetRows: CapsuleAssetRow[] = [];
  try {
    assetRows = await fetchAllPages<CapsuleAssetRow>(async (from, to) => {
      const data = await listCapsuleAssets({
        capsuleId,
        limit: to - from + 1,
        offset: from,
        includeInternal: true,
      });
      return { data, error: null };
    });
    assetRows.forEach((asset) => {
      const brandVariant = isBrandAsset(asset);
      if (brandVariant) {
        addDoc(buildBrandAssetDoc(asset, capsuleLabel, brandVariant));
        return;
      }
      if (isTranscriptAsset(asset)) {
        addDoc(buildTranscriptDoc(asset, capsuleLabel));
        return;
      }
      if (isDocumentAsset(asset)) {
        addDoc(buildFileDoc(asset, capsuleLabel));
        return;
      }
      addDoc(buildAssetDoc(asset, capsuleLabel));
    });
  } catch (error) {
    console.warn("capsule knowledge assets fetch failed", { capsuleId, error });
  }

  let memberRows: MemberKnowledgeRow[] = [];
  try {
    memberRows = await fetchAllPages<MemberKnowledgeRow>(
      async (from, to) =>
        await db
          .from("capsule_members")
          .select<MemberKnowledgeRow>("role, joined_at")
          .eq("capsule_id", capsuleId)
          .order("joined_at", { ascending: true })
          .range(from, to)
          .fetch(),
    );
    const membershipDocs = buildMembershipDocs(memberRows, capsuleLabel);
    membershipDocs.forEach((doc) => addDoc(doc));
  } catch (error) {
    console.warn("capsule knowledge members fetch failed", { capsuleId, error });
  }

  let streamSessions: LiveStreamSessionRow[] = [];
  try {
    const streamResult = await db
      .from("mux_live_stream_sessions")
      .select<LiveStreamSessionRow>(
        "id, status, started_at, ended_at, duration_seconds, metadata",
      )
      .eq("capsule_id", capsuleId)
      .order("started_at", { ascending: false })
      .limit(STREAM_EVENT_LIMIT)
      .fetch();
    streamSessions = streamResult.data ?? [];
    const streamDoc = buildStreamLogDoc(capsuleId, capsuleLabel, streamSessions);
    if (streamDoc) addDoc(streamDoc);
  } catch (error) {
    console.warn("capsule knowledge stream log fetch failed", { capsuleId, error });
  }

  const analyticsDoc = buildAnalyticsDoc({
    capsuleId,
    capsuleLabel,
    posts: postRows,
    ladders,
    pollAggregates,
    memberCount: memberRows.length,
    streamSessions,
  });
  if (analyticsDoc) {
    addDoc(analyticsDoc);
  }

  const profileDoc = buildCapsuleProfileDoc({
    capsuleId,
    capsuleLabel,
    meta,
    memberRows,
    postRows,
    assetRows,
  });
  if (profileDoc) addDoc(profileDoc);

  const contributorDoc = buildContributorDoc({
    capsuleId,
    capsuleLabel,
    postRows,
    assetRows,
  });
  if (contributorDoc) addDoc(contributorDoc);

  const milestonesDoc = buildCapsuleMilestonesDoc({
    capsuleId,
    capsuleLabel,
    meta,
    memberRows,
    postRows,
    streamSessions,
  });
  if (milestonesDoc) addDoc(milestonesDoc);

  const activityDoc = buildCapsuleActivityTimelineDoc({
    capsuleId,
    capsuleLabel,
    memberRows,
    postRows,
  });
  if (activityDoc) addDoc(activityDoc);

  return docs;
}
