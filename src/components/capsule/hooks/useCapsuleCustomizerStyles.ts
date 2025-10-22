"use client";

import * as React from "react";

import {
  CAPSULE_STYLE_CATEGORIES,
  getCapsuleStyleOptionsByCategory,
  getDefaultCapsuleStyleSelection,
  sanitizeCapsuleArtStyle,
  type CapsuleArtAssetType,
  type CapsuleStyleCategory,
  type CapsuleStyleOption,
  type CapsuleStyleSelection,
} from "@/shared/capsule-style";

export type CapsuleStyleState = {
  selection: CapsuleStyleSelection;
  optionsByCategory: Record<CapsuleStyleCategory, CapsuleStyleOption[]>;
  selectedOptions: Record<CapsuleStyleCategory, CapsuleStyleOption | null>;
  summary: string;
  instructions: string[];
  setSelection: (category: CapsuleStyleCategory, optionId: string) => void;
  resetSelection: () => void;
};

export function useCapsuleCustomizerStyles(mode: CapsuleArtAssetType): CapsuleStyleState {
  const optionsByCategory = React.useMemo(
    () => getCapsuleStyleOptionsByCategory(mode),
    [mode],
  );
  const defaultSelection = React.useMemo(
    () => getDefaultCapsuleStyleSelection(mode),
    [mode],
  );

  const [selection, setSelection] = React.useState<CapsuleStyleSelection>(defaultSelection);

  React.useEffect(() => {
    setSelection(getDefaultCapsuleStyleSelection(mode));
  }, [mode]);

  const setSelectionForCategory = React.useCallback(
    (category: CapsuleStyleCategory, optionId: string) => {
      setSelection((previous) =>
        sanitizeCapsuleArtStyle(mode, {
          ...previous,
          [category]: optionId,
        }),
      );
    },
    [mode],
  );

  const resetSelection = React.useCallback(() => {
    setSelection(getDefaultCapsuleStyleSelection(mode));
  }, [mode]);

  const selectedOptions = React.useMemo(() => {
    const mapped: Record<CapsuleStyleCategory, CapsuleStyleOption | null> = {
      palette: null,
      lighting: null,
      medium: null,
      mood: null,
    };
    for (const category of CAPSULE_STYLE_CATEGORIES) {
      const selected = selection[category];
      mapped[category] =
        selected != null
          ? optionsByCategory[category].find((option) => option.id === selected) ?? null
          : null;
    }
    return mapped;
  }, [optionsByCategory, selection]);

  const instructions = React.useMemo(() => {
    const lines: string[] = [];
    for (const category of CAPSULE_STYLE_CATEGORIES) {
      const option = selectedOptions[category];
      if (!option) continue;
      const trimmed = option.instruction.trim();
      if (trimmed.length) lines.push(trimmed);
    }
    return lines;
  }, [selectedOptions]);

  const summary = React.useMemo(() => {
    const parts: string[] = [];
    for (const category of CAPSULE_STYLE_CATEGORIES) {
      const option = selectedOptions[category];
      if (!option) continue;
      const label =
        category === "palette"
          ? "Palette"
          : category === "lighting"
            ? "Lighting"
            : category === "medium"
              ? "Medium"
              : "Mood";
      parts.push(`${label}: ${option.label}`);
    }
    return parts.join(" · ");
  }, [selectedOptions]);

  return {
    selection,
    optionsByCategory,
    selectedOptions,
    summary,
    instructions,
    setSelection: setSelectionForCategory,
    resetSelection,
  };
}
