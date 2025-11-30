import "server-only";

import { randomUUID } from "node:crypto";

import { postOpenAIJson } from "@/adapters/ai/openai/server";
import { getChatConversationId } from "@/lib/chat/channels";
import { ASSISTANT_DISPLAY_NAME, ASSISTANT_USER_ID } from "@/shared/assistant/constants";
import type {
  ChatMessageRecord,
  ChatParticipantSummary,
} from "@/server/chat/service";
import { getChatContext, getCapsuleHistorySnippets } from "@/server/chat/retrieval";
import type { FriendSummary } from "@/server/friends/types";
import type { CapsuleSummary } from "@/server/capsules/service";
import type { CapsuleLadderSummary, CapsuleLadderMember } from "@/types/ladders";
import {
  createMessagingTask,
  findAwaitingTargetsForConversation,
  markRecipientFailed,
  markRecipientMessaged,
  recordRecipientResponse,
  deriveTaskTitle,
  type MessagingRecipient,
} from "./tasks";

type ConversationHistory = {
  messages: ChatMessageRecord[];
  participants: ChatParticipantSummary[];
};

export type AssistantDependencies = {
  getConversationHistory: (options: {
    conversationId: string;
    limit?: number;
  }) => Promise<ConversationHistory>;
  sendAssistantMessage: (options: {
    conversationId: string;
    body: string;
    task?: { id: string; title?: string | null } | null;
  }) => Promise<void>;
  sendUserMessage: (options: {
    conversationId: string;
    senderId: string;
    body: string;
    messageId?: string;
    task?: { id: string; title?: string | null } | null;
  }) => Promise<{ messageId: string }>;
  listFriends: (userId: string) => Promise<FriendSummary[]>;
  listCapsules: (userId: string) => Promise<CapsuleSummary[]>;
  listCapsuleLadders: (capsuleId: string) => Promise<CapsuleLadderSummary[]>;
  listLadderMembers: (ladderId: string) => Promise<CapsuleLadderMember[]>;
};

type AssistantContext = {
  ownerUserId: string;
  conversationId: string;
  latestMessage: ChatMessageRecord;
};

const MODEL = process.env.ASSISTANT_MODEL ?? "gpt-4o-mini";
const MAX_TOOL_ITERATIONS = 6;
const MAX_HISTORY_MESSAGES = 30;
const MAX_MESSAGE_RECIPIENTS = Number.parseInt(
  process.env.ASSISTANT_MAX_RECIPIENTS ?? "10",
  10,
);
const CONFIRMATION_THRESHOLD = Math.max(
  1,
  Math.min(Number.parseInt(process.env.ASSISTANT_CONFIRMATION_THRESHOLD ?? "3", 10), MAX_MESSAGE_RECIPIENTS),
);
const SENSITIVE_KEYWORDS = [
  "password",
  "passcode",
  "confidential",
  "nda",
  "social security",
  "ssn",
  "routing number",
  "account number",
  "wire instructions",
  "bank details",
];
const DEFAULT_TIME_WINDOW = { start: "09:00", end: "17:00" } as const;

type TimeWindowInput = {
  date: string;
  window_start?: string;
  window_end?: string;
};

type TimeSlot = {
  id: string;
  date: string;
  start: string;
  end: string;
  timezone: string;
  label: string;
};

type MeetingSlot = {
  date: string;
  start: string;
  end: string;
  timezone: string;
};

