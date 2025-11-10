"use client";

import Image from "next/image";
import { ArrowLeft, Trash, UserPlus, NotePencil } from "@phosphor-icons/react/dist/ssr";

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
  presence,
  remoteParticipants,
  onBack,
  onRenameGroup,
  onInviteParticipants,
  onDelete,
}: ConversationHeaderProps) {
  return (
    <div className={styles.conversationHeader}>
      <div className={styles.conversationHeaderLeft}>
        {onBack ? (
          <button
            type="button"
            className={styles.conversationAction}
            onClick={onBack}
            aria-label="Back to chats"
          >
            <ArrowLeft size={18} weight="bold" />
          </button>
        ) : null}
        <span className={styles.conversationAvatar} aria-hidden>
          {renderConversationAvatar(session, remoteParticipants, title)}
        </span>
        <div className={styles.conversationTitleBlock}>
          <span className={styles.conversationTitle}>{title}</span>
          {presence ? <span className={styles.conversationSubtitle}>{presence}</span> : null}
        </div>
      </div>
      <div className={styles.conversationHeaderActions}>
        {session.type === "group" && onRenameGroup ? (
          <button
            type="button"
            className={styles.conversationAction}
            onClick={onRenameGroup}
            aria-label="Rename group"
          >
            <NotePencil size={18} weight="duotone" />
          </button>
        ) : null}
        {session.type === "group" && onInviteParticipants ? (
          <button
            type="button"
            className={styles.conversationAction}
            onClick={onInviteParticipants}
            aria-label="Add participants"
          >
            <UserPlus size={18} weight="bold" />
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            className={`${styles.conversationAction} ${styles.conversationActionDanger}`.trim()}
            onClick={onDelete}
            aria-label="Delete chat"
          >
            <Trash size={18} weight="duotone" />
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
