"use client";

import * as React from "react";

export function useAttachmentViewer(options: { open: boolean; onClose: () => void }) {
  const { open, onClose } = options;
  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);
}

export function useResponsiveRail(options: { open: boolean; onClose: () => void }) {
  const { open, onClose } = options;

  React.useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 900 && open) {
        onClose();
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [onClose, open]);
}
