import { describe, expect, test } from "vitest";

import {
  canonicalParticipantKey,
  mergeParticipants,
  normalizeLocalAttachments,
  normalizeParticipant,
  normalizeReactions,
  sanitizeIncomingAttachments,
  sanitizeMessageBody,
  sanitizeSessionDescriptor,
  sanitizeStoredAttachments,
  standardizeUserId,
} from "@/components/providers/chat-store/helpers";

describe("chat-store helpers", () => {
  test("standardizeUserId normalizes various formats", () => {
    expect(standardizeUserId(" user_ABC123 ")).toBe("user_abc123");
    expect(standardizeUserId("user-abc123")).toBe("user_abc123");
    expect(standardizeUserId("message from user:ABC-123")).toBe("user_abc-123");
    expect(standardizeUserId("no-user")).toBeNull();
  });

  test("normalizeParticipant resolves identifiers and trims fields", () => {
    const participant = normalizeParticipant({
      id: "User_One ",
      name: "  Taylor ",
      avatar: " https://cdn.example.com/avatar.png ",
    });
    expect(participant).toEqual({
      id: "user_one",
      name: "Taylor",
      avatar: "https://cdn.example.com/avatar.png",
    });
  });

  test("mergeParticipants de-duplicates by canonical id and preserves avatars", () => {
    const merged = mergeParticipants(
      [
        { id: "user_one", name: "Taylor", avatar: null },
        { id: "client:user_one", name: "Taylor Swift", avatar: "https://cdn.example.com/a.png" },
      ],
      [{ id: "user_two", name: "Alex", avatar: null }],
    );
    expect(merged).toEqual([
      {
        id: "user_one",
        name: "Taylor Swift",
        avatar: "https://cdn.example.com/a.png",
      },
      {
        id: "user_two",
        name: "Alex",
        avatar: null,
      },
    ]);
  });

  test("canonicalParticipantKey strips client prefixes", () => {
    expect(canonicalParticipantKey("client:user_one")).toBe("user_one");
    expect(canonicalParticipantKey("user_two")).toBe("user_two");
  });

  test("normalizeReactions sorts reactions and marks self participation", () => {
    const reactions = normalizeReactions(
      [
        {
          emoji: "\uD83D\uDC4D",
          users: [
            { id: "user_one", name: "Taylor" },
            { id: "user_two", name: "Alex" },
          ],
        },
        {
          emoji: "\u2728",
          users: [{ id: "user_two", name: "Alex" }],
        },
      ],
      (id) => id === "user_one",
    );
    expect(reactions).toEqual([
      {
        emoji: "\uD83D\uDC4D",
        count: 2,
        users: [
          { id: "user_two", name: "Alex", avatar: null },
          { id: "user_one", name: "Taylor", avatar: null },
        ],
        selfReacted: true,
      },
      {
        emoji: "\u2728",
        count: 1,
        users: [{ id: "user_two", name: "Alex", avatar: null }],
        selfReacted: false,
      },
    ]);
  });

  test("sanitizeIncomingAttachments deduplicates and trims metadata", () => {
    const attachments = sanitizeIncomingAttachments([
      {
        id: " file-1 ",
        name: " Photo.JPG ",
        mimeType: " image/jpeg ",
        size: 42.9,
        url: " https://cdn.example.com/photo.jpg ",
        thumbnailUrl: " https://cdn.example.com/photo-thumb.jpg ",
        storageKey: " uploads/user/photo.jpg ",
        sessionId: " abc ",
      },
      {
        id: "file-1",
        name: "",
        mimeType: "image/jpeg",
        url: "https://cdn.example.com/photo.jpg",
      },
    ]);

    expect(attachments).toEqual([
      {
        id: "file-1",
        name: "Photo.JPG",
        mimeType: "image/jpeg",
        size: 42,
        url: "https://cdn.example.com/photo.jpg",
        thumbnailUrl: "https://cdn.example.com/photo-thumb.jpg",
        storageKey: "uploads/user/photo.jpg",
        sessionId: "abc",
      },
    ]);
  });

  test("normalizeLocalAttachments enforces defaults and filters missing urls", () => {
    const normalized = normalizeLocalAttachments([
      {
        id: " file-1 ",
        name: "  image.png ",
        mimeType: " image/png ",
        size: 100,
        url: " https://cdn.example.com/image.png ",
        thumbnailUrl: null,
        storageKey: null,
        sessionId: null,
      },
      {
        id: "file-2",
        name: "missing-url",
        mimeType: "image/png",
        size: 10,
        url: " ",
        thumbnailUrl: null,
        storageKey: null,
        sessionId: null,
      },
    ]);

    expect(normalized).toEqual([
      {
        id: "file-1",
        name: "image.png",
        mimeType: "image/png",
        size: 100,
        url: "https://cdn.example.com/image.png",
        thumbnailUrl: null,
        storageKey: null,
        sessionId: null,
      },
    ]);
  });

  test("sanitizeStoredAttachments filters invalid entries", () => {
    const attachments = sanitizeStoredAttachments([
      {
        id: "attachment-1",
        name: "Document.pdf",
        mimeType: "application/pdf",
        size: 12,
        url: "https://cdn.example.com/doc.pdf",
        thumbnailUrl: null,
        storageKey: "documents/doc.pdf",
        sessionId: null,
      },
      {
        id: "attachment-1",
        name: "Duplicate",
        mimeType: "application/pdf",
        url: "https://cdn.example.com/doc.pdf",
      },
      { id: "", name: "missing", mimeType: "image/png", url: "" },
    ]);

    expect(attachments).toEqual([
      {
        id: "attachment-1",
        name: "Document.pdf",
        mimeType: "application/pdf",
        size: 12,
        url: "https://cdn.example.com/doc.pdf",
        thumbnailUrl: null,
        storageKey: "documents/doc.pdf",
        sessionId: null,
      },
    ]);
  });

  test("sanitizeSessionDescriptor adds self participant and trims direct chats", () => {
    const descriptor = {
      id: "conv-1",
      type: "direct" as const,
      title: "",
      avatar: null,
      createdBy: null,
      participants: [
        { id: "user_other", name: "Other", avatar: null },
        { id: "user_extra", name: "Extra", avatar: null },
      ],
    };
    const sanitized = sanitizeSessionDescriptor(descriptor, {
      selfIds: new Set(["user_self"]),
      primarySelfId: "user_self",
      secondarySelfId: null,
      isGroupConversation: () => false,
    });
    expect(sanitized.type).toBe("direct");
    expect(sanitized.participants.map((p) => p.id)).toEqual(["user_self", "user_other"]);
    expect(sanitized.title).toBe("Other");
  });

  test("sanitizeMessageBody collapses whitespace", () => {
    expect(sanitizeMessageBody("  hello   world \n")).toBe("hello world");
  });
});