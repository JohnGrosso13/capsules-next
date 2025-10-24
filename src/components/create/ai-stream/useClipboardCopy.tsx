"use client";

import * as React from "react";

type ClipboardCopyOptions = {
  timeout?: number;
};

export function useClipboardCopy(options?: ClipboardCopyOptions) {
  const { timeout = 2000 } = options ?? {};
  const [copiedField, setCopiedField] = React.useState<string | null>(null);
  const timerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const copy = React.useCallback(
    (label: string, value: string | null | undefined) => {
      if (!value) return;
      if (typeof navigator === "undefined" || !navigator.clipboard) {
        console.warn("Clipboard API not available");
        return;
      }
      navigator.clipboard
        .writeText(value)
        .then(() => {
          setCopiedField(label);
          if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
          }
          timerRef.current = window.setTimeout(() => {
            setCopiedField(null);
            timerRef.current = null;
          }, timeout);
        })
        .catch((error) => {
          console.warn("Failed to copy", error);
        });
    },
    [timeout],
  );

  return { copiedField, copy };
}
