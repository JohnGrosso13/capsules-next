"use client";

import * as React from "react";
import Link from "next/link";
import {
  PaperPlaneTilt,
  ShareNetwork,
  Sparkle,
  UsersThree,
  UserPlus,
} from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { friendsActions } from "@/lib/friends/store";
import { useChatContext } from "@/components/providers/ChatProvider";
import type {
  ProfilePageData,
  ProfileClip,
  ProfileEvent,
} from "@/server/profile/service";
import type { CapsuleSummary } from "@/server/capsules/repository";
import type { FeedPost } from "@/domain/feed";
import styles from "./profile-page.module.css";

type ProfilePageClientProps = {
  data: ProfilePageData;
  canonicalPath: string | null;
};

export function ProfilePageClient({ data, canonicalPath }: ProfilePageClientProps) {
  const [activeTab, setActiveTab] = React.useState("overview");
  const initials = React.useMemo(() => {
    const source = data.user.name ?? data.user.key ?? "Capsules";
    return source
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase())
      .slice(0, 2)
      .join("");
  }, [data.user.name, data.user.key]);

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.backdropGlow} aria-hidden />
          <div className={styles.profileHeader}>
            <div className={styles.avatarShell} aria-hidden={!data.user.avatarUrl}>
              {data.user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.user.avatarUrl} alt="" />
              ) : (
                initials
              )}
            </div>
            <div className={styles.identity}>
              <h1 className={styles.displayName}>{data.user.name ?? "Capsules member"}</h1>
              {data.user.key ? (
                <div className={styles.handle}>@{data.user.key.replace(/[:]/g, "·")}</div>
              ) : null}
              {data.user.bio ? (
                <p className={styles.heroBio}>{data.user.bio}</p>
              ) : (
                <p className={styles.heroBio}>
                  Crafting memories, capsules, and tournaments with AI copilots.
                </p>
              )}
            </div>
          </div>

          <div className={styles.statsBar}>
            <Stat label="Followers" value={data.stats.followers} />
            <Stat label="Following" value={data.stats.following} />
            <Stat label="Owned spaces" value={data.stats.spacesOwned} />
          </div>

          <ProfileActions data={data} canonicalPath={canonicalPath} />
        </div>
      </section>

      <section className={styles.tabsCard}>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className={styles.tabList}>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="posts">Posts</TabsTrigger>
            <TabsTrigger value="clips">Clips</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="store">Store</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab data={data} />
          </TabsContent>

          <TabsContent value="posts">
            <PostsTab recent={data.posts.recent} top={data.posts.top} />
          </TabsContent>

          <TabsContent value="clips">
            <ClipsTab clips={data.clips} />
          </TabsContent>

          <TabsContent value="events">
            <EventsTab events={data.events} />
          </TabsContent>

          <TabsContent value="store">
            <StoreTab store={data.featuredStore} />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}

type StatProps = { label: string; value: number };

function Stat({ label, value }: StatProps) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value.toLocaleString()}</div>
    </div>
  );
}

type ProfileActionsProps = {
  data: ProfilePageData;
  canonicalPath: string | null;
};

function ProfileActions({ data, canonicalPath }: ProfileActionsProps) {
  const chat = useChatContext();
  const [followed, setFollowed] = React.useState(data.viewer.follow.isFollowing);
  const [pending, setPending] = React.useState<"follow" | "message" | "invite" | "share" | null>(
    null,
  );
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const inviteDisabled = !data.viewer.inviteOptions.length || data.viewer.isSelf;

  const targetPayload = React.useMemo(
    () => ({
      userId: data.user.id,
      userKey: data.user.key,
      name: data.user.name ?? "Friend",
      avatarUrl: data.user.avatarUrl ?? null,
    }),
    [data.user],
  );

  const handleFollow = async () => {
    if (data.viewer.isSelf) return;
    setPending("follow");
    setFeedback(null);
    try {
      await friendsActions.performTargetedMutation(
        followed ? "unfollow" : "follow",
        targetPayload,
      );
      setFollowed((prev) => !prev);
      setFeedback(followed ? "Unfollowed member." : "Now following.");
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Unable to update follow status right now.",
      );
    } finally {
      setPending(null);
    }
  };

  const handleMessage = () => {
    if (data.viewer.isSelf) return;
    setFeedback(null);
    setPending("message");
    try {
      const result = chat.startChat(
        {
          userId: data.user.id,
          name: data.user.name ?? "Friend",
          avatar: data.user.avatarUrl ?? null,
        },
        { activate: true },
      );
      if (!result) {
        setFeedback("We couldn't open that DM. Try again soon.");
      } else {
        setFeedback("Chat opened.");
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to start chat.");
    } finally {
      setPending(null);
    }
  };

  const handleShare = async () => {
    if (!canonicalPath) return;
    setPending("share");
    setFeedback(null);
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setFeedback("Clipboard is unavailable in this environment.");
      setPending(null);
      return;
    }
    try {
      const absolute =
        typeof window !== "undefined" ? `${window.location.origin}${canonicalPath}` : canonicalPath;
      await navigator.clipboard.writeText(absolute);
      setFeedback("Profile link copied.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to copy link.");
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <div className={styles.actionBar}>
        <Button
          variant="gradient"
          size="lg"
          className="font-semibold tracking-wide uppercase"
          disabled={data.viewer.isSelf}
          onClick={handleFollow}
          data-loading={pending === "follow" ? "true" : undefined}
        >
          <UserPlus weight="duotone" />
          {followed ? "Following" : "Follow"}
        </Button>

        <Button
          variant="secondary"
          size="lg"
          onClick={handleMessage}
          disabled={data.viewer.isSelf}
          data-loading={pending === "message" ? "true" : undefined}
        >
          <PaperPlaneTilt weight="duotone" />
          Message
        </Button>

        <InviteMenu
          capsules={data.viewer.inviteOptions}
          disabled={inviteDisabled}
          targetUserId={data.user.id}
          onStatus={(message) => setFeedback(message)}
          onPending={(value) => setPending(value ? "invite" : null)}
        />

        <button
          type="button"
          className={styles.secondaryAction}
          onClick={handleShare}
          disabled={!canonicalPath || pending === "share"}
        >
          <ShareNetwork weight="duotone" />
          Share profile
        </button>
      </div>
      {feedback ? <p className={styles.feedback}>{feedback}</p> : null}
    </>
  );
}

