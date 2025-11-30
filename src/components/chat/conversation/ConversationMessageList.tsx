"use client";

import * as React from "react";
import Image from "next/image";
import { Paperclip, Smiley } from "@phosphor-icons/react/dist/ssr";

import type { ChatMessage, ChatParticipant, ChatSession } from "@/components/providers/ChatProvider";
import Link from "next/link";
import { ASSISTANT_USER_ID } from "@/shared/assistant/constants";

import { chatCopy } from "../copy";
import { formatAttachmentSize } from "../utils";
import {
  typingDisplayName,
  isContinuationOf,
  buildMessageKey,
  formatMessageTime,
  initialsFrom,
} from "./utils";
import type { MessageContextMenuState, MessageIdentityResolver } from "./types";
import {
  DEFAULT_ATTACHMENT_UI_STATE,
  type AttachmentUiState,
  type MessageAttachmentEntry,
  buildAttachmentStateKey,
} from "./attachments";

import styles from "../chat.module.css";

type AttachmentStateProps = {
  items: Record<string, AttachmentUiState>;
  onOpen: (message: ChatMessage, attachment: MessageAttachmentEntry) => void;
  onPreviewLoad: (stateKey: string) => void;
  onPreviewError: (stateKey: string) => void;
  onPreviewRetry: (stateKey: string) => void;
  onDownload: (message: ChatMessage, attachment: MessageAttachmentEntry, stateKey: string) => void;
  onDelete: (message: ChatMessage, attachment: MessageAttachmentEntry, stateKey: string) => void;
  canDeleteAttachments: boolean;
};

