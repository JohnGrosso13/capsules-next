"use client";

import * as React from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";

import type { EmojiPickerProps } from "../EmojiPicker";
import { ChatComposer, type ChatComposerProps } from "../ChatComposer";
import { ConversationHeader } from "./ConversationHeader";
import { MessageContextMenu } from "./MessageContextMenu";
import { ConversationMessageList, type ConversationMessageListProps } from "./ConversationMessageList";
import { initialsFrom } from "./utils";
import type { ConversationParticipantsViewModel, ReactionPickerViewModel } from "./types";

import styles from "../chat.module.css";

const EmojiPicker = dynamic<EmojiPickerProps>(() => import("../EmojiPicker").then((mod) => mod.EmojiPicker), {
  ssr: false,
  loading: () => (
    <div className={styles.emojiPickerLoading} role="status" aria-live="polite">
      Loading emoji&hellip;
    </div>
  ),
});

type ChatConversationViewProps = {
  headerProps: React.ComponentProps<typeof ConversationHeader>;
  participants: ConversationParticipantsViewModel;
  messageListProps: ConversationMessageListProps;
  reactionPicker: ReactionPickerViewModel | null;
  composerProps: ChatComposerProps;
  contextMenuProps: React.ComponentProps<typeof MessageContextMenu>;
};

function ReactionPickerFloating({ anchorRect, anchorLabel, onSelect, onClose }: ReactionPickerViewModel) {
  const portalRef = React.useRef<HTMLElement | null>(null);
  const isBrowser = typeof document !== "undefined" && typeof window !== "undefined";

  React.useEffect(() => {
    if (!isBrowser) return;
    if (!portalRef.current) return;
    document.body.appendChild(portalRef.current);
    return () => {
      portalRef.current?.remove();
    };
  }, [isBrowser]);

  if (!isBrowser) {
    return null;
  }

  if (!portalRef.current) {
    portalRef.current = document.createElement("div");
  }

  const node = portalRef.current;
  if (!node) return null;

  if (!anchorRect) return null;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const estimatedWidth = Math.min(320, viewportWidth - 24);
  const halfWidth = estimatedWidth / 2;
  let centerX = anchorRect.left + anchorRect.width / 2;
  centerX = Math.max(halfWidth + 12, Math.min(viewportWidth - halfWidth - 12, centerX));
  const estimatedHeight = 320;
  const openAbove = anchorRect.top >= estimatedHeight + 24 || anchorRect.top > viewportHeight / 2;
  const top = openAbove ? anchorRect.top : anchorRect.bottom;
  const transform = openAbove ? "translate(-50%, calc(-100% - 12px))" : "translate(-50%, 12px)";

  return createPortal(
    <div
      className={styles.reactionPickerFloating}
      style={{ top, left: centerX, transform }}
      data-role="reaction-picker"
    >
      <div className={styles.messageReactionPicker} data-role="reaction-picker">
        <EmojiPicker onSelect={onSelect} onClose={onClose} anchorLabel={anchorLabel ?? ""} />
      </div>
    </div>,
    node,
  );
}

function ConversationParticipants({ participants, onInviteParticipants }: ConversationParticipantsViewModel) {
  if (!participants.length) return null;
  return (
    <div className={styles.conversationParticipants}>
      {participants.map((participant) => (
        <button
          key={participant.id}
          type="button"
          className={styles.conversationParticipant}
          title={participant.name}
          onClick={() => onInviteParticipants?.()}
          disabled={!onInviteParticipants}
          aria-disabled={!onInviteParticipants}
          aria-label={participant.name ? `View ${participant.name}` : "View participant"}
        >
          {participant.avatar ? (
            <Image
              src={participant.avatar}
              alt=""
              width={28}
              height={28}
              className={styles.conversationParticipantAvatar}
              sizes="28px"
            />
          ) : (
            <span className={styles.conversationParticipantInitials}>
              {initialsFrom(participant.name ?? "")}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function ChatConversationView({
  headerProps,
  participants,
  messageListProps,
  reactionPicker,
  composerProps,
  contextMenuProps,
}: ChatConversationViewProps) {
  return (
    <div className={styles.conversation}>
      <ConversationHeader {...headerProps} />
      {messageListProps.session.type === "group" ? (
        <ConversationParticipants {...participants} />
      ) : null}
      <ConversationMessageList {...messageListProps} />
      {reactionPicker?.targetId && reactionPicker.anchorRect ? (
        <ReactionPickerFloating {...reactionPicker} />
      ) : null}
      <ChatComposer {...composerProps} />
      <MessageContextMenu {...contextMenuProps} />
    </div>
  );
}
