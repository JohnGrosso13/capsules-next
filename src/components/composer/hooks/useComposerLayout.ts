"use client";

import * as React from "react";

import type {
  ComposerFormActions,
  ComposerLayoutState,
} from "./useComposerFormReducer";

type UseComposerLayoutParams = {
  layout: ComposerLayoutState;
  layoutActions: ComposerFormActions["layout"];
  mainRef: React.RefObject<HTMLDivElement | null>;
};

const MIN_RAIL_WIDTH = 200;
const MAX_RAIL_WIDTH = 520;
const MIN_BOTTOM_HEIGHT = 120;
const MAX_BOTTOM_HEIGHT = 420;

export function useComposerLayout({ layout, layoutActions, mainRef }: UseComposerLayoutParams) {
  React.useEffect(() => {
    const node = mainRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === node) {
          layoutActions.setMainHeight(Math.floor(entry.contentRect.height));
        }
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [layoutActions, mainRef]);

  React.useEffect(() => {
    const dragValue = layout.drag;
    if (!dragValue) return;
    const currentDrag = dragValue as NonNullable<typeof dragValue>;

    const clamp = (value: number, min: number, max: number) =>
      Math.min(max, Math.max(min, value));

    function handleMove(event: MouseEvent) {
      if (currentDrag.kind === "left") {
        const delta = event.clientX - currentDrag.startX;
        layoutActions.setLeftWidth(clamp(currentDrag.start + delta, MIN_RAIL_WIDTH, MAX_RAIL_WIDTH));
      } else if (currentDrag.kind === "right") {
        const delta = currentDrag.startX - event.clientX;
        layoutActions.setRightWidth(clamp(currentDrag.start + delta, MIN_RAIL_WIDTH, MAX_RAIL_WIDTH));
      } else {
        const delta = currentDrag.startY - event.clientY;
        layoutActions.setBottomHeight(
          clamp(currentDrag.start + delta, MIN_BOTTOM_HEIGHT, MAX_BOTTOM_HEIGHT),
        );
      }
    }

    function handleUp() {
      layoutActions.setDrag(null);
    }

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp, { once: true });
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [layout.drag, layoutActions]);
}
