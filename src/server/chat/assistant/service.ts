import "server-only";

import { randomUUID } from "node:crypto";

import { postOpenAIJson } from "@/adapters/ai/openai/server";
import { getChatConversationId } from "@/lib/chat/channels";
import { ASSISTANT_DISPLAY_NAME, ASSISTANT_USER_ID } from "@/shared/assistant/constants";
import type {
  ChatMessageRecord,
  ChatParticipantSummary,
} from "@/server/chat/service";
import type { FriendSummary } from "@/server/friends/types";
import type { CapsuleSummary } from "@/server/capsules/service";
import type { CapsuleLadderSummary, CapsuleLadderMember } from "@/types/ladders";
import {
  createMessagingTask,
  findAwaitingTargetsForConversation,
  markRecipientFailed,
  markRecipientMessaged,
  recordRecipientResponse,
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
  }) => Promise<void>;
  sendUserMessage: (options: {
    conversationId: string;
    senderId: string;
    body: string;
    messageId?: string;
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
        },
        required: ["message", "recipients"],
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
    });
  }
}
