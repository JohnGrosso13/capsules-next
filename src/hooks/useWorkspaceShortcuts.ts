"use client";

import * as React from "react";

type WorkspaceShortcutOptions = {
  onToggleContextRail?: () => void;
  onToggleChat?: () => void;
  onAcceptDiff?: () => void;
  onFocusNextBlock?: () => void;
  onFocusPreviousBlock?: () => void;
  disabled?: boolean;
};

const MAC = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);

export function useWorkspaceShortcuts(options: WorkspaceShortcutOptions): void {
  const {
    onToggleContextRail,
    onToggleChat,
    onAcceptDiff,
    onFocusNextBlock,
    onFocusPreviousBlock,
    disabled,
  } = options;

  React.useEffect(() => {
    if (disabled) return undefined;

    function handleKey(event: KeyboardEvent) {
      const isModifier = MAC ? event.metaKey : event.ctrlKey;
      if (isModifier && event.key === "\\") {
        event.preventDefault();
        onToggleContextRail?.();
        return;
      }
      if (isModifier && event.key === "Enter") {
        onAcceptDiff?.();
        return;
      }
      if (isModifier && event.key.toLowerCase() === "j") {
        event.preventDefault();
        onFocusNextBlock?.();
        return;
      }
      if (isModifier && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onFocusPreviousBlock?.();
        return;
      }
      if (isModifier && event.key.toLowerCase() === "l") {
        event.preventDefault();
        onToggleChat?.();
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [disabled, onToggleContextRail, onToggleChat, onAcceptDiff, onFocusNextBlock, onFocusPreviousBlock]);
}
