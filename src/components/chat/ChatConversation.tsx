"use client";

import * as React from "react";

import type { ChatConversationProps } from "./conversation/types";
import { ChatConversationView } from "./conversation/ChatConversationView";
import { useChatConversationController } from "./hooks/useChatConversationController";

export { type ChatConversationProps } from "./conversation/types";

export function ChatConversation(props: ChatConversationProps) {
  const controller = useChatConversationController(props);

  return (
    <ChatConversationView
      isAssistantConversation={controller.isAssistantConversation}
      headerProps={controller.headerProps}
      participants={controller.participants}
      messageListProps={controller.messageListProps}
      reactionPicker={controller.reactionPicker}
      composerProps={controller.composerProps}
      contextMenuProps={controller.contextMenuProps}
    />
  );
}