type ReactionStateProps = {
  isEnabled: boolean;
  targetId: string | null;
  onToggleReaction?: ((messageId: string, emoji: string) => void) | undefined;
  onAddClick?: ((messageId: string, anchor: HTMLButtonElement, label: string) => void) | undefined;
  onAddPointerDown?: ((
    messageId: string,
    label: string,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => void) | undefined;
  onAddPointerComplete?: (() => void) | undefined;
  onAddContextMenu?: ((
    messageId: string,
    label: string,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => void) | undefined;
};

type MessageMenuHandlers = {
  onContextMenu: (
    event: React.MouseEvent<HTMLDivElement>,
    message: ChatMessage,
    messageKey: string,
    messageIndex: number,
    isSelf: boolean,
  ) => void;
  onKeyDown: (
    event: React.KeyboardEvent<HTMLDivElement>,
    message: ChatMessage,
    messageKey: string,
    messageIndex: number,
    isSelf: boolean,
  ) => void;
};

type TypingStateProps = {
  participants: ChatParticipant[];
  typingText: string;
  primaryParticipant: ChatParticipant | null;
  remainderCount: number;
};

export type ConversationMessageListProps = {
  session: ChatSession;
  isAssistantConversation?: boolean;
  messagesRef: React.RefObject<HTMLDivElement | null>;
  contextMenu: MessageContextMenuState | null;
  identity: MessageIdentityResolver;
  attachmentState: AttachmentStateProps;
  reactionState: ReactionStateProps;
  messageMenuHandlers: MessageMenuHandlers;
  typingState: TypingStateProps;
};

function renderStatus(message: ChatMessage): React.ReactNode {
  if (message.status === "failed") {
    return (
      <span className={`${styles.messageStatus} ${styles.messageStatusFailed}`.trim()}>
        Failed to send
      </span>
    );
  }
  if (message.status === "pending") {
    return <span className={styles.messageStatus}>Sending...</span>;
  }
  return null;
}

export function ConversationMessageList({
  session,
  isAssistantConversation,
  messagesRef,
  contextMenu,
  identity,
  attachmentState,
  reactionState,
  messageMenuHandlers,
  typingState,
}: ConversationMessageListProps) {
  const { selfIdentifiers, participantMap, selfAvatar, selfName } = identity;
  const { items, canDeleteAttachments } = attachmentState;
  const { targetId } = reactionState;
  const showTyping =
    typingState.participants.length > 0 && typingState.typingText.trim().length > 0;

  return (
    <div ref={messagesRef} className={styles.messageList}>
      {session.messages.map((message, index) => {
        const messageKey = buildMessageKey(message, index);
        const previous = index > 0 ? session.messages[index - 1] : null;
        const isSelf = message.authorId ? selfIdentifiers.has(message.authorId) : false;
        const author = message.authorId ? participantMap.get(message.authorId) : null;
        const avatar = isSelf ? selfAvatar : author?.avatar ?? null;
        const displayName = isSelf ? selfName : author?.name ?? "Member";
        const statusNode = renderStatus(message);
        const grouped = isContinuationOf(previous, message);
        const showAvatar = !grouped;
        const showHeader = !grouped;
        const messageTimestamp = formatMessageTime(message.sentAt);
        const reactions = Array.isArray(message.reactions) ? message.reactions : [];
        const hasReactions = reactions.length > 0;
        const isPickerOpen = targetId === message.id;
        const showReactions = hasReactions || isPickerOpen;
        const attachments = Array.isArray(message.attachments) ? message.attachments : [];
        const hasAttachments = attachments.length > 0;
        const showBody = Boolean(message.body);
        const taskId =
          typeof message.taskId === "string" && message.taskId.trim().length
            ? message.taskId.trim()
            : "";
        const taskTitle =
          typeof message.taskTitle === "string" && message.taskTitle.trim().length
            ? message.taskTitle.trim()
            : null;
        const showTaskBadge = Boolean(taskId);
        const taskHref = showTaskBadge ? `/assistant/tasks/${encodeURIComponent(taskId)}` : null;
        const taskLabel = taskTitle || taskId;
        const taskLabelDisplay =
          taskLabel.length > 60 ? `${taskLabel.slice(0, 57)}...` : taskLabel;
        const showTaskHint =
          !showTaskBadge && isAssistantConversation && message.authorId === ASSISTANT_USER_ID;
        const itemClassName = `${styles.messageItem} ${
          isSelf ? styles.messageItemSelf : styles.messageItemOther
        } ${grouped ? styles.messageItemGrouped : ""}`.trim();
        const avatarClassName = `${styles.messageAvatar} ${
          showAvatar ? "" : styles.messageAvatarHidden
        }`.trim();
        const reactionClassName = `${styles.messageReactions} ${
          hasReactions || isPickerOpen ? styles.messageReactionsVisible : ""
        }`.trim();
        const reactionsNode = showReactions ? (
          <div className={reactionClassName}>
            {reactions.map((reaction, reactionIndex) => {
              const maxNames = 3;
              const shown = (Array.isArray(reaction.users) ? reaction.users : []).slice(
                0,
                maxNames,
              );
              const nameList = shown
                .map((u) => (u?.name || u?.id || "").trim() || "Member")
                .join(", " );
              const remainder = Math.max(0, reaction.count - shown.length);
              const tooltip =
                nameList.length > 0
                  ? `${reaction.emoji} by ${nameList}${
                      remainder > 0 ? ` and ${remainder} more` : ""
                    }`
                  : `${reaction.emoji} x${reaction.count}`;

              return (
                <button
                  key={`${messageKey}-reaction-${reactionIndex}`}
                  type="button"
                  className={`${styles.messageReaction} ${
                    reaction.selfReacted ? styles.messageReactionActive : ""
                  }`.trim()}
                  onClick={() => reactionState.onToggleReaction?.(message.id, reaction.emoji)}
                  disabled={!reactionState.isEnabled}
                  aria-pressed={reaction.selfReacted}
                  aria-label={`${reaction.emoji} reaction from ${reaction.count} ${
                    reaction.count === 1 ? "person" : "people"
                  }`}
                  title={tooltip}
                >
                  <span className={styles.messageReactionEmoji}>{reaction.emoji}</span>
                  <span className={styles.messageReactionCount}>{reaction.count}</span>
                </button>
              );
            })}
          </div>
        ) : null;
        const addReactionButton =
          reactionState.isEnabled && reactionState.onAddClick
            ? (
                <div className={styles.messageReactionAdd} data-role="reaction-add">
                  <button
                    type="button"
                    className={styles.messageReactionAddButton}
                    onClick={(event) =>
                      reactionState.onAddClick?.(message.id, event.currentTarget, displayName)
                    }
                    onPointerDown={(event) =>
                      reactionState.onAddPointerDown?.(message.id, displayName, event)
                    }
                    onPointerUp={reactionState.onAddPointerComplete}
                    onPointerLeave={reactionState.onAddPointerComplete}
                    onPointerCancel={reactionState.onAddPointerComplete}
                    onContextMenu={(event) =>
                      reactionState.onAddContextMenu?.(message.id, displayName, event)
                    }
                    aria-expanded={isPickerOpen}
                    aria-label="Add reaction"
                    data-role="reaction-button"
                  >
                    <Smiley size={16} weight="duotone" />
                  </button>
                </div>
              )
            : null;
        const inlineReactions = showBody ? reactionsNode : null;
        const trailingReactions = !showBody ? reactionsNode : null;
        const messageTitle = showHeader ? undefined : messageTimestamp || undefined;

        return (
          <div key={messageKey} className={itemClassName}>
            <span className={avatarClassName} aria-hidden>
              {showAvatar ? (
                avatar ? (
                  <Image
                    src={avatar}
                    alt=""
                    width={36}
                    height={36}
                    className={styles.messageAvatarImage}
                    sizes="36px"
                  />
                ) : (
                  <span className={styles.messageAvatarFallback}>{initialsFrom(displayName)}</span>
                )
              ) : null}
            </span>
            <div
              className={styles.messageBubbleGroup}
              tabIndex={0}
              data-message-id={
                message.id && message.id.trim().length > 0 ? message.id.trim() : messageKey
              }
              data-menu-open={contextMenu?.messageKey === messageKey ? "true" : undefined}
              onContextMenu={(event) =>
                messageMenuHandlers.onContextMenu(event, message, messageKey, index, isSelf)
              }
              onKeyDown={(event) =>
                messageMenuHandlers.onKeyDown(event, message, messageKey, index, isSelf)
              }
              data-reaction-open={isPickerOpen ? "true" : undefined}
            >
              {showHeader ? (
                <div className={styles.messageHeader}>
                  <span className={styles.messageAuthor}>{displayName}</span>
                  <time className={styles.messageTimestamp} dateTime={message.sentAt}>
                    {messageTimestamp}
                  </time>
                  {showTaskBadge && taskHref ? (
                    <Link
                      href={taskHref}
                      className={styles.messageTaskBadge}
                      title="Open task thread"
                    >
                      Task: {taskLabelDisplay}
                    </Link>
                  ) : showTaskHint ? (
                    <Link
                      href="/assistant/tasks"
                      className={`${styles.messageTaskBadge} ${styles.messageTaskBadgeMuted}`.trim()}
                      title="Assistant messages here are not tagged to a task"
                    >
                      No task tag
                    </Link>
                  ) : null}
                </div>
              ) : null}
              {showBody ? (
                <div
                  className={`${styles.messageBubble} ${isSelf ? styles.messageBubbleSelf : ""}`.trim()}
                  title={messageTitle}
                >
                  {message.body}
                  {inlineReactions}
                </div>
              ) : null}
              {hasAttachments ? (
                <div className={styles.messageAttachments} role="list">
                  {attachments.map((attachmentEntry, attachmentIndex) => {
                    const attachmentKey = `${messageKey}-attachment-${attachmentIndex}`;
                    const isImage =
                      typeof attachmentEntry.mimeType === "string" &&
                      attachmentEntry.mimeType.toLowerCase().startsWith("image/");
                    const href = attachmentEntry.url;
                    const basePreviewSrc =
                      (typeof attachmentEntry.thumbnailUrl === "string" &&
                        attachmentEntry.thumbnailUrl.trim().length
                        ? attachmentEntry.thumbnailUrl.trim()
                        : null) || href;
                    const stateKey = buildAttachmentStateKey(message, attachmentEntry, attachmentIndex);
                    const uiState = items[stateKey] ?? DEFAULT_ATTACHMENT_UI_STATE;
                    const previewSrc =
                      basePreviewSrc && uiState.previewNonce > 0
                        ? `${basePreviewSrc}${basePreviewSrc.includes("?") ? "&" : "?"}retry=${uiState.previewNonce}`
                        : basePreviewSrc;

                    if (isImage && href) {
                      return (
                        <div key={attachmentKey} className={styles.messageImageAttachment} role="listitem">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={previewSrc || href}
                            alt={attachmentEntry.name || "Generated image"}
                            className={styles.messageImageAttachmentMedia}
                            loading="lazy"
                            onLoad={() => attachmentState.onPreviewLoad(stateKey)}
                            onError={() => attachmentState.onPreviewError(stateKey)}
                          />
                          {attachmentEntry.name ? (
                            <div className={styles.messageImageAttachmentCaption}>
                              {attachmentEntry.name}
                            </div>
                          ) : null}
                        </div>
                      );
                    }

                    const sizeLabel = formatAttachmentSize(attachmentEntry.size);
                    const downloadDisabled = uiState.downloading || uiState.deleting || !href;
                    const deleteDisabled = uiState.deleting;
                    const showDelete =
                      canDeleteAttachments &&
                      isSelf &&
                      message.status !== "pending" &&
                      typeof attachmentEntry.id === "string" &&
                      attachmentEntry.id.trim().length > 0;
                    const downloadLabel = uiState.downloading
                      ? chatCopy.attachments.downloading
                      : uiState.downloadError
                        ? chatCopy.attachments.retry
                        : chatCopy.attachments.download;
                    const deleteLabel = uiState.deleting
                      ? chatCopy.attachments.deleting
                      : uiState.deleteError
                        ? chatCopy.attachments.retry
                        : chatCopy.attachments.delete;

                    return (
                      <div
                        key={attachmentKey}
                        className={styles.messageAttachment}
                        role="listitem"
                        data-preview-failed={uiState.previewFailed ? "true" : undefined}
                        data-downloading={uiState.downloading ? "true" : undefined}
                        data-deleting={uiState.deleting ? "true" : undefined}
                      >
                        <div className={styles.messageAttachmentPreview}>
                          <button
                            type="button"
                            className={styles.messageAttachmentPreviewButton}
                            onClick={() => attachmentState.onOpen(message, attachmentEntry)}
                            disabled={!href}
                            aria-label={`Open attachment ${attachmentEntry.name}`}
                          >
                            {isImage && previewSrc && !uiState.previewFailed ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={previewSrc}
                                alt={attachmentEntry.name}
                                className={styles.messageAttachmentPreviewImage}
                                loading="lazy"
                                onLoad={() => attachmentState.onPreviewLoad(stateKey)}
                                onError={() => attachmentState.onPreviewError(stateKey)}
                              />
                            ) : (
                              <span className={styles.messageAttachmentIcon} aria-hidden>
                                <Paperclip size={16} weight="bold" />
                              </span>
                            )}
                          </button>
                          {isImage && uiState.previewFailed ? (
                            <div className={styles.messageAttachmentPreviewFallback}>
                              <span>{chatCopy.attachments.previewFailed}</span>
                              <button
                                type="button"
                                className={styles.messageAttachmentRetry}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  attachmentState.onPreviewRetry(stateKey);
                                }}
                              >
                                {chatCopy.attachments.retry}
                              </button>
                            </div>
                          ) : null}
                        </div>
                        <div className={styles.messageAttachmentBody}>
                          <div className={styles.messageAttachmentTitleRow}>
                            <span className={styles.messageAttachmentName}>
                              {attachmentEntry.name}
                            </span>
                            <span className={styles.messageAttachmentMeta}>{sizeLabel}</span>
                          </div>
                          {uiState.downloadError ? (
                            <div className={styles.messageAttachmentError} role="alert">
                              {uiState.downloadError}
                            </div>
                          ) : null}
                          {uiState.deleteError ? (
                            <div className={styles.messageAttachmentError} role="alert">
                              {uiState.deleteError}
                            </div>
                          ) : null}
                          <div className={styles.messageAttachmentActions}>
                            <button
                              type="button"
                              className={styles.messageAttachmentAction}
                              onClick={() =>
                                attachmentState.onDownload(message, attachmentEntry, stateKey)
                              }
                              disabled={downloadDisabled}
                            >
                              {downloadLabel}
                            </button>
                            {showDelete ? (
                              <button
                                type="button"
                                className={`${styles.messageAttachmentAction} ${styles.messageAttachmentDanger}`.trim()}
                                onClick={() =>
                                  attachmentState.onDelete(message, attachmentEntry, stateKey)
                                }
                                disabled={deleteDisabled}
                              >
                                {deleteLabel}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {trailingReactions}
              {addReactionButton}
              {statusNode ? <div className={styles.messageMeta}>{statusNode}</div> : null}
            </div>
          </div>
        );
      })}
      {showTyping ? (
        <div className={styles.typingIndicatorRow}>
          {typingState.primaryParticipant ? (
            <span className={styles.typingIndicatorAvatar} aria-hidden>
              {typingState.primaryParticipant.avatar ? (
                <Image
                  src={typingState.primaryParticipant.avatar}
                  alt=""
                  width={36}
                  height={36}
                  className={styles.typingIndicatorAvatarImage}
                  sizes="36px"
                />
              ) : (
                <span className={styles.typingIndicatorInitials}>
                  {initialsFrom(typingDisplayName(typingState.primaryParticipant))}
                </span>
              )}
              {typingState.remainderCount > 0 ? (
                <span className={styles.typingIndicatorBadge}>+{typingState.remainderCount}</span>
              ) : null}
            </span>
          ) : null}
          <div className={styles.typingIndicatorBubble} role="status" aria-live="polite">
            <span className={styles.typingIndicatorText}>{typingState.typingText}</span>
            <span className={styles.typingIndicatorDots} aria-hidden>
              <span />
              <span />
              <span />
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

