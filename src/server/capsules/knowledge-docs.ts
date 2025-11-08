import { getDatabaseAdminClient } from "@/config/database";
import { listCapsuleLaddersByCapsule } from "@/server/ladders/repository";
import type { CapsuleKnowledgeDoc } from "./knowledge-index";
import type { CapsuleLadderSummary } from "@/types/ladders";

const POST_LIMIT = 80;
const LADDER_LIMIT = 12;
const MAX_MEMBER_ROWS = 2000;
const TITLE_LIMIT = 160;
const DOC_TEXT_LIMIT = 1200;

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

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
}

function formatIso(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function formatDateLabel(value: string | null): string | null {
  const iso = formatIso(value);
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

function extractTags(meta: unknown): string[] {
  if (!meta || typeof meta !== "object") return [];
  const record = meta as Record<string, unknown>;
  const rawTags =
    Array.isArray(record.tags) && record.tags.length
      ? record.tags
      : Array.isArray(record.summary_tags)
        ? record.summary_tags
        : [];
  return rawTags
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter((tag) => tag.length > 0);
}

function extractPollSummary(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const question = typeof record.question === "string" ? record.question.trim() : null;
  const options = Array.isArray(record.options)
    ? record.options.map((option) =>
        typeof option === "string" ? option.trim() : String(option ?? ""),
      )
    : [];
  if (!question || !options.length) return null;
  return [`Poll: ${question}`, ...options.map((option, index) => `• ${index + 1}. ${option}`)].join(
    "\n",
  );
}

function buildPostDoc(
  row: PostKnowledgeRow,
  capsuleLabel: string,
): CapsuleKnowledgeDoc | null {
  const id = row.id ?? row.client_id;
  if (!id) return null;
  const author = row.user_name?.trim() || "Member";
  const createdLabel = formatDateLabel(row.created_at);
  const title = createdLabel
    ? `${capsuleLabel} post by ${author} (${createdLabel})`
    : `${capsuleLabel} post by ${author}`;
  const tags = extractTags(row.metadata);
  const poll = extractPollSummary(row.poll);
  const segments = [
    row.content?.trim() || null,
    row.media_prompt ? `Media prompt: ${row.media_prompt.trim()}` : null,
    row.media_url ? `Media reference: ${row.media_url}` : null,
    poll,
    tags.length ? `Tags: ${tags.join(", ")}` : null,
  ].filter((segment): segment is string => Boolean(segment));
  if (!segments.length) return null;
  const text = segments.join("\n\n");
  return {
    id: `capsule-post:${id}`,
    title: truncateTitle(title),
    text: truncateText(text),
    kind: "capsule_post",
    source: "capsule_post",
    createdAt: row.created_at ?? null,
    tags,
  };
}

function buildLadderDoc(
  ladder: CapsuleLadderSummary,
  capsuleLabel: string,
): CapsuleKnowledgeDoc | null {
  if (!ladder.id) return null;
  const segments = [
    ladder.summary ? `Summary: ${ladder.summary}` : null,
    ladder.game?.summary ? `Game notes: ${ladder.game.summary}` : null,
    ladder.game?.title ? `Game title: ${ladder.game.title}` : null,
    `Status: ${ladder.status}`,
    `Visibility: ${ladder.visibility}`,
  ].filter((segment): segment is string => Boolean(segment));
  if (!segments.length) return null;
  return {
    id: `capsule-ladder:${ladder.id}`,
    title: truncateTitle(`${capsuleLabel} ladder: ${ladder.name ?? "Unnamed ladder"}`),
    text: truncateText(segments.join("\n\n")),
    kind: "capsule_ladder",
    source: "capsule_ladder",
    createdAt: ladder.updatedAt ?? ladder.createdAt ?? null,
  };
}

function buildMembershipDocs(
  rows: MemberKnowledgeRow[],
  capsuleLabel: string,
): CapsuleKnowledgeDoc[] {
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
    const joined = formatIso(row.joined_at);
    if (joined) {
      const year = new Date(joined).getUTCFullYear().toString();
      yearlyCounts.set(year, (yearlyCounts.get(year) ?? 0) + 1);
    }
  });

  const total = rows.length;
  const roleSummary = Array.from(roleCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([role, count]) => `${role}: ${count}`)
    .join(", ");
  const yearSummary = Array.from(yearlyCounts.entries())
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([year, count]) => `${year}: ${count}`)
    .join(", ");

  const docs: CapsuleKnowledgeDoc[] = [
    {
      id: `capsule-membership:${capsuleLabel}:summary`,
      title: `${capsuleLabel} membership snapshot`,
      text: truncateText(
        [`Total members: ${total}`, roleSummary ? `Roles — ${roleSummary}` : null, yearSummary ? `Yearly joins — ${yearSummary}` : null]
          .filter(Boolean)
          .join("\n\n"),
      ),
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

function truncateTitle(value: string): string {
  return truncate(value, TITLE_LIMIT);
}

function truncateText(value: string): string {
  return truncate(value, DOC_TEXT_LIMIT);
}

export async function loadCapsuleKnowledgeDocs(
  capsuleId: string,
  capsuleName?: string | null,
): Promise<CapsuleKnowledgeDoc[]> {
  const capsuleLabel = capsuleName?.trim().length ? capsuleName.trim() : "Capsule";
  const docs: CapsuleKnowledgeDoc[] = [];

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
    const postRows = postResult.data ?? [];
    postRows.forEach((row) => {
      const doc = buildPostDoc(row, capsuleLabel);
      if (doc) docs.push(doc);
    });
  } catch (error) {
    console.warn("capsule knowledge posts fetch failed", { capsuleId, error });
  }

  try {
    const ladders = await listCapsuleLaddersByCapsule(capsuleId);
    ladders.slice(0, LADDER_LIMIT).forEach((ladder) => {
      const doc = buildLadderDoc(ladder, capsuleLabel);
      if (doc) docs.push(doc);
    });
  } catch (error) {
    console.warn("capsule knowledge ladders fetch failed", { capsuleId, error });
  }

  try {
    const memberResult = await db
      .from("capsule_members")
      .select<MemberKnowledgeRow>("role, joined_at")
      .eq("capsule_id", capsuleId)
      .order("joined_at", { ascending: true })
      .limit(MAX_MEMBER_ROWS)
      .fetch();
    const memberRows = memberResult.data ?? [];
    docs.push(...buildMembershipDocs(memberRows, capsuleLabel));
  } catch (error) {
    console.warn("capsule knowledge members fetch failed", { capsuleId, error });
  }

  return docs;
}
