import { getChatConversationId } from "@/lib/chat/channels";
import { createAssistantDependenciesForUser } from "@/server/chat/service";
import { serverEnv } from "@/lib/env/server";
import { ASSISTANT_USER_ID } from "@/shared/assistant/constants";

import {
  listAwaitingTargetsOlderThan,
  markTaskTargetReminded,
  type AssistantTaskTargetRow,
} from "./repository";

type ReminderOptions = {
  thresholdHours?: number;
  limit?: number;
};

const DEFAULT_THRESHOLD_HOURS = serverEnv.ASSISTANT_REMINDER_THRESHOLD_HOURS ?? 6;
const MAX_REMINDERS_PER_RUN = 25;

function extractTargetName(target: AssistantTaskTargetRow): string {
  const data = (target.data && typeof target.data === "object" ? target.data : null) as
    | Record<string, unknown>
    | null;
  const name = typeof data?.name === "string" ? data.name : null;
  if (name && name.trim().length) return name.trim();
  return "this contact";
}

function shouldSkipReminder(target: AssistantTaskTargetRow, cutoffIso: string): boolean {
  const data = (target.data && typeof target.data === "object" ? target.data : null) as
    | Record<string, unknown>
    | null;
  const remindedAt = typeof data?.reminded_at === "string" ? data.reminded_at : null;
  if (!remindedAt) return false;
  return remindedAt >= cutoffIso;
}

export async function runAssistantReminderSweep(options: ReminderOptions = {}) {
  const thresholdHours = options.thresholdHours ?? DEFAULT_THRESHOLD_HOURS;
  const limit = options.limit ?? MAX_REMINDERS_PER_RUN;
  const cutoff = new Date(Date.now() - thresholdHours * 60 * 60 * 1000);
  const cutoffIso = cutoff.toISOString();

  const targets = await listAwaitingTargetsOlderThan({ olderThan: cutoffIso, limit });
  if (!targets.length) return { remindersSent: 0 };

  let remindersSent = 0;
  for (const target of targets) {
    if (shouldSkipReminder(target, cutoffIso)) {
      continue;
    }

    const deps = createAssistantDependenciesForUser(target.owner_user_id);
    const recipientName = extractTargetName(target);
    const ageHours = Math.max(
      1,
      Math.round((Date.now() - Date.parse(target.updated_at)) / (60 * 60 * 1000)),
    );
    const conversationId = getChatConversationId(target.owner_user_id, ASSISTANT_USER_ID);
    const body = `Still awaiting a reply from ${recipientName} (${ageHours}h). Want me to send a polite follow-up or summarize where things stand?`;

    try {
      await deps.sendAssistantMessage({ conversationId, body });
      const data = (target.data && typeof target.data === "object" ? { ...target.data } : {}) as Record<string, unknown>;
      data.reminded_at = new Date().toISOString();
      data.reminder_count = typeof data.reminder_count === "number" ? (data.reminder_count as number) + 1 : 1;
      await markTaskTargetReminded({ id: target.id, data });
      remindersSent += 1;
    } catch (error) {
      console.error("assistant reminder send failed", { targetId: target.id, error });
    }
  }

  return { remindersSent };
}
