import { getDatabaseAdminClient } from "@/config/database";
import { listCapsuleAssets, type CapsuleAssetRow } from "@/server/capsules/repository";
import { listCapsuleLaddersByCapsule } from "@/server/ladders/repository";
import type { CapsuleKnowledgeDoc } from "./knowledge-index";
import type { CapsuleLadderSummary } from "@/types/ladders";

const POST_LIMIT = 200;
const LADDER_LIMIT = 20;
const ASSET_LIMIT = 200;
const MAX_MEMBER_ROWS = 5000;
const TITLE_LIMIT = 160;
const DOC_TEXT_LIMIT = 1400;

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

const db = getDatabaseAdminClient();

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

export async function loadCapsuleKnowledgeDocs(
  capsuleId: string,
  capsuleName?: string | null,
): Promise<CapsuleKnowledgeDoc[]> {
  const capsuleLabel = capsuleName?.trim().length ? capsuleName.trim() : "Capsule";
  const docs: CapsuleKnowledgeDoc[] = [];
  const seen = new Set<string>();
  const addDoc = (doc: CapsuleKnowledgeDoc | null) => {
    if (!doc || !doc.id || seen.has(doc.id)) return;
    seen.add(doc.id);
    docs.push(doc);
  };

  try {
    const postResult = await db
      .from("posts_view")
      .select<PostKnowledgeRow>(
        "id, client_id, capsule_id, user_name, content, media_prompt, media_url, metadata, created_at, poll, kind",
      )
      .eq("capsule_id", capsuleId)
      .order("created_at", { ascending: false })
      .limit(POST_LIMIT)
      .fetch();
    (postResult.data ?? []).forEach((row) => addDoc(buildPostDoc(row, capsuleLabel)));
  } catch (error) {
    console.warn("capsule knowledge posts fetch failed", { capsuleId, error });
  }

  try {
    const ladders = await listCapsuleLaddersByCapsule(capsuleId);
    ladders.slice(0, LADDER_LIMIT).forEach((ladder) => addDoc(buildLadderDoc(ladder, capsuleLabel)));
  } catch (error) {
    console.warn("capsule knowledge ladders fetch failed", { capsuleId, error });
  }

  try {
    const assets = await listCapsuleAssets({ capsuleId, limit: ASSET_LIMIT });
    assets.forEach((asset) => addDoc(buildAssetDoc(asset, capsuleLabel)));
  } catch (error) {
    console.warn("capsule knowledge assets fetch failed", { capsuleId, error });
  }

  try {
    const memberResult = await db
      .from("capsule_members")
      .select<MemberKnowledgeRow>("role, joined_at")
      .eq("capsule_id", capsuleId)
      .order("joined_at", { ascending: true })
      .limit(MAX_MEMBER_ROWS)
      .fetch();
    const membershipDocs = buildMembershipDocs(memberResult.data ?? [], capsuleLabel);
    membershipDocs.forEach((doc) => addDoc(doc));
  } catch (error) {
    console.warn("capsule knowledge members fetch failed", { capsuleId, error });
  }

  return docs;
}