type InviteMenuProps = {
  capsules: CapsuleSummary[];
  disabled: boolean;
  targetUserId: string;
  onStatus(message: string): void;
  onPending(state: boolean): void;
};

function InviteMenu({ capsules, disabled, targetUserId, onStatus, onPending }: InviteMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [pendingCapsuleId, setPendingCapsuleId] = React.useState<string | null>(null);

  const toggle = () => {
    if (disabled || !capsules.length) return;
    setOpen((prev) => !prev);
  };

  React.useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (!(event.target instanceof HTMLElement)) return;
      if (!event.target.closest(`.${styles.inviteMenu}`)) {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", handleClick);
    return () => window.removeEventListener("pointerdown", handleClick);
  }, [open]);

  const handleInvite = async (capsule: CapsuleSummary) => {
    setPendingCapsuleId(capsule.id);
    onPending(true);
    try {
      const response = await fetch(`/api/capsules/${capsule.id}/membership`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "invite_member",
          targetUserId,
        }),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || "Unable to send invite.");
      }
      onStatus(`Invited to ${capsule.name}.`);
      setOpen(false);
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "Invite failed. Try again later.");
    } finally {
      onPending(false);
      setPendingCapsuleId(null);
    }
  };

  return (
    <div className={styles.inviteMenu}>
      <button
        type="button"
        className={styles.secondaryAction}
        onClick={toggle}
        disabled={disabled}
      >
        <Sparkle weight="duotone" />
        Invite
      </button>
      {open ? (
        <div className={styles.invitePopover}>
          {capsules.map((capsule) => (
            <button
              type="button"
              key={capsule.id}
              className={styles.inviteOption}
              onClick={() => handleInvite(capsule)}
              disabled={pendingCapsuleId === capsule.id}
            >
              <span className={styles.inviteOptionLogo} aria-hidden>
                {capsule.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={capsule.logoUrl} alt="" />
                ) : (
                  <UsersThree weight="duotone" />
                )}
              </span>
              <span>{capsule.name}</span>
            </button>
          ))}
          {!capsules.length ? (
            <div className={styles.emptyState}>Create a capsule to send invites.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function OverviewTab({ data }: { data: ProfilePageData }) {
  return (
    <div className={styles.panelGrid}>
      <ProfileAbout initialBio={data.user.bio} canEdit={data.viewer.isSelf} />
      <div className={styles.glassCard}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Owned spaces</h3>
        </div>
        {data.spaces.length ? (
          <div className={styles.ownedGrid}>
            {data.spaces.map((space) => (
              <Link
                key={space.id}
                className={styles.spaceCard}
                href={`/capsule?capsuleId=${space.id}`}
              >
                <span className={styles.spaceLogo} aria-hidden>
                  {space.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={space.logoUrl} alt="" />
                  ) : (
                    space.name.charAt(0)
                  )}
                </span>
                <div>
                  <div className={styles.spaceName}>{space.name}</div>
                  <div className="text-xs text-white/70">
                    {space.slug ? `capsules.app/${space.slug}` : "Private space"}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>No published spaces yet.</div>
        )}
      </div>
    </div>
  );
}

function ProfileAbout({
  initialBio,
  canEdit,
}: {
  initialBio: string | null;
  canEdit: boolean;
}) {
  const [value, setValue] = React.useState(initialBio ?? "");
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    setValue(initialBio ?? "");
  }, [initialBio]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bio: value.trim().length ? value.trim() : null,
        }),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || "Failed to update profile.");
      }
      setMessage("Updated your about card.");
      setEditing(false);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("capsules:profile-updated", {
            detail: { bio: value },
          }),
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save bio.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.glassCard}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>About</h3>
        {canEdit ? (
          <Button variant="ghost" size="sm" onClick={() => setEditing((prev) => !prev)}>
            {editing ? "Close" : "Edit"}
          </Button>
        ) : null}
      </div>
      {canEdit && editing ? (
        <>
          <textarea
            className={styles.aboutTextarea}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            maxLength={560}
            placeholder="Tell your community about your focus, accolades, or creator energy."
          />
          <div className={styles.aboutActions}>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={saving}
              data-loading={saving ? "true" : undefined}
            >
              Save about
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setValue(initialBio ?? "");
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <span className="text-xs text-white/60">{value.length}/560</span>
          </div>
        </>
      ) : (
        <p>
          {initialBio?.trim().length
            ? initialBio
            : "This member hasn't added an about card yet. Follow to get updates when they do."}
        </p>
      )}
      {message ? <p className={styles.feedback}>{message}</p> : null}
    </div>
  );
}

