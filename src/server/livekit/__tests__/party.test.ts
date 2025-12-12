import { describe, expect, it } from "vitest";

import { buildPartyMetadata } from "@/server/livekit/party";

describe("buildPartyMetadata", () => {
  it("does not enable the assistant by default", () => {
    const metadata = buildPartyMetadata({
      partyId: "party123",
      ownerId: "owner123",
      ownerDisplayName: "Owner",
      topic: null,
      privacy: "invite-only",
    });

    expect(metadata.assistant?.desired).toBe(false);
  });
});