function requiresExplicitConfirmation(message: string): boolean {
  const lower = message.toLowerCase();
  return SENSITIVE_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function toMinutes(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^([0-2]?\d):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  const hours = Number.parseInt(match[1]!, 10);
  const minutes = Number.parseInt(match[2]!, 10);
  if (hours > 23) return null;
  return hours * 60 + minutes;
}

function minutesToTime(total: number): string {
  const normalized = Math.max(0, Math.min(total, 24 * 60));
  const hours = Math.floor(normalized / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (normalized % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function describeSlot(date: string, time: string, timezone: string): string {
  const safeDate = new Date(`${date}T00:00:00Z`);
  const formatter = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const dayLabel = Number.isNaN(safeDate.getTime()) ? date : formatter.format(safeDate);
  return `${dayLabel} at ${time} (${timezone})`;
}

function buildSlotId(date: string, start: string, timezone: string): string {
  return `${date}|${start}|${timezone}`.toLowerCase();
}

function normalizeTimeSlots(options: {
  windows: TimeWindowInput[];
  durationMinutes: number;
  timezone: string;
  maxSuggestions: number;
}): TimeSlot[] {
  const { windows, durationMinutes, timezone, maxSuggestions } = options;
  const slots: TimeSlot[] = [];
  windows.forEach((window) => {
    if (!window?.date) return;
    const startMinutes = toMinutes(window.window_start ?? DEFAULT_TIME_WINDOW.start);
    const endMinutes = toMinutes(window.window_end ?? DEFAULT_TIME_WINDOW.end);
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return;
    let cursor = startMinutes;
    let guard = 0;
    while (cursor + durationMinutes <= endMinutes && slots.length < maxSuggestions && guard < 48) {
      const start = minutesToTime(cursor);
      const end = minutesToTime(cursor + durationMinutes);
      slots.push({
        id: buildSlotId(window.date, start, timezone),
        date: window.date,
        start,
        end,
        timezone,
        label: describeSlot(window.date, start, timezone),
      });
      cursor += durationMinutes;
      guard += 1;
    }
  });
  return slots.slice(0, maxSuggestions);
}

function summarizeAvailability(
  responses: Array<{
    participant: string;
    slots: Array<{ date: string; start: string; end: string }>;
  }>,
  timezone: string,
  limit = 5,
) {
  const counts = new Map<string, { slot: TimeSlot; participants: Set<string> }>();
  for (const response of responses) {
    const participant = response.participant?.trim() || "Unknown";
    for (const slot of response.slots ?? []) {
      if (!slot.date || !slot.start || !slot.end) continue;
      const id = buildSlotId(slot.date, slot.start, timezone);
      if (!counts.has(id)) {
        counts.set(id, {
          slot: {
            id,
            date: slot.date,
            start: slot.start,
            end: slot.end,
            timezone,
            label: describeSlot(slot.date, slot.start, timezone),
          },
          participants: new Set<string>(),
        });
      }
      counts.get(id)!.participants.add(participant);
    }
  }

  const ranking = Array.from(counts.values())
    .map((entry) => ({
      slot: entry.slot,
      participants: Array.from(entry.participants),
      count: entry.participants.size,
    }))
    .sort((a, b) => b.count - a.count);

  return ranking.slice(0, limit);
}

function escapeIcsText(value: string | undefined | null): string {
  if (!value) return "";
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function normalizeIcsDateTime(date: string, time: string): string {
  const safeDate = date.replace(/-/g, "");
  const safeTime = time.replace(/:/g, "") + "00";
  return `${safeDate}T${safeTime}`;
}

function generateIcsEvent(options: {
  title: string;
  slot: MeetingSlot;
  description?: string | null;
  location?: string | null;
  organizerEmail?: string | null;
}): { ics: string; uid: string } {
  const uid = randomUUID();
  const dtStamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const dtStart = normalizeIcsDateTime(options.slot.date, options.slot.start);
  const dtEnd = normalizeIcsDateTime(options.slot.date, options.slot.end);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Capsules//Assistant//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART;TZID=${options.slot.timezone}:${dtStart}`,
    `DTEND;TZID=${options.slot.timezone}:${dtEnd}`,
    `SUMMARY:${escapeIcsText(options.title)}`,
  ];
  if (options.location) {
    lines.push(`LOCATION:${escapeIcsText(options.location)}`);
  }
  if (options.description) {
    lines.push(`DESCRIPTION:${escapeIcsText(options.description)}`);
  }
  if (options.organizerEmail) {
    lines.push(`ORGANIZER;CN=Capsules Assistant:mailto:${options.organizerEmail}`);
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return { ics: lines.join("\r\n"), uid };
}

type ToolResult = Record<string, unknown>;

function clampMessages(history: ChatMessageRecord[]): ChatMessageRecord[] {
  if (history.length <= MAX_HISTORY_MESSAGES) {
    return history;
  }
  return history.slice(history.length - MAX_HISTORY_MESSAGES);
}

function formatMessageForLLM(message: ChatMessageRecord, ownerUserId: string): {
  role: "user" | "assistant";
  content: string;
} {
  const isOwner = message.senderId === ownerUserId;
  const role = isOwner ? "user" : "assistant";
  const attachments =
    Array.isArray(message.attachments) && message.attachments.length > 0
      ? `\n\nAttachments: ${message.attachments
          .map((attachment) => `${attachment.name ?? attachment.id} (${attachment.mimeType})`)
          .join(", ")}`
      : "";
  return {
    role,
    content: `${message.body}${attachments}`.trim(),
  };
}

async function runTool(
  name: string,
  args: unknown,
  ctx: AssistantContext,
  deps: AssistantDependencies,
): Promise<ToolResult> {
  switch (name) {
    case "list_contacts": {
      const [friends, capsules] = await Promise.all([
        deps.listFriends(ctx.ownerUserId).catch(() => []),
        deps.listCapsules(ctx.ownerUserId).catch(() => []),
      ]);
      return {
        friends: friends.map((friend) => ({
          user_id: friend.friendUserId,
          name: friend.user?.name ?? friend.friendUserId,
          avatar: friend.user?.avatarUrl ?? null,
          since: friend.since,
        })),
        capsules: capsules.map((capsule) => ({
          id: capsule.id,
          name: capsule.name,
          slug: capsule.slug,
        })),
      };
    }
    case "get_capsule_ladders": {
      const capsuleId =
        typeof (args as Record<string, unknown>)?.capsule_id === "string"
          ? ((args as Record<string, unknown>).capsule_id as string)
          : "";
      if (!capsuleId) {
        return { ladders: [], error: "capsule_id is required" };
      }
      const ladders = await deps.listCapsuleLadders(capsuleId).catch(() => []);
      return {
        ladders: ladders.map((ladder) => ({
          id: ladder.id,
          capsule_id: ladder.capsuleId,
          name: ladder.name,
          status: ladder.status,
          visibility: ladder.visibility,
          summary: ladder.summary,
        })),
      };
    }
    case "get_ladder_members": {
      const ladderId =
        typeof (args as Record<string, unknown>)?.ladder_id === "string"
          ? ((args as Record<string, unknown>).ladder_id as string)
          : "";
      if (!ladderId) {
        return { members: [], error: "ladder_id is required" };
      }
      const members = await deps.listLadderMembers(ladderId).catch(() => []);
      return {
        members: members.map((member) => ({
          id: member.id,
          user_id: member.userId,
          display_name: member.displayName,
          handle: member.handle,
          rank: member.rank,
          rating: member.rating,
        })),
      };
    }
    case "send_messages": {
      const payload = typeof args === "object" && args ? (args as Record<string, unknown>) : {};
      const recipientsRaw = Array.isArray(payload.recipients)
        ? (payload.recipients as Array<Record<string, unknown>>)
        : [];
      const messageText =
        typeof payload.message === "string" && payload.message.trim().length
          ? payload.message.trim()
          : "";
      if (!recipientsRaw.length || !messageText) {
        return {
          task: null,
          error: "send_messages requires at least one recipient and non-empty message",
        };
      }

      if (recipientsRaw.length > MAX_MESSAGE_RECIPIENTS) {
        return {
          task: null,
          error: `Too many recipients. Limit is ${MAX_MESSAGE_RECIPIENTS}.`,
          limit: MAX_MESSAGE_RECIPIENTS,
        };
      }

      const defaultTrackResponses =
        typeof payload.track_responses === "boolean"
          ? payload.track_responses
          : typeof (payload as Record<string, unknown>).trackResponses === "boolean"
            ? Boolean((payload as Record<string, unknown>).trackResponses)
            : undefined;

      const recipients: MessagingRecipient[] = [];
      for (const entryRaw of recipientsRaw) {
        if (!entryRaw || typeof entryRaw !== "object") continue;
        const entry = entryRaw as Record<string, unknown>;
        const userId =
          typeof entry.user_id === "string"
            ? entry.user_id
            : typeof entry.userId === "string"
              ? entry.userId
              : null;
        if (!userId || userId === ctx.ownerUserId) continue;
        const recipient: MessagingRecipient = { userId };
        const resolvedName =
          typeof entry.name === "string"
            ? entry.name
            : typeof entry.display_name === "string"
              ? entry.display_name
              : null;
        if (resolvedName !== null) {
          recipient.name = resolvedName;
        }
        const resolvedTrack =
          typeof entry.track_responses === "boolean"
            ? entry.track_responses
            : typeof entry.expect_reply === "boolean"
              ? entry.expect_reply
              : defaultTrackResponses;
        if (resolvedTrack !== undefined) {
          recipient.trackResponses = resolvedTrack;
        }
        if (entry.context && typeof entry.context === "object") {
          recipient.context = entry.context as Record<string, unknown>;
        }
        recipients.push(recipient);
      }

      if (!recipients.length) {
        return { task: null, error: "No valid recipients resolved." };
      }

      const needsConfirmation =
        recipients.length > CONFIRMATION_THRESHOLD || requiresExplicitConfirmation(messageText);
      const isConfirmed = Boolean((payload as Record<string, unknown>).confirmed);
      if (needsConfirmation && !isConfirmed) {
        return {
          task: null,
          error: "confirmation_required",
          reason:
            recipients.length > CONFIRMATION_THRESHOLD
              ? `More than ${CONFIRMATION_THRESHOLD} recipients requested.`
              : "Message appears to reference confidential information.",
          recipients: recipients.length,
          limit: CONFIRMATION_THRESHOLD,
        };
      }

      const task = await createMessagingTask({
        ownerUserId: ctx.ownerUserId,
        kind: payload.kind && typeof payload.kind === "string" ? payload.kind : "assistant_broadcast",
        prompt: messageText,
        recipients,
        payload: {
          recipients: recipients.map((recipient) => ({
            userId: recipient.userId,
            name: recipient.name ?? null,
            trackResponses: recipient.trackResponses ?? false,
          })),
          trackResponses: defaultTrackResponses ?? false,
        },
      });
      const taskTitle = deriveTaskTitle(task.task.prompt) ?? task.task.prompt ?? null;
      const taskMeta = { id: task.task.id, title: taskTitle };

      const targetMap = new Map(task.targets.map((target) => [target.target_user_id, target]));
      let anonymousCounter = 0;
      const resolveRecipientLabel = (recipient: MessagingRecipient): string => {
        if (recipient.name && recipient.name.trim().length > 0) {
          return recipient.name.trim();
        }
        if (recipient.context && typeof recipient.context === "object") {
          const contextObject = recipient.context as Record<string, unknown>;
          const labelCandidates = [
            contextObject.label,
            contextObject.display_name,
            contextObject.displayName,
            contextObject.name,
            contextObject.title,
          ];
          for (const candidate of labelCandidates) {
            if (typeof candidate === "string" && candidate.trim().length > 0) {
              return candidate.trim();
            }
          }
        }
        anonymousCounter += 1;
        return `Contact ${anonymousCounter}`;
      };

      const resultEntries: Array<{
        recipient: string;
        status: "sent" | "awaiting_response" | "failed" | "skipped";
        awaiting_response: boolean;
        note?: string;
      }> = [];

      for (const recipient of recipients) {
        const target = targetMap.get(recipient.userId);
        const recipientLabel = resolveRecipientLabel(recipient);
        if (!target) {
          resultEntries.push({
            recipient: recipientLabel,
            status: "skipped",
            awaiting_response: false,
            note: "Target mapping not found.",
          });
          continue;
        }

        const conversationId = target.conversation_id;
        const clientMessageId = randomUUID();

        try {
          const sendResult = await deps.sendUserMessage({
            conversationId,
            senderId: ctx.ownerUserId,
            body: messageText,
            messageId: clientMessageId,
            task: taskMeta,
          });
          const persistedMessageId = sendResult?.messageId ?? clientMessageId;
          const updatedTarget = await markRecipientMessaged({
            target,
            messageId: persistedMessageId,
          });
          const awaitingResponse = updatedTarget.status === "awaiting_response";
          const statusLabel = awaitingResponse ? "awaiting_response" : "sent";
          resultEntries.push({
            recipient: recipientLabel,
            status: statusLabel,
            awaiting_response: awaitingResponse,
          });
        } catch (error) {
          const reason = error instanceof Error ? error.message : "Unknown error";
          await markRecipientFailed({ target, error: reason });
          resultEntries.push({
            recipient: recipientLabel,
            status: "failed",
            awaiting_response: false,
            note: reason,
          });
        }
      }

      return {
        task: {
          id: task.task.id,
          status: task.task.status,
        },
        results: resultEntries,
      };
    }
    case "search_memories": {
      const payload = typeof args === "object" && args ? (args as Record<string, unknown>) : {};
      const query = typeof payload.query === "string" ? payload.query.trim() : "";
      if (!query) {
        return { snippets: [], error: "query is required" };
      }
      const limit = Number.isFinite(payload.limit)
        ? Math.max(1, Math.min(Number(payload.limit), 12))
        : undefined;
      const capsuleId =
        typeof payload.capsule_id === "string" && payload.capsule_id.trim().length
          ? payload.capsule_id.trim()
          : null;
      const contextOptions: {
        ownerId: string;
        message: string;
        limit?: number;
        capsuleId?: string | null;
      } = {
        ownerId: ctx.ownerUserId,
        message: query,
      };
      if (typeof limit === "number") {
        contextOptions.limit = limit;
      }
      if (capsuleId !== null) {
        contextOptions.capsuleId = capsuleId;
      }
      const context = await getChatContext(contextOptions);
      return {
        query: context?.query ?? query,
        snippets: context?.snippets ?? [],
      };
    }
    case "capsule_history": {
      const payload = typeof args === "object" && args ? (args as Record<string, unknown>) : {};
      const capsuleId =
        typeof payload.capsule_id === "string" && payload.capsule_id.trim().length
          ? payload.capsule_id.trim()
          : "";
      if (!capsuleId) {
        return { snippets: [], error: "capsule_id is required" };
      }
      const limit = Number.isFinite(payload.limit)
        ? Math.max(1, Math.min(Number(payload.limit), 12))
        : undefined;
      const query = typeof payload.query === "string" ? payload.query.trim() : null;
      const historyOptions: {
        capsuleId?: string | null;
        viewerId?: string | null;
        limit?: number;
        query?: string | null;
      } = {
        capsuleId,
        viewerId: ctx.ownerUserId,
        query,
      };
      if (typeof limit === "number") {
        historyOptions.limit = limit;
      }
      const snippets = await getCapsuleHistorySnippets(historyOptions);
      return { snippets };
    }
    case "propose_times": {
      const payload = typeof args === "object" && args ? (args as Record<string, unknown>) : {};
      const timezone = typeof payload.timezone === "string" ? payload.timezone.trim() : "";
      const windows = Array.isArray(payload.windows)
        ? (payload.windows as TimeWindowInput[])
        : [];
      if (!timezone || !windows.length) {
        return { suggestions: [], error: "timezone and windows are required" };
      }
      const durationMinutes = Number.isFinite(payload.duration_minutes)
        ? Math.max(15, Math.min(Number(payload.duration_minutes), 240))
        : 30;
      const maxSuggestions = Number.isFinite(payload.max_suggestions)
        ? Math.max(1, Math.min(Number(payload.max_suggestions), 12))
        : 6;
      const suggestions = normalizeTimeSlots({
        windows,
        durationMinutes,
        timezone,
        maxSuggestions,
      });
      return { suggestions, duration_minutes: durationMinutes };
    }
    case "collect_availability": {
      const payload = typeof args === "object" && args ? (args as Record<string, unknown>) : {};
      const responses = Array.isArray(payload.responses)
        ? (payload.responses as Array<{
            participant: string;
            slots: Array<{ date: string; start: string; end: string }>;
          }>)
        : [];
      if (!responses.length) {
        return { summary: [], error: "responses are required" };
      }
      const timezone =
        typeof payload.timezone === "string" && payload.timezone.trim().length
          ? payload.timezone.trim()
          : "UTC";
      const ranking = summarizeAvailability(responses, timezone);
      return {
        top_slots: ranking,
        participant_count: responses.length,
      };
    }
    case "finalize_meeting": {
      const payload = typeof args === "object" && args ? (args as Record<string, unknown>) : {};
      const title = typeof payload.title === "string" ? payload.title.trim() : "";
      const slot = payload.slot as MeetingSlot | undefined;
      if (!title || !slot || !slot.date || !slot.start || !slot.end || !slot.timezone) {
        return { error: "title and slot are required" };
      }
      const { ics, uid } = generateIcsEvent({
        title,
        slot,
        description: typeof payload.description === "string" ? payload.description : null,
        location: typeof payload.location === "string" ? payload.location : null,
      });
      return {
        meeting: {
          title,
          slot,
          location: typeof payload.location === "string" ? payload.location : null,
          description: typeof payload.description === "string" ? payload.description : null,
        },
        ics,
        uid,
      };
    }
    case "send_calendar_invite": {
      const payload = typeof args === "object" && args ? (args as Record<string, unknown>) : {};
      const title = typeof payload.title === "string" ? payload.title.trim() : "";
      const slot = payload.slot as MeetingSlot | undefined;
      if (!title || !slot || !slot.date || !slot.start || !slot.end || !slot.timezone) {
        return { error: "title and slot are required" };
      }
      const recipients = Array.isArray(payload.recipients)
        ? (payload.recipients as Array<Record<string, unknown>>)
        : [];
      if (recipients.length > MAX_MESSAGE_RECIPIENTS) {
        return { error: `Too many recipients. Limit is ${MAX_MESSAGE_RECIPIENTS}.` };
      }
      const { ics, uid } = generateIcsEvent({
        title,
        slot,
        description: typeof payload.description === "string" ? payload.description : null,
        location: typeof payload.location === "string" ? payload.location : null,
      });
      const deliveries: Array<{ recipient: string; status: string }> = [];
      for (const recipient of recipients) {
        if (!recipient || typeof recipient !== "object") continue;
        const userId =
          typeof recipient.user_id === "string"
            ? recipient.user_id
            : typeof (recipient as Record<string, unknown>).userId === "string"
              ? ((recipient as Record<string, unknown>).userId as string)
              : null;
        if (!userId || userId === ctx.ownerUserId) continue;
        const conversationId = getConversationId(ctx.ownerUserId, userId);
        const inviteNote =
          typeof recipient.note === "string" && recipient.note.trim().length
            ? `\n\nNote: ${recipient.note.trim()}`
            : "";
        const includeMessage =
          typeof payload.include_message === "string" && payload.include_message.trim().length
            ? `\n\nMessage from organizer:\n${payload.include_message.trim()}`
            : "";
        const body = [
          `Meeting invite: ${title}`,
          `When: ${slot.date} ${slot.start}-${slot.end} (${slot.timezone})`,
          payload.location ? `Location: ${payload.location}` : null,
          payload.description ? `Agenda: ${payload.description}` : null,
          inviteNote || null,
          includeMessage || null,
          "",
          "ICS (copy into a .ics file to add to your calendar):",
          "```ics",
          ics,
          "```",
        ]
          .filter((line): line is string => line !== null)
          .join("\n");
        try {
          await deps.sendUserMessage({
            conversationId,
            senderId: ctx.ownerUserId,
            body,
          });
          deliveries.push({
            recipient: typeof recipient.name === "string" ? recipient.name : userId,
            status: "sent",
          });
        } catch (error) {
          deliveries.push({
            recipient: typeof recipient.name === "string" ? recipient.name : userId,
            status: error instanceof Error ? `failed: ${error.message}` : "failed",
          });
        }
      }
      return {
        meeting: {
          title,
          slot,
          location: typeof payload.location === "string" ? payload.location : null,
          description: typeof payload.description === "string" ? payload.description : null,
        },
        ics,
        uid,
        deliveries,
      };
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

function getConversationId(ownerId: string, recipientId: string): string {
  return getChatConversationId(ownerId, recipientId);
}

const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "list_contacts",
      description:
        "Return the user's friends and capsule summaries to help plan outreach. Treat any user_id fields as private metadata that should never be echoed to the member.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_capsule_ladders",
      description: "List ladders for a capsule the user manages or belongs to.",
      parameters: {
        type: "object",
        properties: {
          capsule_id: { type: "string" },
        },
        required: ["capsule_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_ladder_members",
      description: "List members in a ladder to target outreach.",
      parameters: {
        type: "object",
        properties: {
          ladder_id: { type: "string" },
        },
        required: ["ladder_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_messages",
      description:
        "Send a direct message to one or many recipients on behalf of the user. Call this only when you know the exact targets and final message copy, and confirm outcomes using human-readable recipient names only.",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string" },
          recipients: {
            type: "array",
            items: {
              type: "object",
              properties: {
                user_id: { type: "string" },
                name: { type: "string" },
                track_responses: { type: "boolean" },
                context: { type: "object" },
              },
              required: ["user_id"],
              additionalProperties: false,
            },
          },
          track_responses: { type: "boolean" },
          kind: { type: "string" },
          confirmed: { type: "boolean" },
        },
        required: ["message", "recipients"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_memories",
      description:
        "Retrieve grounded context from the user's memories/resurfaced content to cite in responses.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "number" },
          capsule_id: { type: "string" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "capsule_history",
      description:
        "Fetch published capsule history snippets or knowledge-base results to cite when coordinating with members.",
      parameters: {
        type: "object",
        properties: {
          capsule_id: { type: "string" },
          query: { type: "string" },
          limit: { type: "number" },
        },
        required: ["capsule_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_times",
      description:
        "Generate suggested meeting times inside the provided windows. Use before collecting availability or sending invites.",
      parameters: {
        type: "object",
        properties: {
          timezone: { type: "string" },
          duration_minutes: { type: "number" },
          windows: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: { type: "string" },
                window_start: { type: "string" },
                window_end: { type: "string" },
              },
              required: ["date"],
              additionalProperties: false,
            },
          },
          max_suggestions: { type: "number" },
        },
        required: ["timezone", "windows"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "collect_availability",
      description:
        "Summarize availability responses from participants and highlight the best overlapping slots.",
      parameters: {
        type: "object",
        properties: {
          timezone: { type: "string" },
          responses: {
            type: "array",
            items: {
              type: "object",
              properties: {
                participant: { type: "string" },
                slots: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      date: { type: "string" },
                      start: { type: "string" },
                      end: { type: "string" },
                    },
                    required: ["date", "start", "end"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["participant", "slots"],
              additionalProperties: false,
            },
          },
        },
        required: ["responses"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "finalize_meeting",
      description:
        "Lock in a selected slot and generate an ICS payload (without messaging participants).",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          location: { type: "string" },
          slot: {
            type: "object",
            properties: {
              date: { type: "string" },
              start: { type: "string" },
              end: { type: "string" },
              timezone: { type: "string" },
            },
            required: ["date", "start", "end", "timezone"],
            additionalProperties: false,
          },
        },
        required: ["title", "slot"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_calendar_invite",
      description:
        "Generate an ICS event and optionally deliver it to specific recipients via direct message.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          location: { type: "string" },
          slot: {
            type: "object",
            properties: {
              date: { type: "string" },
              start: { type: "string" },
              end: { type: "string" },
              timezone: { type: "string" },
            },
            required: ["date", "start", "end", "timezone"],
            additionalProperties: false,
          },
          recipients: {
            type: "array",
            items: {
              type: "object",
              properties: {
                user_id: { type: "string" },
                name: { type: "string" },
                note: { type: "string" },
              },
              required: ["user_id"],
              additionalProperties: false,
            },
          },
          include_message: { type: "string" },
        },
        required: ["title", "slot"],
        additionalProperties: false,
      },
    },
  },
] as const;

function buildSystemPrompt(): string {
  return [
    `You are ${ASSISTANT_DISPLAY_NAME}, a proactive operations AI integrated into player messaging.`,
    "You can coordinate outreach, gather responses, schedule follow-ups, and report back clearly with citations (quotes from messages).",
    "Confirm your plan once when needed, then carry it out after approval without repeating the same question unless new information changes the request.",
    "Use the available tools to inspect contacts, ladder rosters, and send messages.",
    "When you send outreach, be explicit about who received it using human-readable names or roles only.",
    "When summarizing updates, cite the sender and quote key phrases from their replies.",
    "Treat user_id values and other tool metadata as private context; never surface raw identifiers, UUIDs, or tokens to the member.",
    "If information is missing or ambiguous, ask follow-up questions before acting, but avoid redundant confirmations once the member has signed off.",
  ].join(" ");
}

export async function handleAssistantMessage(
  ctx: AssistantContext,
  deps: AssistantDependencies,
): Promise<void> {
  try {
    const history = await deps.getConversationHistory({
      conversationId: ctx.conversationId,
      limit: MAX_HISTORY_MESSAGES,
    });
    const messages = clampMessages(history.messages).map((message) =>
      formatMessageForLLM(message, ctx.ownerUserId),
    );
    const chatMessages: Array<Record<string, unknown>> = [
      { role: "system", content: buildSystemPrompt() },
      ...messages.map((message) => ({ role: message.role, content: message.content })),
    ];

    let iterations = 0;
    let finalResponse: string | null = null;
    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations += 1;
      const completion = await postOpenAIJson<{
        choices?: Array<{
          message?: {
            role?: string;
            content?: string | null;
            tool_calls?: Array<{
              id: string;
              function: { name: string; arguments: string };
            }>;
          };
        }>;
      }>("/chat/completions", {
        model: MODEL,
        temperature: 0.2,
        messages: chatMessages,
        tools: TOOL_DEFINITIONS,
      });

      if (!completion.ok || !completion.data?.choices?.length) {
        finalResponse =
          "I ran into an issue while thinking through that. Try again in a bit and I'll take another swing.";
        break;
      }
      const choice = completion.data.choices[0];
      const message = choice?.message ?? null;
      if (!message) {
        finalResponse =
          "I didn't receive a response from the model. Let's try again with a bit more detail.";
        break;
      }
      if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
        chatMessages.push({
          role: "assistant",
          content: message.content ?? "",
          tool_calls: message.tool_calls,
        });

        for (const toolCall of message.tool_calls) {
          let parsedArgs: unknown = {};
          try {
            parsedArgs = JSON.parse(toolCall.function.arguments ?? "{}");
          } catch {
            parsedArgs = {};
          }
          const result = await runTool(toolCall.function.name, parsedArgs, ctx, deps).catch(
            (error) => ({
              error: error instanceof Error ? error.message : "Tool execution failed",
            }),
          );
          chatMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(result ?? {}),
          });
        }
        continue;
      }

      finalResponse =
        typeof message.content === "string" && message.content.trim().length
          ? message.content.trim()
          : null;
      break;
    }

    if (!finalResponse) {
      finalResponse =
        "I'm here and ready to help. Let me know if you'd like me to follow up or try something different.";
    }

    await deps.sendAssistantMessage({
      conversationId: ctx.conversationId,
      body: finalResponse,
    });
  } catch (error) {
    const fallback =
      error instanceof Error
        ? `I hit an unexpected issue: ${error.message}. Please try again in a moment.`
        : "I hit an unexpected issue. Please try again in a moment.";
    await deps.sendAssistantMessage({
      conversationId: ctx.conversationId,
      body: fallback,
    });
  }
}

export async function handleAssistantTaskResponse(
  params: {
    ownerUserId: string;
    conversationId: string;
    message: ChatMessageRecord;
  },
  deps: AssistantDependencies,
): Promise<void> {
  const targets = await findAwaitingTargetsForConversation({
    ownerUserId: params.ownerUserId,
    conversationId: params.conversationId,
  });
  if (!targets.length) return;

  for (const target of targets) {
    if (target.target_user_id !== params.message.senderId) {
      continue;
    }
    const record = await recordRecipientResponse({
      target,
      messageId: params.message.id,
      messageBody: params.message.body,
      receivedAt: params.message.sentAt,
    });
    if (!record) continue;

    const cited = record.snippet.split("\n")[0] ?? record.snippet;
    const remaining =
      record.outstandingCount > 0
        ? `Still waiting on ${record.outstandingCount} ${
            record.outstandingCount === 1 ? "response" : "responses"
          }.`
        : "That's everyone!";
    const summaryLines = [
      `Update from ${record.targetName ?? "a contact"}:`,
      `> ${cited.trim()}`,
      remaining,
    ];
    await deps.sendAssistantMessage({
      conversationId: getConversationId(record.ownerUserId, ASSISTANT_USER_ID),
      body: summaryLines.join("\n"),
      task: { id: record.taskId, title: record.targetName ?? null },
    });
  }
}
