import * as React from "react";

function dragEventHasFiles(event: React.DragEvent<HTMLElement>): boolean {
  const dataTransfer = event.dataTransfer;
  if (!dataTransfer) return false;
  if (dataTransfer.items && dataTransfer.items.length > 0) {
    return Array.from(dataTransfer.items).some((item) => item.kind === "file");
  }
  if (dataTransfer.files && dataTransfer.files.length > 0) return true;
  return Array.from(dataTransfer.types).includes("Files");
}

type Options = {
  onFile: (file: File | null | undefined) => Promise<void> | void;
  enabled?: boolean;
};

export function usePrompterDragAndDrop({ onFile, enabled = true }: Options) {
  const [isDraggingFile, setIsDraggingFile] = React.useState(false);
  const dragCounterRef = React.useRef(0);

  const resetDragState = React.useCallback(() => {
    dragCounterRef.current = 0;
    setIsDraggingFile(false);
  }, []);

  React.useEffect(() => {
    if (enabled) return;
    resetDragState();
  }, [enabled, resetDragState]);

  const handleDragEnter = React.useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (!enabled || !dragEventHasFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      const related = event.relatedTarget as Node | null;
      if (related && (event.currentTarget as Node).contains(related)) {
        return;
      }
      dragCounterRef.current += 1;
      if (dragCounterRef.current === 1) {
        setIsDraggingFile(true);
      }
    },
    [enabled],
  );

  const handleDragOver = React.useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (!enabled || !dragEventHasFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
    },
    [enabled],
  );

  const handleDragLeave = React.useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (!enabled || !dragEventHasFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      const related = event.relatedTarget as Node | null;
      if (related && (event.currentTarget as Node).contains(related)) {
        return;
      }
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
      if (dragCounterRef.current === 0) {
        setIsDraggingFile(false);
      }
    },
    [enabled],
  );

  const handleDrop = React.useCallback(
    async (event: React.DragEvent<HTMLElement>) => {
      if (!enabled || !dragEventHasFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      resetDragState();
      const dataTransfer = event.dataTransfer;
      if (!dataTransfer) return;

      let droppedFile: File | null = null;
      if (dataTransfer.items && dataTransfer.items.length > 0) {
        for (const item of Array.from(dataTransfer.items)) {
          if (item.kind === "file") {
            droppedFile = item.getAsFile();
            if (droppedFile) break;
          }
        }
      }

      if (!droppedFile && dataTransfer.files && dataTransfer.files.length > 0) {
        const file = dataTransfer.files.item(0);
        if (file) droppedFile = file;
      }

      if (droppedFile) {
        await onFile(droppedFile);
      }
    },
    [enabled, onFile, resetDragState],
  );

  React.useEffect(() => {
    if (!enabled || !isDraggingFile) return;
    if (typeof window === "undefined") return undefined;

    const handleWindowDragEnd = () => {
      resetDragState();
    };

    window.addEventListener("dragend", handleWindowDragEnd);
    window.addEventListener("drop", handleWindowDragEnd);

    return () => {
      window.removeEventListener("dragend", handleWindowDragEnd);
      window.removeEventListener("drop", handleWindowDragEnd);
    };
  }, [enabled, isDraggingFile, resetDragState]);

  return {
    isDraggingFile,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } as const;
}
