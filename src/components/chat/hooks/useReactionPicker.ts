import * as React from "react";

import type { ReactionPickerViewModel } from "../conversation/types";

type UseReactionPickerOptions = {
  sessionId: string;
  messagesRef: React.RefObject<HTMLDivElement | null>;
  closeContextMenu: () => void;
  onToggleReaction?: (conversationId: string, messageId: string, emoji: string) => Promise<void>;
};

export function useReactionPicker({
  sessionId,
  messagesRef,
  closeContextMenu,
  onToggleReaction,
}: UseReactionPickerOptions) {
  const [reactionTargetId, setReactionTargetId] = React.useState<string | null>(null);
  const [reactionAnchorEl, setReactionAnchorEl] = React.useState<HTMLElement | null>(null);
  const [reactionAnchorRect, setReactionAnchorRect] = React.useState<DOMRect | null>(null);
  const [reactionAnchorLabel, setReactionAnchorLabel] = React.useState<string | null>(null);
  const reactionLongPressTimerRef = React.useRef<number | null>(null);
  const reactionLongPressTriggeredRef = React.useRef(false);

  const clearReactionLongPress = React.useCallback(() => {
    if (reactionLongPressTimerRef.current !== null) {
      if (typeof window !== "undefined") {
        window.clearTimeout(reactionLongPressTimerRef.current);
      }
      reactionLongPressTimerRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    return () => {
      clearReactionLongPress();
    };
  }, [clearReactionLongPress]);

  const closeReactionPicker = React.useCallback(() => {
    setReactionTargetId(null);
    setReactionAnchorEl(null);
    setReactionAnchorRect(null);
    setReactionAnchorLabel(null);
    reactionLongPressTriggeredRef.current = false;
    clearReactionLongPress();
  }, [clearReactionLongPress]);

  React.useEffect(() => {
    closeReactionPicker();
  }, [closeReactionPicker, sessionId]);

  React.useEffect(() => {
    if (!reactionTargetId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeReactionPicker();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeReactionPicker, reactionTargetId]);

  React.useEffect(() => {
    if (!reactionTargetId) return;
    const onPointerDown = (event: MouseEvent) => {
      const el = event.target as HTMLElement | null;
      if (!el) return;
      if (el.closest('[data-role="reaction-picker"]')) return;
      if (el.closest('[data-role="reaction-button"]')) return;
      closeReactionPicker();
    };
    window.addEventListener("mousedown", onPointerDown, true);
    return () => {
      window.removeEventListener("mousedown", onPointerDown, true);
    };
  }, [closeReactionPicker, reactionTargetId]);

  React.useEffect(() => {
    if (!reactionAnchorEl) {
      setReactionAnchorRect(null);
      return;
    }
    const update = () => {
      setReactionAnchorRect(reactionAnchorEl.getBoundingClientRect());
    };
    update();
    const scrollContainer = messagesRef.current;
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, { passive: true });
    scrollContainer?.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
      scrollContainer?.removeEventListener("scroll", update);
    };
  }, [messagesRef, reactionAnchorEl]);

  const handleToggleReaction = React.useCallback(
    (messageId: string, emoji: string) => {
      if (!onToggleReaction) return;
      void onToggleReaction(sessionId, messageId, emoji).catch((error) => {
        console.error("chat reaction toggle failed", error);
      });
    },
    [onToggleReaction, sessionId],
  );

  const handleReactionPickerToggle = React.useCallback(
    (messageId: string, anchor: HTMLElement | null, label: string) => {
      closeContextMenu();
      if (reactionTargetId === messageId) {
        closeReactionPicker();
        return;
      }
      setReactionTargetId(messageId);
      setReactionAnchorEl(anchor ?? null);
      setReactionAnchorLabel(label);
      if (anchor) {
        setReactionAnchorRect(anchor.getBoundingClientRect());
      } else {
        setReactionAnchorRect(null);
      }
    },
    [closeContextMenu, closeReactionPicker, reactionTargetId],
  );

  const handleReactionAddClick = React.useCallback(
    (messageId: string, anchor: HTMLButtonElement, label: string) => {
      if (reactionLongPressTriggeredRef.current) {
        reactionLongPressTriggeredRef.current = false;
        return;
      }
      handleReactionPickerToggle(messageId, anchor, label);
    },
    [handleReactionPickerToggle],
  );

  const handleReactionAddPointerDown = React.useCallback(
    (messageId: string, label: string, event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      reactionLongPressTriggeredRef.current = false;
      clearReactionLongPress();
      if (typeof window === "undefined") return;
      const anchor = event.currentTarget;
      reactionLongPressTimerRef.current = window.setTimeout(() => {
        reactionLongPressTimerRef.current = null;
        reactionLongPressTriggeredRef.current = true;
        handleReactionPickerToggle(messageId, anchor, label);
      }, 450);
    },
    [clearReactionLongPress, handleReactionPickerToggle],
  );

  const handleReactionAddPointerComplete = React.useCallback(() => {
    clearReactionLongPress();
  }, [clearReactionLongPress]);

  const handleReactionAddContextMenu = React.useCallback(
    (messageId: string, label: string, event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      reactionLongPressTriggeredRef.current = true;
      handleReactionPickerToggle(messageId, event.currentTarget, label);
    },
    [handleReactionPickerToggle],
  );

  const handleReactionSelect = React.useCallback(
    (emoji: string) => {
      if (!reactionTargetId) return;
      handleToggleReaction(reactionTargetId, emoji);
      closeReactionPicker();
    },
    [closeReactionPicker, handleToggleReaction, reactionTargetId],
  );

  const reactionPicker: ReactionPickerViewModel | null = reactionTargetId
    ? {
        targetId: reactionTargetId,
        anchorRect: reactionAnchorRect,
        anchorLabel: reactionAnchorLabel,
        onSelect: handleReactionSelect,
        onClose: closeReactionPicker,
      }
    : null;

  const reactionState = {
    isEnabled: Boolean(onToggleReaction),
    targetId: reactionTargetId,
    onToggleReaction: onToggleReaction ? handleToggleReaction : undefined,
    onAddClick: onToggleReaction ? handleReactionAddClick : undefined,
    onAddPointerDown: onToggleReaction ? handleReactionAddPointerDown : undefined,
    onAddPointerComplete: onToggleReaction ? handleReactionAddPointerComplete : undefined,
    onAddContextMenu: onToggleReaction ? handleReactionAddContextMenu : undefined,
  };

  return {
    reactionState,
    reactionPicker,
  };
}
