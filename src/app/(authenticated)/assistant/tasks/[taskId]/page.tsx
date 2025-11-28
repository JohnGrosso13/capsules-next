"use client";

import * as React from "react";
import { Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

import { ChatProvider, requestChatStart, useChatContext } from "@/components/providers/ChatProvider";
import { FriendsDataProvider } from "@/components/providers/FriendsDataProvider";
import { PartyProvider } from "@/components/providers/PartyProvider";
import { ComposerProvider, AiComposerRoot } from "@/components/composer/ComposerProvider";
import { useAssistantTasks } from "@/hooks/useAssistantTasks";
import { ASSISTANT_DISPLAY_NAME, ASSISTANT_USER_ID } from "@/shared/assistant/constants";
import { buildProfileHref } from "@/lib/profile/routes";
import type { AssistantTaskSummary } from "@/types/assistant";

import styles from "./task-detail.module.css";

function TaskThreadCard({
  task,
  onOpenConversation,
}: {
  task: AssistantTaskSummary;
  onOpenConversation: (recipientUserId: string, conversationId?: string | null, name?: string | null) => void;
}) {
  return (
    <section className={styles.card}>
      <header className={styles.cardHeader}>
        <div>
          <p className={styles.kicker}>Task</p>
          <h1 className={styles.title}>{task.prompt || "Assistant task"}</h1>
          <p className={styles.subhead}>
            {task.kind.replace(/_/g, " ")} · {task.status.replace(/_/g, " ")}
          </p>
        </div>
        <Link href="/friends?tab=Assistant" className={styles.secondaryButton}>
          Back to Assistant
        </Link>
      </header>

      <div className={styles.section}>
        <p className={styles.sectionTitle}>Recipients</p>
        {task.recipients.length ? (
          <ul className={styles.recipientList}>
            {task.recipients.map((recipient) => {
              const name = recipient.name?.trim() || recipient.userId;
              const href = buildProfileHref({ userId: recipient.userId, userKey: recipient.userId });
              return (
                <li key={recipient.userId} className={styles.recipientItem}>
                  <div className={styles.recipientMeta}>
                    <Link href={href ?? "#"} className={styles.recipientName}>
                      {name}
                    </Link>
                    <span className={styles.recipientStatus}>{recipient.status.replace(/_/g, " ")}</span>
                  </div>
                  <div className={styles.recipientActions}>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => onOpenConversation(recipient.userId, recipient.conversationId, recipient.name)}
                    >
                      Open thread
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={styles.muted}>No recipients are attached to this task.</p>
        )}
      </div>
    </section>
  );
}

function TaskDetailInner() {
  const params = useParams<{ taskId: string }>();
  const router = useRouter();
  const { openSession } = useChatContext();
  const { tasks, loading, error, refresh } = useAssistantTasks({ includeCompleted: true, pollIntervalMs: 12000 });

  const task = React.useMemo(
    () => tasks?.find((entry) => entry.id === params.taskId),
    [tasks, params.taskId],
  );

  const handleOpenConversation = React.useCallback(
    async (userId: string, conversationId?: string | null, name?: string | null) => {
      // Prefer an existing conversation id if available.
      if (conversationId) {
        openSession(conversationId);
        router.push("/friends?tab=Chats");
        return;
      }
      await requestChatStart(
        {
          userId,
          name: name ?? userId,
          avatar: null,
        },
        { activate: true },
      );
      router.push("/friends?tab=Chats");
    },
    [openSession, router],
  );

  const handleOpenAssistant = React.useCallback(async () => {
    await requestChatStart(
      {
        userId: ASSISTANT_USER_ID,
        name: ASSISTANT_DISPLAY_NAME,
        avatar: null,
      },
      { activate: true },
    );
    router.push("/friends?tab=Chats");
  }, [router]);

  return (
    <div className={styles.shell}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.kicker}>Capsules Assistant</p>
          <h2 className={styles.pageTitle}>Task thread</h2>
          <p className={styles.pageSubhead}>
            Each task has its own labeled thread. Open a recipient thread or hop into the assistant chat to adjust the plan.
          </p>
        </div>
        <button type="button" className={styles.secondaryButton} onClick={handleOpenAssistant}>
          Chat with assistant
        </button>
      </header>

      {loading && !task ? (
        <div className={styles.state}>Loading task…</div>
      ) : error ? (
        <div className={styles.stateError}>
          <p>{error}</p>
          <button type="button" className={styles.secondaryButton} onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      ) : !task ? (
        <div className={styles.state}>Task not found.</div>
      ) : (
        <TaskThreadCard task={task} onOpenConversation={handleOpenConversation} />
      )}
    </div>
  );
}

function TaskDetailProviders() {
  return (
    <ComposerProvider>
      <FriendsDataProvider>
        <PartyProvider>
          <ChatProvider>
            <Suspense fallback={<div className={styles.state}>Loading task…</div>}>
              <TaskDetailInner />
            </Suspense>
          </ChatProvider>
        </PartyProvider>
      </FriendsDataProvider>
      <AiComposerRoot />
    </ComposerProvider>
  );
}

export default function TaskDetailPage() {
  return <TaskDetailProviders />;
}
