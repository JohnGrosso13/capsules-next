import { describe, expect, it } from "vitest";

import {
  buildTournamentConfigPayload,
  buildTournamentMembersPayload,
  buildTournamentMetaPayload,
  createDefaultForm,
  createEmptyParticipant,
} from "@/components/create/tournaments/hooks/useTournamentWizard";

describe("tournament builder payloads", () => {
  it("emits tournament meta with format + match mode", () => {
    const form = {
      ...createDefaultForm(),
      format: "double_elimination" as const,
      matchMode: "capsule_vs_capsule" as const,
      maxEntrants: "32",
      bestOf: "5",
      start: "2025-01-01T00:00:00Z",
      timezone: "UTC",
      registrationType: "invite" as const,
    };

    const meta = buildTournamentMetaPayload(form);
    expect(meta).toMatchObject({
      variant: "tournament",
      format: "double_elimination",
      matchMode: "capsule_vs_capsule",
      formatLabel: "Double Elim",
      settings: {
        bestOf: "5",
        registrationType: "invite",
        maxEntrants: 32,
      },
    });
    expect(meta.schedule).toMatchObject({ start: form.start, timezone: "UTC" });
  });

  it("builds config payload with requirements and format metadata", () => {
    const form = {
      ...createDefaultForm(),
      format: "double_elimination" as const,
      bestOf: "3",
      maxEntrants: "8",
      registrationType: "open" as const,
      registrationRequirements: "Verified player\nNo smurfs\n",
      start: "2025-01-02T00:00:00Z",
      timezone: "PST",
    };

    const config = buildTournamentConfigPayload(form);
    expect(config.registration).toMatchObject({
      type: "open",
      maxTeams: 8,
      requirements: ["Verified player", "No smurfs"],
    });
    expect(config.metadata).toMatchObject({
      tournament: { format: "double_elimination", bestOf: "3" },
    });
    expect(config.schedule).toMatchObject({ kickoff: form.start, timezone: "PST" });
  });

  it("maps members including capsule metadata and seeds defaults", () => {
    const participants = [
      {
        ...createEmptyParticipant(0),
        displayName: "Capsule Alpha",
        entityType: "capsule" as const,
        capsuleId: "cap-123",
        seed: "",
        rating: "1500",
      },
      {
        ...createEmptyParticipant(1),
        displayName: "",
      },
    ];

    const payload = buildTournamentMembersPayload(participants);
    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({
      displayName: "Capsule Alpha",
      seed: 1,
      rating: 1500,
      metadata: { capsuleId: "cap-123", entityType: "capsule" },
    });
  });
});
