// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FeedPostViewer } from "./FeedPostViewer";
import type { HomeFeedPost } from "@/hooks/useHomeFeed";
import type { LightboxImageItem } from "@/components/home-feed/feed-media-gallery";
import type { CommentThreadState } from "@/components/comments/types";

const basePost: HomeFeedPost = {
  id: "post-1",
  user_name: "Viewer",
  user_avatar: null,
  content: "Hello world",
  mediaUrl: null,
  created_at: "2024-01-01T00:00:00.000Z",
  likes: 2,
  shares: 0,
  comments: 0,
  viewerLiked: false,
  viewerRemembered: false,
  attachments: [],
};

const baseAttachment: LightboxImageItem = {
  id: "att-1",
  kind: "image",
  fullUrl: "https://example.com/full.jpg",
  displayUrl: "https://example.com/display.jpg",
  displaySrcSet: null,
  fullSrcSet: null,
  thumbnailUrl: null,
  name: "Example",
  alt: "Example",
  mimeType: "image/jpeg",
  width: 800,
  height: 600,
  aspectRatio: 4 / 3,
};

const baseThread: CommentThreadState = {
  status: "loaded",
  comments: [],
  error: null,
};

const noop = () => {};

const baseProps = {
  attachment: baseAttachment,
  attachments: [baseAttachment],
  post: basePost,
  onClose: noop,
  onNavigateAttachment: () => true,
  onNavigatePost: noop,
  canNavigatePrevPost: false,
  canNavigateNextPost: false,
  formatCount: (value?: number | null) => String(value ?? 0),
  timeAgo: () => "moments ago",
  exactTime: () => "now",
  commentThread: baseThread,
  commentSubmitting: false,
  loadComments: async () => {},
  submitComment: async () => {},
  likePending: false,
  onToggleLike: noop,
  remembered: false,
  memoryPending: false,
  canRemember: true,
  onToggleMemory: noop,
  friendControls: null,
};

describe("FeedPostViewer sidebar controls", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("invokes memory handler from the sidebar control", async () => {
    const onToggleMemory = vi.fn();
    await act(async () => {
      root.render(
        <FeedPostViewer
          {...baseProps}
          remembered={false}
          onToggleMemory={onToggleMemory}
        />,
      );
    });

    const button = container.querySelector(
      'button[aria-label="Remember this post"]',
    ) as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    await act(async () => {
      button?.click();
    });
    expect(onToggleMemory).toHaveBeenCalledWith(basePost, true);
  });

  it("routes follow and friend buttons to the provided handlers", async () => {
    const onFollow = vi.fn();
    const onRequest = vi.fn();
    await act(async () => {
      root.render(
        <FeedPostViewer
          {...baseProps}
          friendControls={{
            canTarget: true,
            pending: false,
            followState: "not_following",
            onRequest,
            onRemove: null,
            onFollow,
            onUnfollow: null,
          }}
        />,
      );
    });

    const followButton = container.querySelector(
      'button[aria-label="Follow member"]',
    ) as HTMLButtonElement | null;
    expect(followButton).not.toBeNull();
    await act(async () => {
      followButton?.click();
    });
    expect(onFollow).toHaveBeenCalledTimes(1);

    const friendButton = container.querySelector(
      'button[aria-label="Send friend request"]',
    ) as HTMLButtonElement | null;
    expect(friendButton).not.toBeNull();
    await act(async () => {
      friendButton?.click();
    });
    expect(onRequest).toHaveBeenCalledTimes(1);
  });

  it("invokes onShare when share action is clicked", async () => {
    const onShare = vi.fn();
    await act(async () => {
      root.render(<FeedPostViewer {...baseProps} onShare={onShare} />);
    });
    const shareButton = container.querySelector(
      'button[data-action-key="share"]',
    ) as HTMLButtonElement | null;
    expect(shareButton).not.toBeNull();
    await act(async () => {
      shareButton?.click();
    });
    expect(onShare).toHaveBeenCalledWith(basePost);
  });

  it("shows shareCountOverride in the share action", async () => {
    await act(async () => {
      root.render(<FeedPostViewer {...baseProps} shareCountOverride={5} />);
    });
    const shareButton = container.querySelector(
      'button[data-action-key="share"]',
    ) as HTMLButtonElement | null;
    expect(shareButton?.textContent ?? "").toContain("5");
    expect(shareButton?.getAttribute("aria-label") ?? "").toContain("5");
  });
});
