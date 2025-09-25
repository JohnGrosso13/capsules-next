"use client";

/* eslint-disable @next/next/no-img-element */

import * as React from "react";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";

import { AiPrompterStage, type PrompterAction, type ComposerMode } from "@/components/ai-prompter-stage";
import { AiComposerDrawer, type ComposerDraft } from "@/components/ai-composer";
import { PrimaryHeader } from "@/components/primary-header";
import friendsStyles from "@/app/(authenticated)/friends/friends.module.css";
import homeStyles from "./home.module.css";

import styles from "./app-shell.module.css";

type NavKey = "home" | "create" | "capsule" | "memory";

type Friend = {
  id: string | null;
  userId: string | null;
  key?: string | null;
  name: string;
  avatar?: string | null;
  since?: string | null;
  status?: "online" | "offline" | "away";
};

type RailTab = "friends" | "chats" | "requests";

type ComposerChoice = { key: string; label: string };

type ComposerState = {
  open: boolean;
  loading: boolean;
  prompt: string;
  draft: ComposerDraft | null;
  rawPost: Record<string, unknown> | null;
  message: string | null;
  choices: ComposerChoice[] | null;
};

const fallbackFriends: Friend[] = [
  { id: "capsules", userId: null, key: null, name: "Capsules Team", status: "online" },
  { id: "memory", userId: null, key: null, name: "Memory Bot", status: "online" },
  { id: "dream", userId: null, key: null, name: "Dream Studio", status: "online" },
];

const initialComposerState: ComposerState = {
  open: false,
  loading: false,
  prompt: "",
  draft: null,
  rawPost: null,
  message: null,
  choices: null,
};

function sanitizePollFromDraft(draft: ComposerDraft): { question: string; options: string[] } | null {
  if (!draft.poll) return null;
  const question = typeof draft.poll.question === "string" ? draft.poll.question : "";
  const options = Array.isArray(draft.poll.options)
    ? draft.poll.options.map((option) => String(option ?? "")).filter((option) => option.trim().length > 0)
    : [];
  if (!question.trim() && !options.length) return null;
  return {
    question,
    options: options.length ? options : ["Yes", "No"],
  };
}

function normalizeDraftFromPost(post: Record<string, unknown>): ComposerDraft {
  const kind = typeof post.kind === "string" ? post.kind.toLowerCase() : "text";
  const content = typeof post.content === "string" ? post.content : "";
  const mediaUrl = typeof post.mediaUrl === "string"
    ? post.mediaUrl
    : typeof post.media_url === "string"
    ? (post.media_url as string)
    : null;
  const mediaPrompt = typeof post.mediaPrompt === "string"
    ? post.mediaPrompt
    : typeof post.media_prompt === "string"
    ? (post.media_prompt as string)
    : null;
  let poll: { question: string; options: string[] } | null = null;
  const pollValue = (post as Record<string, unknown>).poll;
  if (pollValue && typeof pollValue === "object") {
    const pollRecord = pollValue as Record<string, unknown>;
    const question = typeof pollRecord.question === "string" ? pollRecord.question : "";
    const optionsRaw = Array.isArray(pollRecord.options) ? pollRecord.options : [];
    const options = optionsRaw.map((option) => String(option ?? ""));
    poll = { question, options: options.length ? options : ["", ""] };
  }
  const suggestions = Array.isArray((post as Record<string, unknown>).suggestions)
    ? (post as Record<string, unknown>).suggestions
        .map((suggestion) => String(suggestion ?? ""))
        .filter((suggestion) => suggestion.trim().length > 0)
    : undefined;

  return {
    kind,
    title: typeof post.title === "string" ? post.title : null,
    content,
    mediaUrl,
    mediaPrompt,
    poll,
    suggestions,
  };
}

