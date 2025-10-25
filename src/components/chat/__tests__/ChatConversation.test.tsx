// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";

import type { ChatSession } from "@/components/providers/ChatProvider";
import { ChatConversation } from "../ChatConversation";

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    // eslint-disable-next-line react/jsx-props-no-spreading
    return <img {...props} />;
  },
}));

vi.mock("next/dynamic", () => ({
  default: () =>
    function MockDynamic() {
      return null;
    },
}));

vi.mock("../EmojiPicker", () => ({
  EmojiPicker: () => null,
}));

vi.mock("../GifPicker", () => ({
  GifPicker: () => null,
}));

vi.mock("@/services/auth/client", () => ({
  useCurrentUser: () => ({
    user: {
      id: "user-1",
      name: "Test User",
      email: "user@example.com",
      avatarUrl: null,
    },
  }),
}));

vi.mock("@/hooks/useAttachmentUpload", () => ({
  useAttachmentUpload: () => ({
    fileInputRef: { current: null },
    attachment: null,
    readyAttachment: null,
    uploading: false,
    clearAttachment: vi.fn(),
    handleAttachClick: vi.fn(),
    handleAttachmentFile: vi.fn(),
    handleAttachmentSelect: vi.fn(),
    attachRemoteAttachment: vi.fn(),
  }),
}));

describe("ChatConversation message context menu", () => {
  const session: ChatSession = {
    id: "conversation-1",
    type: "direct",
    title: "Test Conversation",
    avatar: null,
    createdBy: "user-1",
    participants: [
      { id: "user-1", name: "Test User", avatar: null },
      { id: "user-2", name: "Friend", avatar: null },
    ],
    messages: [
      {
        id: "message-1",
        authorId: "user-1",
        body: "Hello world",
        sentAt: new Date("2024-01-01T12:00:00Z").toISOString(),
        status: "sent",
        reactions: [],
        attachments: [],
      },
    ],
    unreadCount: 0,
    lastMessageAt: new Date("2024-01-01T12:00:00Z").toISOString(),
    lastMessagePreview: "Hello world",
    typing: [],
  };

  let container: HTMLDivElement;
  let root: Root;
  let clipboardWrite: ReturnType<typeof vi.fn>;
  let selectionSpy: ReturnType<typeof vi.spyOn>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    if (!window.requestAnimationFrame) {
      (window as { requestAnimationFrame?: typeof window.requestAnimationFrame }).requestAnimationFrame =
        (callback: FrameRequestCallback) => {
          callback(0);
          return 0;
        };
    }

    clipboardWrite = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: clipboardWrite,
      },
    });
    selectionSpy = vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => "",
    } as unknown as Selection);
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete (navigator as { clipboard?: unknown }).clipboard;
    vi.restoreAllMocks();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  function renderConversation() {
    act(() => {
      root.render(
        <ChatConversation
          session={session}
          currentUserId="user-1"
          selfClientId="client-1"
          onSend={async () => {}}
          onToggleReaction={async () => {}}
          onTypingChange={() => {}}
          onRemoveAttachments={async () => {}}
          onDeleteMessage={async () => {}}
        />,
      );
    });
  }

  function findElementContainingText(rootElement: HTMLElement, text: string): HTMLElement | null {
    const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      const element = walker.currentNode as HTMLElement;
      if (element.textContent?.includes(text)) {
        return element;
      }
    }
    return null;
  }

  it("opens the message context menu and copies message text", async () => {
    renderConversation();

    const messageGroup = container.querySelector(
      `[data-message-id="${session.messages[0]?.id}"]`,
    );
    expect(messageGroup).toBeTruthy();

    await act(async () => {
      messageGroup?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          clientX: 120,
          clientY: 160,
        }),
      );
    });

    const copyButton = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button[role='menuitem']"),
    ).find((button) => button.textContent?.includes("Copy message"));

    expect(copyButton).toBeTruthy();

    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(clipboardWrite).toHaveBeenCalledWith(expect.stringContaining("Hello world"));
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/telemetry/chat-action",
      expect.objectContaining({ method: "POST" }),
    );
    const menu = document.body.querySelector("[role='menu']");
    expect(menu).toBeNull();
  });

  it("copies the message when pressing Ctrl+C without a selection", async () => {
    renderConversation();

    const messageGroup = container.querySelector(
      `[data-message-id="${session.messages[0]?.id}"]`,
    ) as HTMLElement | null;
    expect(messageGroup).toBeTruthy();

    messageGroup?.focus();

    await act(async () => {
      messageGroup?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "c",
          ctrlKey: true,
          bubbles: true,
        }),
      );
    });

    expect(selectionSpy).toHaveBeenCalled();
    expect(clipboardWrite).toHaveBeenCalledWith(expect.stringContaining("Hello world"));
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/telemetry/chat-action",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
