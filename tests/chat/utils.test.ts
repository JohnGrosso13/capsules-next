import { describe, expect, test } from "vitest";
import {
  MAX_BODY_LENGTH,
  decodeMessagePayload,
  encodeMessagePayload,
  sanitizeAttachments,
  sanitizeBody,
  sanitizeReactionEmoji,
} from "@/server/chat/utils";

describe("chat utils sanitization", () => {
  test("sanitizeBody trims whitespace and enforces max length", () => {
    const formatted = sanitizeBody("   Hello\n\nWorld   ");
    expect(formatted).toBe("Hello World");

    const long = "a".repeat(MAX_BODY_LENGTH + 25);
    expect(sanitizeBody(long)).toHaveLength(MAX_BODY_LENGTH);
  });

  test("sanitizeAttachments filters invalid entries and deduplicates by id", () => {
    const attachments = sanitizeAttachments([
      {
        id: " att-1 ",
        name: "  image.png ",
        mimeType: " image/png ",
        url: " https://cdn.example.com/image.png ",
        size: 123.9,
        thumbnailUrl: " https://cdn.example.com/thumb.png ",
        storageKey: " storage-key ",
        sessionId: " session ",
      },
      {
        id: "att-1",
        name: "",
        mimeType: "image/png",
        url: "https://cdn.example.com/duplicate.png",
      },
      {
        id: null,
        name: "missing",
        mimeType: "image/png",
        url: "https://cdn.example.com/missing.png",
      },
    ]);

    expect(attachments).toEqual([
      {
        id: "att-1",
        name: "image.png",
        mimeType: "image/png",
        size: 123,
        url: "https://cdn.example.com/image.png",
        thumbnailUrl: "https://cdn.example.com/thumb.png",
        storageKey: "storage-key",
        sessionId: "session",
      },
    ]);
  });

  test("encode and decode payload round trip sanitized data", () => {
    const encoded = encodeMessagePayload("  Hello world  ", [
      {
        id: "file-1",
        name: "photo.jpg",
        mimeType: "image/jpeg",
        size: 42,
        url: "https://cdn.example.com/photo.jpg",
        thumbnailUrl: null,
        storageKey: null,
        sessionId: null,
      },
    ]);

    const decoded = decodeMessagePayload(encoded);
    expect(decoded).toEqual({
      text: "Hello world",
      attachments: [
        {
          id: "file-1",
          name: "photo.jpg",
          mimeType: "image/jpeg",
          size: 42,
          url: "https://cdn.example.com/photo.jpg",
          thumbnailUrl: null,
          storageKey: null,
          sessionId: null,
        },
      ],
    });
  });

  test("decodeMessagePayload gracefully handles plain text input", () => {
    expect(decodeMessagePayload("  just text  ")).toEqual({
      text: "just text",
      attachments: [],
    });
  });

  test("sanitizeReactionEmoji accepts emoji sequences and rejects plain text", () => {
    expect(sanitizeReactionEmoji(" \uD83D\uDE0A spark ")).toBe("\uD83D\uDE0A spark");
    expect(sanitizeReactionEmoji("plain text")).toBe("");

    const longEmoji = "\uD83D\uDE0A".repeat(40);
    expect(sanitizeReactionEmoji(longEmoji)).toHaveLength(32);
  });
});