function buildPostPayload(
  draft: ComposerDraft,
  rawPost: Record<string, unknown> | null,
  author?: { name?: string | null; avatar?: string | null },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    client_id: typeof rawPost?.client_id === "string" ? rawPost.client_id : crypto.randomUUID(),
    kind: (draft.kind ?? "text").toLowerCase(),
    content: draft.content ?? "",
    source: rawPost?.source ?? "ai-prompter",
  };

  if (author?.name) {
    payload.userName = author.name;
    payload.user_name = author.name;
  }

  if (author?.avatar) {
    payload.userAvatar = author.avatar;
    payload.user_avatar = author.avatar;
  }

  if (draft.title && draft.title.trim()) payload.title = draft.title.trim();

  if (draft.mediaUrl && draft.mediaUrl.trim()) {
    payload.mediaUrl = draft.mediaUrl.trim();
    payload.media_url = draft.mediaUrl.trim();
  }

  if (draft.mediaPrompt && draft.mediaPrompt.trim()) {
    payload.mediaPrompt = draft.mediaPrompt.trim();
    payload.media_prompt = draft.mediaPrompt.trim();
  }

  if (draft.kind.toLowerCase() === "poll") {
    const sanitized = sanitizePollFromDraft(draft);
    if (sanitized) payload.poll = sanitized;
  }

  if (rawPost?.capsule_id) payload.capsule_id = rawPost.capsule_id;
  if (rawPost?.capsuleId) payload.capsuleId = rawPost.capsuleId;

  return payload;
}

async function callAiPrompt(message: string, options?: Record<string, unknown>, post?: Record<string, unknown>) {
  const body: Record<string, unknown> = { message };
  if (options && Object.keys(options).length) body.options = options;
  if (post) body.post = post;

  const response = await fetch("/api/ai/prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `AI request failed (${response.status})`);
  }

  return (await response.json()) as Record<string, unknown>;
}

async function persistPost(post: Record<string, unknown>, userEnvelope?: Record<string, unknown>) {
  const body: Record<string, unknown> = { post };
  if (userEnvelope) body.user = userEnvelope;
  const response = await fetch("/api/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Post failed (${response.status})`);
  }
  return response.json().catch(() => null) as Promise<Record<string, unknown> | null>;
}

type AppShellProps = {
  children: React.ReactNode;
  activeNav?: NavKey;
  showPrompter?: boolean;
  promoSlot?: React.ReactNode;
};

