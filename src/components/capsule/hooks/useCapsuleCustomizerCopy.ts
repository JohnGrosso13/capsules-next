"use client";

import * as React from "react";

import type { CapsuleCustomizerMode } from "./useCapsuleCustomizerState";

type CapsuleCopy = {
  assetLabel: "banner" | "store banner" | "tile" | "logo" | "avatar";
  previewAlt: string;
  headerTitle: string;
  headerSubtitle: string;
  prompterPlaceholder: string;
  aiWorkingMessage: string;
  assistantIntro: string;
  footerDefaultHint: string;
  stageAriaLabel: string;
  recentDescription: string;
};

const DEFAULT_COPY: CapsuleCopy = {
  assetLabel: "banner",
  previewAlt: "Preview of your Capsule banner",
  headerTitle: "Design your Capsule banner",
  headerSubtitle:
    "Chat with your assistant, pick from memories, or upload brand visuals to set your capsule banner.",
  prompterPlaceholder: "Describe your banner or a vibe to try...",
  aiWorkingMessage: "Generating your banner...",
  assistantIntro:
    "You're customizing your capsule. I'm a general AI, so ask anything—even off topic—and I'll help with visuals when you want.",
  footerDefaultHint: "",
  stageAriaLabel: "Capsule banner preview",
  recentDescription: "Quickly reuse what you or your assistant picked last.",
};

export function useCapsuleCustomizerCopy(
  mode: CapsuleCustomizerMode,
  _normalizedName: string,
): CapsuleCopy {
  return React.useMemo<CapsuleCopy>(() => {
    switch (mode) {
      case "storeBanner":
        return {
          assetLabel: "store banner",
          previewAlt: "Preview of your Capsule store banner",
          headerTitle: "Design your Capsule store banner",
          headerSubtitle:
            "Chat with your assistant, pick from memories, or upload visuals to set your storefront hero image.",
          prompterPlaceholder: "Describe your store hero or a vibe to try...",
          aiWorkingMessage: "Generating your store banner...",
          assistantIntro:
            "You're customizing your capsule. I'm a general AI, so ask anything—even off topic—and I'll help with visuals when you want.",
          footerDefaultHint: "",
          stageAriaLabel: "Capsule store banner preview",
          recentDescription: "Reuse the hero art you or your assistant used in your storefront recently.",
        };
      case "tile":
        return {
          assetLabel: "tile",
          previewAlt: "Preview of your Capsule promo tile",
          headerTitle: "Design your Capsule promo tile",
          headerSubtitle:
            "Chat with your assistant, pick from memories, or upload brand visuals to set your vertical tile.",
          prompterPlaceholder: "Describe your tile or a vibe to try...",
          aiWorkingMessage: "Generating your tile...",
          assistantIntro:
            "You're customizing your capsule. I'm a general AI, so ask anything—even off topic—and I'll help with visuals when you want.",
          footerDefaultHint: "",
          stageAriaLabel: "Capsule promo tile preview",
          recentDescription: "Quickly reuse the vertical art you or your assistant picked last.",
        };
      case "logo":
        return {
          assetLabel: "logo",
          previewAlt: "Preview of your Capsule logo",
          headerTitle: "Design your Capsule logo",
          headerSubtitle:
            "Upload a mark, pick a memory, or ask your assistant for a square logo that feels on brand everywhere it appears.",
          prompterPlaceholder: "Describe your logo idea or style...",
          aiWorkingMessage: "Sketching a logo...",
          assistantIntro:
            "You're customizing your capsule. I'm a general AI, so ask anything—even off topic—and I'll help with visuals when you want.",
          footerDefaultHint: "",
          stageAriaLabel: "Capsule logo preview",
          recentDescription: "Reuse logo artwork you or your assistant created recently.",
        };
      case "avatar":
        return {
          assetLabel: "avatar",
          previewAlt: "Preview of your profile avatar",
          headerTitle: "Design your profile avatar",
          headerSubtitle:
            "Upload a portrait, pick from memories, or ask your assistant for a circular avatar that looks great across the app.",
          prompterPlaceholder: "Describe your avatar idea or vibe...",
          aiWorkingMessage: "Creating your avatar...",
          assistantIntro:
            "You're customizing your capsule. I'm a general AI, so ask anything—even off topic—and I'll help with visuals when you want.",
          footerDefaultHint: "",
          stageAriaLabel: "Profile avatar preview",
          recentDescription: "Reuse avatar imagery you or your assistant created recently.",
        };
      default:
        return {
          ...DEFAULT_COPY,
          assistantIntro:
            "You're customizing your capsule. I'm a general AI, so ask anything—even off topic—and I'll help with visuals when you want.",
        };
    }
  }, [mode]);
}
