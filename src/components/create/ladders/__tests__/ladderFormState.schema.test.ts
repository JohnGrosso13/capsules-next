"use client";

import { describe, expect, it } from "vitest";

import {
  ladderBasicsFormSchema,
  ladderMembersCollectionSchema,
  ladderSectionFormSchema,
} from "../ladderFormState";

describe("ladder form schemas", () => {
  it("rejects ladder names shorter than three characters", () => {
    const result = ladderBasicsFormSchema.safeParse({
      name: "ab",
      summary: "",
      visibility: "capsule",
      publish: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("Name must include at least 3 characters");
    }
  });

  it("validates bullet limits for ladder sections", () => {
    const bullets = Array.from({ length: 9 }, (_, index) => `Item ${index + 1}`).join("\n");
    const result = ladderSectionFormSchema.safeParse({
      title: "Highlights",
      body: "",
      bulletsText: bullets,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("Limit bullet points to 8 entries");
    }
  });

  it("enforces roster member bounds", () => {
    const emptyRoster = ladderMembersCollectionSchema.safeParse([]);
    expect(emptyRoster.success).toBe(false);
    if (!emptyRoster.success) {
      expect(emptyRoster.error.issues[0]?.message).toContain("Add at least one participant");
    }

    const oversizedRoster = ladderMembersCollectionSchema.safeParse(
      Array.from({ length: 25 }, (_, index) => ({
        displayName: `Member ${index}`,
        handle: "",
        seed: String(index + 1),
        rating: "1200",
        wins: "0",
        losses: "0",
        draws: "0",
        streak: "0",
      })),
    );
    expect(oversizedRoster.success).toBe(false);
    if (!oversizedRoster.success) {
      expect(oversizedRoster.error.issues[0]?.message).toContain("Limit ladders to 24 participants");
    }
  });
});
