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
    "Chat with Capsule AI, pick from memories, or upload brand visuals to set your capsule banner.",
  prompterPlaceholder: "Describe your banner or a vibe to try...",
  aiWorkingMessage: "Let me work on a banner that matches that vibe...",
  assistantIntro:
    "Hi! I'm here to help you design a capsule banner for Your capsule. Describe the mood, colors, or imagery you'd like and I'll generate options.",
  footerDefaultHint: "Upload an image, pick a memory, or describe a new banner below.",
  stageAriaLabel: "Capsule banner preview",
  recentDescription: "Quickly reuse what you or Capsule AI picked last.",
};

export function useCapsuleCustomizerCopy(
  mode: CapsuleCustomizerMode,
  normalizedName: string,
): CapsuleCopy {
  return React.useMemo<CapsuleCopy>(() => {
    const safeName = normalizedName;

    switch (mode) {
      case "storeBanner":
        return {
          assetLabel: "store banner",
          previewAlt: "Preview of your Capsule store banner",
          headerTitle: "Design your Capsule store banner",
          headerSubtitle:
            "Chat with Capsule AI, pick from memories, or upload visuals to set your storefront hero image.",
          prompterPlaceholder: "Describe your store hero or a vibe to try...",
          aiWorkingMessage: "Let me work on a store banner that matches that vibe...",
          assistantIntro: `Hi! I'm here to help you design a capsule store banner for ${safeName}. Describe products, mood, or layout ideas and I'll generate options.`,
          footerDefaultHint: "Upload an image, pick a memory, or describe a new store banner below.",
          stageAriaLabel: "Capsule store banner preview",
          recentDescription: "Reuse the hero art you or Capsule AI used in your storefront recently.",
        };
      case "tile":
        return {
          assetLabel: "tile",
          previewAlt: "Preview of your Capsule promo tile",
          headerTitle: "Design your Capsule promo tile",
          headerSubtitle:
            "Chat with Capsule AI, pick from memories, or upload brand visuals to set your vertical tile.",
          prompterPlaceholder: "Describe your tile or a vibe to try...",
          aiWorkingMessage: "Let me work on a tile that matches that vibe...",
          assistantIntro: `Hi! I'm here to help you design a promo tile for ${safeName}. Describe the mood, colors, or imagery you'd like and I'll generate options.`,
          footerDefaultHint: "Upload an image, pick a memory, or describe a new tile below.",
          stageAriaLabel: "Capsule promo tile preview",
          recentDescription: "Quickly reuse the vertical art you or Capsule AI picked last.",
        };
      case "logo":
        return {
          assetLabel: "logo",
          previewAlt: "Preview of your Capsule logo",
          headerTitle: "Design your Capsule logo",
          headerSubtitle:
            "Upload a mark, pick a memory, or ask Capsule AI for a square logo that feels on brand everywhere it appears.",
          prompterPlaceholder: "Describe your logo idea or style...",
          aiWorkingMessage: "Let me sketch a logo that matches that vibe...",
          assistantIntro: `Hi! I'm here to help you craft a capsule logo for ${safeName}. Describe letters, shapes, colors, or mascots and I'll mock up options.`,
          footerDefaultHint: "Upload a mark, pick a memory, or describe a logo below.",
          stageAriaLabel: "Capsule logo preview",
          recentDescription: "Reuse logo artwork you or Capsule AI created recently.",
        };
      case "avatar":
        return {
          assetLabel: "avatar",
          previewAlt: "Preview of your profile avatar",
          headerTitle: "Design your profile avatar",
          headerSubtitle:
            "Upload a portrait, pick from memories, or ask Capsule AI for a circular avatar that looks great across the app.",
          prompterPlaceholder: "Describe your avatar idea or vibe...",
          aiWorkingMessage: "Let me create an avatar that fits that direction...",
          assistantIntro: `Hi! I'm here to help you craft a personal avatar for ${safeName}. Describe lighting, colors, or mood and I'll generate options.`,
          footerDefaultHint: "Upload a portrait, pick a memory, or describe a new avatar below.",
          stageAriaLabel: "Profile avatar preview",
          recentDescription: "Reuse avatar imagery you or Capsule AI created recently.",
        };
      default:
        return {
          ...DEFAULT_COPY,
          assistantIntro: `Hi! I'm here to help you design a capsule banner for ${safeName}. Describe the mood, colors, or imagery you'd like and I'll generate options.`,
        };
    }
  }, [mode, normalizedName]);
}
