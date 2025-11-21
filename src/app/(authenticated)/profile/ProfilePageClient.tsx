"use client";

import * as React from "react";
import Link from "next/link";
import {
  Eye,
  EyeSlash,
  LockSimple,
  PaperPlaneTilt,
  ShareNetwork,
  Sparkle,
  UsersThree,
  UserPlus,
} from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { friendsActions } from "@/lib/friends/store";
import { requestChatStart } from "@/components/providers/ChatProvider";
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

type StatsVisibility = ProfilePageData["privacy"]["statsVisibility"];

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
      <div className={styles.profileSurface}>
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className={styles.profileTabs}
          variant="pill"
          size="md"
        >
          <section className={styles.hero}>
            <div className={styles.heroInner}>
              <div className={styles.heroTexture} aria-hidden />
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
                  <p className={styles.heroBio}>
                    {data.user.bio?.trim().length
                      ? data.user.bio
                      : "Crafting memories, capsules, and tournaments with AI copilots."}
                  </p>
                </div>
              </div>

              <ProfileActions data={data} canonicalPath={canonicalPath} />

              <div className={styles.tabBar}>
                <TabsList className={styles.tabList}>
                  <TabsTrigger className={styles.tabTrigger} value="overview">
                    Overview
                  </TabsTrigger>
                  <TabsTrigger className={styles.tabTrigger} value="posts">
                    Posts
                  </TabsTrigger>
                  <TabsTrigger className={styles.tabTrigger} value="clips">
                    Clips
                  </TabsTrigger>
                  <TabsTrigger className={styles.tabTrigger} value="events">
                    Events
                  </TabsTrigger>
                  <TabsTrigger className={styles.tabTrigger} value="stats">
                    Stats
                  </TabsTrigger>
                  <TabsTrigger className={styles.tabTrigger} value="store">
                    Store
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>
          </section>

          <section className={styles.tabPanels}>
            <TabsContent value="overview" className={styles.tabPanel}>
              <OverviewTab data={data} />
            </TabsContent>

            <TabsContent value="posts" className={styles.tabPanel}>
              <PostsTab recent={data.posts.recent} top={data.posts.top} />
            </TabsContent>

            <TabsContent value="clips" className={styles.tabPanel}>
              <ClipsTab clips={data.clips} />
            </TabsContent>

            <TabsContent value="events" className={styles.tabPanel}>
              <EventsTab events={data.events} />
            </TabsContent>

            <TabsContent value="stats" className={styles.tabPanel}>
              <StatsTab data={data} />
            </TabsContent>

            <TabsContent value="store" className={styles.tabPanel}>
              <StoreTab store={data.featuredStore} />
            </TabsContent>
          </section>
        </Tabs>
      </div>
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

  const handleMessage = async () => {
    if (data.viewer.isSelf) return;
    setFeedback(null);
    setPending("message");
    try {
      const result = await requestChatStart(
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
          className={styles.actionButton}
          leftIcon={<UserPlus weight="duotone" />}
          disabled={data.viewer.isSelf}
          onClick={handleFollow}
          loading={pending === "follow"}
        >
          {followed ? "Following" : "Follow"}
        </Button>

        <Button
          variant="secondary"
          size="lg"
          className={styles.actionButton}
          leftIcon={<PaperPlaneTilt weight="duotone" />}
          onClick={() => {
            void handleMessage();
          }}
          disabled={data.viewer.isSelf}
          loading={pending === "message"}
        >
          Message
        </Button>

        <InviteMenu
          capsules={data.viewer.inviteOptions}
          disabled={inviteDisabled}
          targetUserId={data.user.id}
          onStatus={(message) => setFeedback(message)}
          onPending={(value) => setPending(value ? "invite" : null)}
          buttonClassName={styles.actionButton}
          buttonLoading={pending === "invite"}
        />

        <Button
          variant="secondary"
          size="lg"
          className={styles.actionButton}
          leftIcon={<ShareNetwork weight="duotone" />}
          onClick={handleShare}
          disabled={!canonicalPath}
          loading={pending === "share"}
        >
          Share profile
        </Button>
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
  buttonClassName?: string | undefined;
  buttonLoading?: boolean | undefined;
};

function InviteMenu({
  capsules,
  disabled,
  targetUserId,
  onStatus,
  onPending,
  buttonClassName,
  buttonLoading,
}: InviteMenuProps) {
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
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className={buttonClassName}
        onClick={toggle}
        disabled={disabled}
        loading={buttonLoading || Boolean(pendingCapsuleId)}
        leftIcon={<Sparkle weight="duotone" />}
      >
        Invite
      </Button>
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
                  <div className={`text-xs ${styles.textSecondary}`}>
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
            <span className={`text-xs ${styles.textSecondary}`}>{value.length}/560</span>
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
                  <div className={`h-full w-full ${styles.mediaFallback}`} />
                )}
              </div>
              <div className={styles.postBody}>
                <p>{post.content ?? "Visual story from this member."}</p>
                <div className={styles.postMeta}>
                  <span aria-label="likes">{post.likes ?? 0} likes</span>
                  <span aria-label="comments">{post.comments ?? 0} comments</span>
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
                <div className={`text-base font-semibold ${styles.textPrimary}`}>{event.name}</div>
                <div className={`text-sm ${styles.textSecondary}`}>
                  {event.summary ?? "Tournament run"}
                </div>
              </div>
              <div className={`text-sm ${styles.textSecondary}`}>
                <div>
                  {event.stats.wins ?? 0}W A? {event.stats.losses ?? 0}L
                </div>
                <div className={`text-xs ${styles.textSecondary}`}>
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

function StatsTab({ data }: { data: ProfilePageData }) {
  const summaryMetrics = [
    { label: "Followers", value: data.stats.followers },
    { label: "Following", value: data.stats.following },
    { label: "Owned spaces", value: data.stats.spacesOwned },
  ];

  const joinedAtDate =
    typeof data.user.joinedAt === "string" ? new Date(data.user.joinedAt) : null;
  const joinedValid = joinedAtDate && !Number.isNaN(joinedAtDate.getTime());
  const membershipDays = joinedValid
    ? Math.max(1, Math.floor((Date.now() - joinedAtDate.getTime()) / 86_400_000))
    : null;
  const joinedDisplay = joinedValid
    ? joinedAtDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "?";

  const activityStats = [
    {
      label: "Posts highlighted",
      value: data.posts.recent.length + data.posts.top.length,
    },
    { label: "Clips saved", value: data.clips.length },
    { label: "Events tracked", value: data.events.length },
  ];

  const spacePreview = data.spaces.slice(0, 3);
  const viewerOwnsProfile = data.viewer.isSelf;
  const [statsVisibility, setStatsVisibility] = React.useState<StatsVisibility>(
    data.privacy.statsVisibility,
  );
  const [privacyPending, setPrivacyPending] = React.useState(false);
  const [privacyFeedback, setPrivacyFeedback] = React.useState<string | null>(null);
  const requestRef = React.useRef<AbortController | null>(null);
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (requestRef.current) {
        requestRef.current.abort();
        requestRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    setStatsVisibility(data.privacy.statsVisibility);
  }, [data.privacy.statsVisibility]);

  const effectiveVisibility = viewerOwnsProfile ? statsVisibility : data.privacy.statsVisibility;
  const statsHiddenForViewer = effectiveVisibility === "private" && !viewerOwnsProfile;

  const handleVisibilityChange = React.useCallback(
    async (next: StatsVisibility) => {
      if (!viewerOwnsProfile) return;
      if (next === statsVisibility) return;
      if (requestRef.current) {
        requestRef.current.abort();
      }
      const controller = new AbortController();
      requestRef.current = controller;
      setPrivacyPending(true);
      setPrivacyFeedback(null);
      try {
        const response = await fetch("/api/account/profile/privacy", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ statsVisibility: next }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(text || "Unable to update stats privacy.");
        }
        const payload = (await response.json().catch(() => ({}))) as {
          statsVisibility?: StatsVisibility;
        };
        if (!mountedRef.current) return;
        const resolved: StatsVisibility =
          payload?.statsVisibility === "private" ? "private" : "public";
        setStatsVisibility(resolved);
        setPrivacyFeedback(
          resolved === "private"
            ? "Stats hidden from other members."
            : "Stats are visible to everyone.",
        );
      } catch (error) {
        if (controller.signal.aborted || !mountedRef.current) return;
        const message =
          error instanceof Error && error.message
            ? error.message
            : "Unable to update stats privacy.";
        setPrivacyFeedback(message);
      } finally {
        if (requestRef.current === controller) {
          requestRef.current = null;
        }
        if (!controller.signal.aborted && mountedRef.current) {
          setPrivacyPending(false);
        }
      }
    },
    [viewerOwnsProfile, statsVisibility],
  );

  return (
    <div className={styles.statsGrid}>
      {viewerOwnsProfile ? (
        <StatsPrivacyControls
          visibility={statsVisibility}
          pending={privacyPending}
          feedback={privacyFeedback}
          onChange={handleVisibilityChange}
        />
      ) : null}

      {statsHiddenForViewer ? (
        <div className={styles.statsPrivacyNotice}>
          <span className={styles.statsPrivacyNoticeIcon} aria-hidden>
            <LockSimple size={24} weight="duotone" />
          </span>
          <div>
            <h4>Stats are private</h4>
            <p>
              {data.user.name?.trim().length ? data.user.name : "This member"} hides their stats
              from other viewers.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.statPanel}>
            {summaryMetrics.map((metric) => (
              <Stat key={metric.label} label={metric.label} value={metric.value} />
            ))}
          </div>

          <div className={styles.statInfoGrid}>
            <section className={styles.statInfoCard}>
              <h4>Membership</h4>
              <dl>
                <div>
                  <dt>Member since</dt>
                  <dd>{joinedDisplay}</dd>
                </div>
                <div>
                  <dt>Days on Capsules</dt>
                  <dd>{membershipDays ? membershipDays.toLocaleString() : "--"}</dd>
                </div>
              </dl>
            </section>

            <section className={styles.statInfoCard}>
              <h4>Activity pulse</h4>
              <dl>
                {activityStats.map((item) => (
                  <div key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>{item.value.toLocaleString()}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className={styles.statInfoCard}>
              <h4>Owned spaces</h4>
              {spacePreview.length ? (
                <ul className={styles.statSpaceList}>
                  {spacePreview.map((space) => (
                    <li key={space.id}>
                      <span>{space.name}</span>
                      <small>{space.slug ? `capsules.app/${space.slug}` : "Private space"}</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.statDescription}>No published spaces yet.</p>
              )}
            </section>
          </div>

          {viewerOwnsProfile && statsVisibility === "private" ? (
            <p className={styles.statsPrivacyHint}>Only you can see these metrics.</p>
          ) : null}
        </>
      )}
    </div>
  );
}

type StatsPrivacyControlsProps = {
  visibility: StatsVisibility;
  pending: boolean;
  feedback: string | null;
  onChange: (value: StatsVisibility) => void;
};

function StatsPrivacyControls({
  visibility,
  pending,
  feedback,
  onChange,
}: StatsPrivacyControlsProps) {
  const options: Array<{
    value: StatsVisibility;
    label: string;
    description: string;
    icon: React.ReactNode;
  }> = [
    {
      value: "public",
      label: "Public",
      description: "Everyone on Capsules can view this stats grid.",
      icon: <Eye size={18} weight="duotone" />,
    },
    {
      value: "private",
      label: "Private",
      description: "Only you can view these metrics.",
      icon: <EyeSlash size={18} weight="duotone" />,
    },
  ];

  return (
    <section className={styles.statsPrivacyShell}>
      <div className={styles.statsPrivacyHeader}>
        <div>
          <h4>Stats visibility</h4>
          <p>Control who can view your follower counts and activity grid.</p>
        </div>
      </div>
      <div
        className={styles.statsPrivacyToggleGroup}
        role="radiogroup"
        aria-label="Profile stats visibility"
      >
        {options.map((option) => {
          const active = visibility === option.value;
          const disabled = pending || active;
          return (
            <button
              type="button"
              key={option.value}
              className={`${styles.statsPrivacyToggle} ${
                active ? styles.statsPrivacyToggleActive : ""
              }`.trim()}
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              disabled={disabled}
            >
              <span className={styles.statsPrivacyIcon} aria-hidden>
                {option.icon}
              </span>
              <span className={styles.statsPrivacyCopy}>
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
            </button>
          );
        })}
      </div>
      {feedback ? <p className={styles.statsPrivacyStatus}>{feedback}</p> : null}
    </section>
  );
}function StoreTab({ store }: { store: CapsuleSummary | null }) {
  return (
    <div className={styles.glassCard}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>Featured store</h3>
        {store ? (
          <Button variant="primary" size="sm" asChild>
            <Link href={`/capsule?capsuleId=${encodeURIComponent(store.id)}&tab=store`}>
              Visit store
            </Link>
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
              <div
                className={`flex h-full w-full items-center justify-center ${styles.textSecondary}`}
              >
                Showcase a banner for {store.name}
              </div>
            )}
          </div>
          <div className={`text-lg font-semibold ${styles.textPrimary}`}>{store.name}</div>
          <p className={`text-sm ${styles.textSecondary}`}>
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