export function AppShell({ children, activeNav, showPrompter = true, promoSlot }: AppShellProps) {
  const pathname = usePathname();
  const { user } = useUser();
  const derivedActive: NavKey = React.useMemo(() => {
    if (activeNav) return activeNav;
    if (!pathname) return "home";
    if (pathname.startsWith("/create")) return "create";
    if (pathname.startsWith("/capsule")) return "capsule";
    if (pathname.startsWith("/memory")) return "memory";
    return "home";
  }, [activeNav, pathname]);

  const [friends, setFriends] = React.useState<Friend[]>(fallbackFriends);
  const [railMode, setRailMode] = React.useState<"tiles" | "connections">("tiles");
  const [activeRailTab, setActiveRailTab] = React.useState<RailTab>("friends");
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [composer, setComposer] = React.useState<ComposerState>(initialComposerState);
  const [activeFriendTarget, setActiveFriendTarget] = React.useState<string | null>(null);
  const [friendActionPendingId, setFriendActionPendingId] = React.useState<string | null>(null);

  const currentUserName = React.useMemo(() => {
    if (!user) return null;
    return (user.fullName && user.fullName.trim())
      || (user.username && user.username.trim())
      || (user.firstName && user.firstName.trim())
      || (user.lastName && user.lastName.trim())
      || (user.primaryEmailAddress?.emailAddress ?? null);
  }, [user]);

  const currentUserAvatar = user?.imageUrl ?? null;

  const currentAuthor = React.useMemo(() => ({
    name: currentUserName ?? undefined,
    avatar: currentUserAvatar ?? undefined,
  }), [currentUserName, currentUserAvatar]);
  const currentUserEnvelope = React.useMemo(() => {
    if (!user) return null;
    return {
      clerk_id: user.id,
      email: user.primaryEmailAddress?.emailAddress ?? null,
      full_name: currentUserName ?? null,
      avatar_url: currentUserAvatar ?? null,
      provider: user.primaryEmailAddress?.verification?.strategy ?? 'clerk',
      key: user.username ? `clerk:${user.username}` : undefined,
    };
  }, [user, currentUserName, currentUserAvatar]);


  const mapFriendList = React.useCallback((items: unknown[]): Friend[] => {
    return items.map((raw) => {
      const record = raw as Record<string, unknown>;
      const name = typeof record["name"] === "string"
        ? (record["name"] as string)
        : typeof record["user_name"] === "string"
        ? (record["user_name"] as string)
        : typeof record["userName"] === "string"
        ? (record["userName"] as string)
        : "Friend";
      const avatar = typeof record["avatar"] === "string"
        ? (record["avatar"] as string)
        : typeof record["avatarUrl"] === "string"
        ? (record["avatarUrl"] as string)
        : typeof record["userAvatar"] === "string"
        ? (record["userAvatar"] as string)
        : null;
      const statusValue = typeof record["status"] === "string" ? (record["status"] as string) : undefined;
      const status: Friend["status"] = statusValue === "online" || statusValue === "away" ? statusValue : "offline";
      return {
        id: typeof record["id"] === "string" ? (record["id"] as string) : null,
        userId:
          typeof record["userId"] === "string"
            ? (record["userId"] as string)
            : typeof record["user_id"] === "string"
            ? (record["user_id"] as string)
            : null,
        key:
          typeof record["key"] === "string"
            ? (record["key"] as string)
            : typeof record["userKey"] === "string"
            ? (record["userKey"] as string)
            : null,
        name,
        avatar,
        since: typeof record["since"] === "string" ? (record["since"] as string) : null,
        status,
      } satisfies Friend;
    });
  }, []);

  const buildFriendTargetPayload = React.useCallback((friend: Friend): Record<string, string> | null => {
    const target: Record<string, string> = {};
    if (friend.userId) {
      target.userId = friend.userId;
    } else if (friend.key) {
      target.userKey = friend.key;
    } else {
      return null;
    }
    if (friend.name) target.name = friend.name;
    if (friend.avatar) target.avatar = friend.avatar;
    return target;
  }, []);

  React.useEffect(() => {
    fetch("/api/friends/sync", { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        const arr = Array.isArray(d.friends) ? d.friends : [];
        const mapped = mapFriendList(arr);
        setFriends(mapped.length ? mapped : fallbackFriends);
      })
      .catch(() => setFriends(fallbackFriends));
  }, [mapFriendList]);

  React.useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  const connectionTiles = React.useMemo(
    () => [
      {
        key: "friends" as RailTab,
        title: "Friends",
        description: "Manage the people in your capsule.",
        href: "/friends?tab=friends",
        icon: "🤝",
        badge: friends.length || undefined,
        primary: true,
      },
      {
        key: "chats" as RailTab,
        title: "Chats",
        description: "Conversations coming soon.",
        href: "/friends?tab=chats",
        icon: "💬",
      },
      {
        key: "requests" as RailTab,
        title: "Requests",
        description: "Approve or invite new members.",
        href: "/friends?tab=requests",
        icon: "✨",
      },
    ],
    [friends.length],
  );

  function presenceClass(status?: string) {
    if (status === "online") return friendsStyles.online;
    if (status === "away") return friendsStyles.away ?? friendsStyles.online;
    return friendsStyles.offline;
  }

  const handleFriendNameClick = React.useCallback((identifier: string) => {
    setActiveFriendTarget((prev) => (prev === identifier ? null : identifier));
  }, []);

  const handleFriendRequest = React.useCallback(
    async (friend: Friend, identifier: string) => {
      const target = buildFriendTargetPayload(friend);
      if (!target) {
        setStatusMessage("That profile isn't ready for requests yet.");
        return;
      }
      setFriendActionPendingId(identifier);
      try {
        const res = await fetch("/api/friends/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "request", target }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          const message =
            (data && typeof data.message === "string" && data.message)
              || (data && typeof data.error === "string" && data.error)
              || "Could not send that friend request.";
          throw new Error(message);
        }
        if (data && Array.isArray(data.friends)) {
          setFriends(mapFriendList(data.friends));
        }
        setStatusMessage(`Friend request sent to ${friend.name}.`);
      } catch (error) {
        console.error("Friend request error", error);
        setStatusMessage(
          error instanceof Error && error.message ? error.message : "Couldn't send that friend request.",
        );
      } finally {
        setFriendActionPendingId(null);
        setActiveFriendTarget(null);
      }
    },
    [buildFriendTargetPayload, mapFriendList, setFriends, setStatusMessage],
  );

  const handleAiResponse = React.useCallback(
    (prompt: string, payload: Record<string, unknown>, previous?: { draft: ComposerDraft | null; raw: Record<string, unknown> | null }) => {
      const action = typeof payload.action === "string" ? payload.action : "draft_post";
      if (action === "draft_post") {
        const postRecord = (payload.post ?? {}) as Record<string, unknown>;
        const nextDraft = normalizeDraftFromPost(postRecord);
        setComposer({
          open: true,
          loading: false,
          prompt,
          draft: nextDraft,
          rawPost: postRecord,
          message: typeof payload.message === "string" ? payload.message : null,
          choices: null,
        });
        setStatusMessage(null);
        return;
      }

      if (action === "confirm_edit_choice") {
        const choicesArray = Array.isArray(payload.choices) ? payload.choices : [];
        const mapped: ComposerChoice[] = choicesArray.map((choice) => {
          const record = choice as Record<string, unknown>;
          const key = String(record.key ?? "option");
          const label = typeof record.label === "string" && record.label.trim() ? record.label : key;
          return { key, label };
        });
        setComposer({
          open: true,
          loading: false,
          prompt,
          draft: previous?.draft ?? null,
          rawPost: previous?.raw ?? null,
          message: typeof payload.message === "string" ? payload.message : "Choose how you'd like to continue.",
          choices: mapped.length ? mapped : null,
        });
        return;
      }

      if (action === "navigate") {
        setStatusMessage(typeof payload.message === "string" ? payload.message : "Navigation ready.");
        setComposer(initialComposerState);
        return;
      }

      setStatusMessage(typeof payload.message === "string" ? payload.message : "Capsule AI responded.");
      setComposer(initialComposerState);
    },
    [],
  );

  const submitManualPost = React.useCallback(async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    setStatusMessage("Posting...");
    try {
      await persistPost({
        client_id: crypto.randomUUID(),
        kind: "text",
        content: trimmed,
        source: "ai-prompter",
        userName: currentUserName ?? undefined,
        user_name: currentUserName ?? undefined,
        userAvatar: currentUserAvatar ?? undefined,
        user_avatar: currentUserAvatar ?? undefined,
      }, currentUserEnvelope ?? undefined);
      setStatusMessage("Posted to your feed.");
      window.dispatchEvent(new CustomEvent("posts:refresh", { detail: { reason: "manual" } }));
    } catch (error) {
      console.error("Manual post error", error);
      setStatusMessage("Couldn't post right now.");
    }
  }, [currentUserName, currentUserAvatar, currentUserEnvelope]);

  const runAiComposer = React.useCallback(
    async (prompt: string, mode: ComposerMode) => {
      setComposer({
        open: true,
        loading: true,
        prompt,
        draft: null,
        rawPost: null,
        message: null,
        choices: null,
      });
      setStatusMessage("Drafting with Capsule AI...");
      try {
        const options: Record<string, unknown> = {};
        if (mode === "poll") options.prefer = "poll";
        const payload = await callAiPrompt(prompt, Object.keys(options).length ? options : undefined);
        handleAiResponse(prompt, payload);
      } catch (error) {
        console.error("AI draft error", error);
        setComposer((prev) => ({ ...prev, loading: false }));
        setStatusMessage("Could not reach Capsule AI right now.");
      }
    },
    [handleAiResponse],
  );

  const handlePrompterAction = React.useCallback(
    (action: PrompterAction) => {
      if (action.kind === "post_manual") {
        submitManualPost(action.content);
        return;
      }
      if (action.kind === "post_ai") {
        runAiComposer(action.prompt, action.mode);
        return;
      }
      if (action.kind === "generate") {
        setStatusMessage("Prompt received.");
      }
    },
    [runAiComposer, submitManualPost],
  );

  const handleDraftChange = React.useCallback((next: ComposerDraft) => {
    setComposer((prev) => ({ ...prev, draft: next }));
  }, []);

  const handleComposerClose = React.useCallback(() => {
    setComposer(initialComposerState);
  }, []);

  const handleComposerChoice = React.useCallback(
    async (key: string) => {
      setComposer((prev) => ({ ...prev, loading: true, choices: null }));
      try {
        const payload = await callAiPrompt(composer.prompt, { force: key }, composer.rawPost ?? undefined);
        handleAiResponse(composer.prompt, payload, { draft: composer.draft, raw: composer.rawPost });
      } catch (error) {
        console.error("AI choice error", error);
        setComposer((prev) => ({ ...prev, loading: false }));
        setStatusMessage("Could not complete that request.");
      }
    },
    [composer.prompt, composer.draft, composer.rawPost, handleAiResponse],
  );

  const handleComposerPost = React.useCallback(async () => {
    if (!composer.draft) return;
    setComposer((prev) => ({ ...prev, loading: true }));
    try {
      const postPayload = buildPostPayload(composer.draft, composer.rawPost, currentAuthor);
      await persistPost(postPayload, currentUserEnvelope ?? undefined);
      setComposer(initialComposerState);
      setStatusMessage("Post published.");
      window.dispatchEvent(new CustomEvent("posts:refresh", { detail: { reason: "ai" } }));
    } catch (error) {
      console.error("Composer publish error", error);
      setComposer((prev) => ({ ...prev, loading: false }));
      setStatusMessage("Couldn't publish that post yet.");
    }
  }, [composer.draft, composer.rawPost, currentAuthor, currentUserEnvelope]);

  return (
    <div className={styles.outer}>
      <PrimaryHeader activeKey={derivedActive} />
      <div className={styles.page}>
        <main className={styles.main}>
          {showPrompter ? (
            <div className={styles.prompterStage}>
              <AiPrompterStage onAction={handlePrompterAction} statusMessage={statusMessage} />
            </div>
          ) : null}

          <div className={styles.layout}>
            <section className={styles.content}>
              {promoSlot ? <div className={styles.promoRowSpace}>{promoSlot}</div> : null}
              {children}
            </section>
            <aside className={styles.rail}>
              {railMode === "tiles" ? (
                <div className={homeStyles.connectionTiles}>
                  {connectionTiles.map((tile) => (
                    <button
                      key={tile.key}
                      type="button"
                      className={`${homeStyles.connectionTile} ${tile.primary ? homeStyles.connectionTilePrimary : ""}`.trim()}
                      onClick={() => {
                        setActiveRailTab(tile.key);
                        setRailMode("connections");
                      }}
                    >
                      <div className={homeStyles.connectionTileHeader}>
                        <div className={homeStyles.connectionTileMeta}>
                          <span className={homeStyles.connectionTileIcon} aria-hidden>
                            {tile.icon}
                          </span>
                          <span className={homeStyles.connectionTileTitle}>{tile.title}</span>
                        </div>
                        {tile.badge ? <span className={homeStyles.connectionTileBadge}>{tile.badge}</span> : null}
                      </div>
                      <p className={homeStyles.connectionTileDescription}>{tile.description}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className={homeStyles.railConnections}>
                  <div className={homeStyles.railHeaderRow}>
                    <button
                      type="button"
                      className={homeStyles.railBackBtn}
                      aria-label="Back to tiles"
                      onClick={() => setRailMode("tiles")}
                    >
                      &lt;
                    </button>
                  </div>
                  <div className={homeStyles.railTabs} role="tablist" aria-label="Connections">
                    {(
                      [
                        { key: "friends", label: "Friends" },
                        { key: "chats", label: "Chats" },
                        { key: "requests", label: "Requests" },
                      ] as { key: RailTab; label: string }[]
                    ).map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        role="tab"
                        aria-selected={activeRailTab === t.key}
                        className={`${homeStyles.railTab} ${activeRailTab === t.key ? homeStyles.railTabActive : ""}`.trim()}
                        onClick={() => setActiveRailTab(t.key)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div className={homeStyles.railPanel} hidden={activeRailTab !== "friends"}>
                    <div className={`${friendsStyles.list}`.trim()}>
                      {friends.map((f, i) => {
                        const identifier = f.userId ?? f.key ?? f.id ?? `friend-${i}`;
                        const listKey = `${identifier}-${i}`;
                        const canTarget = Boolean(f.userId || f.key || f.id);
                        const isOpen = activeFriendTarget === identifier;
                        const isPending = friendActionPendingId === identifier;
                        const sinceLabel = f.since ? new Date(f.since).toLocaleDateString() : null;
                        return (
                          <div key={listKey} className={friendsStyles.friendRow}>
                          <span className={friendsStyles.avatarWrap}>
                            {f.avatar ? (
                              <img className={friendsStyles.avatarImg} src={f.avatar} alt="" aria-hidden />
                            ) : (
                              <span className={friendsStyles.avatar} aria-hidden />
                            )}
                            <span className={`${friendsStyles.presence} ${presenceClass(f.status)}`.trim()} aria-hidden />
                          </span>
                          <div className={friendsStyles.friendMeta}>
                              <button
                                type="button"
                                className={`${friendsStyles.friendNameButton} ${friendsStyles.friendName}`.trim()}
                                onClick={() => handleFriendNameClick(identifier)}
                                aria-expanded={isOpen}
                              >
                                {f.name}
                              </button>
                              {sinceLabel ? <div className={friendsStyles.friendSince}>Since {sinceLabel}</div> : null}
                              {isOpen ? (
                                <div className={friendsStyles.friendActions}>
                                  <button
                                    type="button"
                                    className={friendsStyles.friendActionButton}
                                    onClick={() => handleFriendRequest(f, identifier)}
                                    disabled={!canTarget || isPending}
                                    aria-busy={isPending}
                                  >
                                    {isPending ? "Sending..." : "Add friend"}
                                  </button>
                                </div>
                              ) : null}
                          </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className={homeStyles.railPanel} hidden={activeRailTab !== "chats"}>
                    <div className={friendsStyles.empty}>Chats are coming soon.</div>
                  </div>
                  <div className={homeStyles.railPanel} hidden={activeRailTab !== "requests"}>
                    <div className={friendsStyles.empty}>No pending requests.</div>
                  </div>
                </div>
              )}
            </aside>
          </div>
        </main>
      </div>
      <AiComposerDrawer
        open={composer.open}
        loading={composer.loading}
        draft={composer.draft}
        prompt={composer.prompt}
        message={composer.message}
        choices={composer.choices}
        onChange={handleDraftChange}
        onClose={handleComposerClose}
        onPost={handleComposerPost}
        onForceChoice={composer.choices ? handleComposerChoice : undefined}
      />
    </div>
  );
}