function PostsTab({ recent, top }: { recent: FeedPost[]; top: FeedPost[] }) {
  return (
    <div className={styles.panelGrid}>
      <PostCollection title="Recent drops" posts={recent} emptyMessage="No recent posts yet." />
      <PostCollection
        title="Most loved"
        posts={top}
        emptyMessage="No trending posts yet."
      />
    </div>
  );
}

type PostCollectionProps = {
  title: string;
  posts: FeedPost[];
  emptyMessage: string;
};

function PostCollection({ title, posts, emptyMessage }: PostCollectionProps) {
  return (
    <div className={styles.glassCard}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>{title}</h3>
      </div>
      {posts.length ? (
        <div className={styles.postsGrid}>
          {posts.map((post) => (
            <article key={post.id} className={styles.postCard}>
              <div className={styles.postMedia}>
                {post.mediaUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={post.mediaUrl} alt="" />
                ) : (
                  <div className="h-full w-full bg-slate-900/60" />
                )}
              </div>
              <div className={styles.postBody}>
                <p>{post.content ?? "Visual story from this member."}</p>
                <div className="flex items-center gap-3 text-sm text-white/70">
                  <span>❤️ {post.likes ?? 0}</span>
                  <span>💬 {post.comments ?? 0}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>{emptyMessage}</div>
      )}
    </div>
  );
}

function ClipsTab({ clips }: { clips: ProfileClip[] }) {
  return (
    <div className={styles.glassCard}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>Public clips</h3>
      </div>
      {clips.length ? (
        <div className={styles.clipGrid}>
          {clips.map((clip) => (
            <div key={clip.id} className={styles.clipCard}>
              {clip.mediaUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={clip.thumbnailUrl ?? clip.mediaUrl} alt="" />
              ) : null}
              <div className={styles.clipOverlay} />
              <div className={styles.clipMeta}>
                <p>{clip.title ?? "Untitled clip"}</p>
                <small>{clip.createdAt ? new Date(clip.createdAt).toLocaleDateString() : ""}</small>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          No public clips yet. Ask capsules to auto-clip your live broadcasts.
        </div>
      )}
    </div>
  );
}

function EventsTab({ events }: { events: ProfileEvent[] }) {
  return (
    <div className={styles.glassCard}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>Events & ladders</h3>
      </div>
      {events.length ? (
        <div className={styles.eventsList}>
          {events.map((event) => (
            <div key={event.id} className={styles.eventItem}>
              <div>
                <div className="text-base font-semibold text-white">{event.name}</div>
                <div className="text-sm text-white/70">{event.summary ?? "Tournament run"}</div>
              </div>
              <div className="text-sm text-white/80">
                <div>
                  {event.stats.wins ?? 0}W · {event.stats.losses ?? 0}L
                </div>
                <div className="text-xs text-white/60">
                  {event.startedAt ? new Date(event.startedAt).toLocaleDateString() : "Pending"}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          No ladders or tournaments yet. Host one with Capsule Automations when ready.
        </div>
      )}
    </div>
  );
}

function StoreTab({ store }: { store: CapsuleSummary | null }) {
  return (
    <div className={styles.glassCard}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>Featured store</h3>
        {store ? (
          <Button variant="primary" size="sm" asChild>
            <Link href={`/capsule?capsuleId=${store.id}`}>Visit store</Link>
          </Button>
        ) : null}
      </div>
      {store ? (
        <div className={styles.storeCard}>
          <div className={styles.storeArt}>
            {store.bannerUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.bannerUrl} alt="" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-white/70">
                Showcase a banner for {store.name}
              </div>
            )}
          </div>
          <div className="text-lg font-semibold text-white">{store.name}</div>
          <p className="text-sm text-white/75">
            Pull AI-built merch walls, drops, and membership perks directly from Capsules.
          </p>
        </div>
      ) : (
        <div className={styles.emptyState}>
          Feature one of your capsules to showcase the store that best represents your vibe.
        </div>
      )}
    </div>
  );
}

export default ProfilePageClient;
