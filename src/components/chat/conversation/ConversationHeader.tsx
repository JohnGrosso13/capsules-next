"use client";

import * as React from "react";
import Image from "next/image";
import { ArrowLeft, UserPlus, NotePencil } from "@phosphor-icons/react/dist/ssr";

import type { ChatParticipant, ChatSession } from "@/components/providers/ChatProvider";
import { initialsFrom } from "./utils";
import styles from "../chat.module.css";

export type ConversationHeaderProps = {
  session: ChatSession;
  title: string;
  presence: string | null;
  remoteParticipants: ChatParticipant[];
  onBack?: (() => void) | undefined;
  onRenameGroup?: (() => void) | undefined;
  onInviteParticipants?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
};

export function ConversationHeader({
  session,
  title,
  presence: _presence,
  remoteParticipants,
  onBack,
  onRenameGroup,
  onInviteParticipants,
  onDelete: _onDelete,
}: ConversationHeaderProps) {
  React.useEffect(() => {
    if (!onBack) return;
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape" || ((event.metaKey || event.ctrlKey) && event.key === "[")) {
        onBack();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [onBack]);

  return (
    <div className={styles.conversationHeader}>
      <div className={styles.conversationHeaderMain}>
        {onBack ? (
          <button
            type="button"
            className={styles.conversationBackButton}
            onClick={onBack}
            aria-label="Back to chats"
            title="Back to chats"
          >
            <ArrowLeft size={16} weight="bold" />
            <span className={styles.conversationBackText}>Back</span>
          </button>
        ) : null}
        <div className={styles.conversationIdentity}>
          <span className={styles.conversationAvatar} aria-hidden>
            {renderConversationAvatar(session, remoteParticipants, title)}
          </span>
          <div className={styles.conversationTitleBlock}>
            <span className={styles.conversationTitle}>{title}</span>
          </div>
        </div>
      </div>
      <div className={styles.conversationHeaderActions}>
        {session.type === "group" && onRenameGroup ? (
          <button
            type="button"
            className={styles.conversationAction}
            onClick={onRenameGroup}
            aria-label="Rename group"
            title="Rename group"
          >
            <NotePencil size={18} weight="duotone" />
          </button>
        ) : null}
        {onInviteParticipants ? (
          <button
            type="button"
            className={styles.conversationAction}
            onClick={onInviteParticipants}
            aria-label={
              session.type === "group"
                ? "Add participants"
                : "Add people to this chat"
             }
             title={
               session.type === "group" ? "Add participants" : "Add people to this chat"
             }
           >
             <UserPlus size={18} weight="bold" />
           </button>
         ) : null}
      </div>
    </div>
  );
}

function renderConversationAvatar(
  session: ChatSession,
  remoteParticipants: ChatParticipant[],
  title: string,
) {
  if (session.avatar) {
    return (
      <Image
        src={session.avatar}
        alt=""
        width={44}
        height={44}
        className={styles.conversationAvatarImage}
        sizes="44px"
      />
    );
  }
  const visible = (remoteParticipants.length ? remoteParticipants : session.participants).slice(
    0,
    3,
  );
  if (session.type === "direct") {
    const primary = remoteParticipants[0] ?? session.participants[0];
    return (
      <span className={styles.conversationAvatarSingle} aria-hidden>
        {primary?.avatar ? (
          <Image
            src={primary.avatar}
            alt=""
            width={44}
            height={44}
            className={styles.conversationAvatarImage}
            sizes="44px"
          />
        ) : (
          <span className={styles.conversationAvatarFallback}>
            {initialsFrom(primary?.name ?? title)}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className={styles.conversationAvatarGroup} aria-hidden>
      {visible.map((participant, index) =>
        participant.avatar ? (
          <Image
            key={`${participant.id}-${index}`}
            src={participant.avatar}
            alt=""
            width={44}
            height={44}
            className={styles.conversationAvatarImage}
            sizes="44px"
          />
        ) : (
          <span key={`${participant.id}-${index}`} className={styles.conversationAvatarFallback}>
            {initialsFrom(participant.name)}
          </span>
        ),
      )}
      {session.participants.length > visible.length ? (
        <span
          className={`${styles.conversationAvatarFallback} ${styles.conversationAvatarOverflow}`.trim()}
        >
          +{session.participants.length - visible.length}
        </span>
      ) : null}
    </span>
  );
}
