"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  PencilSimple,
  Trash,
  Check,
  Broadcast,
  Newspaper,
  Storefront,
  ShareFat,
  UsersThree,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import { AiPrompterStage } from "@/components/ai-prompter-stage";
import { CapsuleMembersPanel } from "@/components/capsule/CapsuleMembersPanel";
import { useComposer } from "@/components/composer/ComposerProvider";
import { HomeFeedList } from "@/components/home-feed-list";
import homeStyles from "@/components/home.module.css";
import { useCapsuleFeed } from "@/hooks/useHomeFeed";
import { useCapsuleMembership } from "@/hooks/useCapsuleMembership";
import { useCurrentUser } from "@/services/auth/client";
import capTheme from "@/app/(authenticated)/capsule/capsule.module.css";
import { CapsuleBannerCustomizer } from "./CapsuleBannerCustomizer";

type CapsuleTab = "live" | "feed" | "store";
type FeedTargetDetail = { scope?: string | null; capsuleId?: string | null };
const FEED_TARGET_EVENT = "composer:feed-target";

export type CapsuleContentProps = {
  capsuleId?: string | null;
  capsuleName?: string | null;
};

const HERO_LINKS = ["Featured", "Members", "Events", "Media", "Files"] as const;

// The banner now provides only the visual header. Tabs were moved below it.
export function CapsuleContent({
  capsuleId: capsuleIdProp,
  capsuleName: capsuleNameProp,
}: CapsuleContentProps = {}) {
  const composer = useComposer();
  const [tab, setTab] = React.useState<CapsuleTab>("feed");
  const [capsuleId, setCapsuleId] = React.useState<string | null>(() => capsuleIdProp ?? null);
  const [capsuleName, setCapsuleName] = React.useState<string | null>(() => capsuleNameProp ?? null);
  const [bannerCustomizerOpen, setBannerCustomizerOpen] = React.useState(false);
  const router = useRouter();
  const { user } = useCurrentUser();
  const [membersOpen, setMembersOpen] = React.useState(false);
  const {
    membership,
    loading: membershipLoading,
    error: membershipError,
    mutatingAction: membershipMutatingAction,
    requestJoin,
    approveRequest,
    declineRequest,
    removeMember,
    refresh: refreshMembership,
    setError: setMembershipError,
  } = useCapsuleMembership(capsuleId);

  React.useEffect(() => {
    const initialEvent = new CustomEvent("capsule:tab", { detail: { tab: "feed" as CapsuleTab } });
    window.dispatchEvent(initialEvent);
  }, []);

  React.useEffect(() => {
    if (typeof capsuleIdProp !== "undefined") {
      setCapsuleId(capsuleIdProp ?? null);
      return;
    }

    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const queryId =
      params.get("capsuleId") ??
      params.get("capsule_id") ??
      params.get("capsule") ??
      params.get("id");
    let resolved = queryId ?? null;
    if (!resolved && typeof document !== "undefined") {
      const fromBody = document.body?.dataset?.capsuleId;
      if (fromBody && fromBody.trim().length) {
        resolved = fromBody;
      } else {
        const metaSource = document.querySelector<HTMLElement>("[data-capsule-id]");
        const attr = metaSource?.getAttribute("data-capsule-id");
        if (attr && attr.trim().length) {
          resolved = attr;
        }
      }
    }
    setCapsuleId(resolved && resolved.trim().length ? resolved.trim() : null);
  }, [capsuleIdProp]);

  React.useEffect(() => {
    setMembersOpen(false);
    setMembershipError(null);
  }, [capsuleId, setMembershipError]);

  React.useEffect(() => {
    if (membersOpen) {
      setMembershipError(null);
    }
  }, [membersOpen, setMembershipError]);

  const viewer = membership?.viewer ?? null;
  const isAuthenticated = Boolean(user);
  const pendingCount = viewer?.isOwner ? membership?.counts.pendingRequests ?? 0 : 0;
  const handleSignIn = React.useCallback(() => {
    if (typeof window === "undefined") return;
    const redirectUrl = `${window.location.pathname}${window.location.search}` || "/capsule";
    router.push(`/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`);
  }, [router]);
  const openMembers = React.useCallback(() => {
    setMembersOpen(true);
  }, []);
  const toggleMembers = React.useCallback(() => {
    setMembersOpen((prev) => !prev);
  }, []);
  const sendMembershipRequest = React.useCallback(() => {
    void requestJoin().catch(() => {});
  }, [requestJoin]);
  const handleRefreshMembership = React.useCallback(
    () => refreshMembership().catch(() => {}),
    [refreshMembership],
  );
  const handleApproveRequest = React.useCallback(
    (requestId: string) => approveRequest(requestId).catch(() => {}),
    [approveRequest],
  );
  const handleDeclineRequest = React.useCallback(
    (requestId: string) => declineRequest(requestId).catch(() => {}),
    [declineRequest],
  );
  const handleRemoveMember = React.useCallback(
    (memberId: string) => removeMember(memberId).catch(() => {}),
    [removeMember],
  );
  const heroPrimary = React.useMemo<{
    label: string;
    disabled: boolean;
    onClick: (() => void) | null;
  }>(() => {
    if (!capsuleId) {
      return { label: "Request to Join", disabled: true, onClick: null };
    }
    if (!viewer) {
      if (membershipLoading) {
        return { label: "Loading…", disabled: true, onClick: null };
      }
      if (!isAuthenticated) {
        return { label: "Sign in to Join", disabled: false, onClick: handleSignIn };
      }
      if (membershipMutatingAction === "request_join") {
        return { label: "Sending Request…", disabled: true, onClick: null };
      }
      return { label: "Request to Join", disabled: false, onClick: sendMembershipRequest };
    }
    if (viewer.isOwner) {
      return {
        label: "Manage Members",
        disabled: membershipLoading,
        onClick: openMembers,
      };
    }
    if (viewer.isMember) {
      return {
        label: "View Members",
        disabled: false,
        onClick: openMembers,
      };
    }
    if (!viewer.userId) {
      return { label: "Sign in to Join", disabled: false, onClick: handleSignIn };
    }
    if (viewer.requestStatus === "pending") {
      return { label: "Request Pending", disabled: true, onClick: null };
    }
    if (membershipMutatingAction === "request_join") {
      return { label: "Sending Request…", disabled: true, onClick: null };
    }
    const label = viewer.requestStatus === "declined" ? "Request Again" : "Request to Join";
    if (!viewer.canRequest) {
      return { label, disabled: true, onClick: null };
    }
    return { label, disabled: false, onClick: sendMembershipRequest };
  }, [
    capsuleId,
    viewer,
    membershipLoading,
    membershipMutatingAction,
    isAuthenticated,
    handleSignIn,
    openMembers,
    sendMembershipRequest,
  ]);
  const showMembersBadge = Boolean(viewer?.isOwner && pendingCount > 0);
  const membershipErrorVisible = membershipError && !membersOpen ? membershipError : null;

  React.useEffect(() => {
    if (typeof capsuleNameProp !== "undefined") {
      const trimmed =
        typeof capsuleNameProp === "string" ? capsuleNameProp.trim() : null;
      setCapsuleName(trimmed && trimmed.length ? trimmed : null);
      return;
    }

    const resolveNameFromDom = () => {
      if (typeof document === "undefined") return null;
      const fromBody = document.body?.dataset?.capsuleName;
      if (fromBody && fromBody.trim().length) {
        return fromBody.trim();
      }
      const metaSource = document.querySelector<HTMLElement>("[data-capsule-name]");
      const attr = metaSource?.getAttribute("data-capsule-name");
      if (attr && attr.trim().length) {
        return attr.trim();
      }
      return null;
    };

    if (!capsuleName) {
      const inferred = resolveNameFromDom();
      if (inferred) {
        setCapsuleName(inferred);
      }
    }

    if (typeof window === "undefined") return;
    const handleLiveChat = (event: Event) => {
      const detail = (event as CustomEvent<{ capsuleName?: string | null }>).detail ?? {};
      const nextName =
        typeof detail.capsuleName === "string" ? detail.capsuleName.trim() : null;
      if (nextName) {
        setCapsuleName(nextName);
      }
    };
    window.addEventListener("capsule:live-chat", handleLiveChat);
    return () => {
      window.removeEventListener("capsule:live-chat", handleLiveChat);
    };
  }, [capsuleNameProp, capsuleName]);

  const handleSelect = (next: CapsuleTab) => {
    setTab(next);
    const ev = new CustomEvent("capsule:tab", { detail: { tab: next } });
    window.dispatchEvent(ev);
  };

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const detail: FeedTargetDetail =
      tab === "feed" ? { scope: "capsule", capsuleId } : { scope: "home" };
    window.dispatchEvent(new CustomEvent(FEED_TARGET_EVENT, { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent(FEED_TARGET_EVENT, { detail: { scope: "home" } }));
    };
  }, [tab, capsuleId]);

  // Render chips only on the Feed tab. Hide on Live/Store.
  const prompter = (
    <AiPrompterStage
      {...(tab === "feed" ? {} : { chips: [] })}
      onAction={composer.handlePrompterAction}
    />
  );

  const normalizedCapsuleName = React.useMemo(() => {
    if (typeof capsuleName !== "string") return null;
    const trimmed = capsuleName.trim();
    return trimmed.length ? trimmed : null;
  }, [capsuleName]);

  const feedTabLabel = normalizedCapsuleName ?? "Feed";
  const feedTabAriaLabel = normalizedCapsuleName ? `${normalizedCapsuleName} feed` : "Capsule feed";

  const LiveArea = (
    <div className={capTheme.liveWrap} data-view={tab}>
      {/* Top: primary tabs */}
      <div className={capTheme.tabStrip} role="tablist" aria-label="Capsule sections">
        <button
          className={tab === "live" ? `${capTheme.tab} ${capTheme.tabActive}` : capTheme.tab}
          role="tab"
          aria-selected={tab === "live"}
          onClick={() => handleSelect("live")}
        >
          <Broadcast size={18} weight="bold" className={capTheme.tabIcon} />
          Live
        </button>
        <button
          className={tab === "feed" ? `${capTheme.tab} ${capTheme.tabActive}` : capTheme.tab}
          role="tab"
          aria-selected={tab === "feed"}
          aria-label={feedTabAriaLabel}
          title={normalizedCapsuleName ?? undefined}
          onClick={() => handleSelect("feed")}
        >
          <Newspaper size={18} weight="bold" className={capTheme.tabIcon} />
          {feedTabLabel}
        </button>
        <button
          className={tab === "store" ? `${capTheme.tab} ${capTheme.tabActive}` : capTheme.tab}
          role="tab"
          aria-selected={tab === "store"}
          onClick={() => handleSelect("store")}
        >
          <Storefront size={18} weight="bold" className={capTheme.tabIcon} />
          Store
        </button>
      </div>

      {tab === "feed" ? (
        <>
          <CapsuleHero
            capsuleName={normalizedCapsuleName}
            onCustomize={() => setBannerCustomizerOpen(true)}
            primaryAction={heroPrimary}
            membersOpen={membersOpen}
            showMembersBadge={showMembersBadge}
            pendingCount={pendingCount}
            onToggleMembers={toggleMembers}
            errorMessage={membershipErrorVisible}
          />
          <CapsuleMembersPanel
            open={membersOpen}
            membership={membership ?? null}
            loading={membershipLoading}
            error={membershipError ?? null}
            mutatingAction={membershipMutatingAction}
            onClose={() => setMembersOpen(false)}
            onRefresh={handleRefreshMembership}
            onApprove={handleApproveRequest}
            onDecline={handleDeclineRequest}
            onRemove={handleRemoveMember}
          />
        </>
      ) : null}

      {/* Middle: canvas that grows, then prompter */}
      {tab === "feed" ? (
        <>
          <div className={capTheme.prompterTop}>{prompter}</div>
          <div
            className={`${capTheme.liveCanvas} ${capTheme.feedCanvas}`}
            aria-label="Capsule feed"
            data-capsule-id={capsuleId ?? undefined}
          >
            <CapsuleFeed capsuleId={capsuleId} capsuleName={normalizedCapsuleName} />
          </div>
        </>
      ) : (
        <>
          {tab === "live" ? (
            <div className={capTheme.liveCanvas} aria-label="Live stream area">
              <LiveStreamCanvas />
            </div>
          ) : (
            <>
              <StorePlaceholder />
              <div className={capTheme.prompterBelow}>{prompter}</div>
            </>
          )}
        </>
      )}
    </div>
  );

  return (
    <>
      {LiveArea}
      {tab === "live" ? <div className={capTheme.prompterBelow}>{prompter}</div> : null}
      {tab !== "feed" ? (
        <>
          {/* Keep the lower banner + sections off the feed tab */}
          <div className={capTheme.bannerBottom} />
          <CapsuleSections />
        </>
      ) : null}
      {bannerCustomizerOpen ? (
        <CapsuleBannerCustomizer
          open
          capsuleId={capsuleId}
          capsuleName={normalizedCapsuleName}
          onClose={() => setBannerCustomizerOpen(false)}
        />
      ) : null}
    </>
  );
}

type CapsuleHeroProps = {
  capsuleName: string | null;
  onCustomize?: () => void;
  primaryAction: {
    label: string;
    disabled: boolean;
    onClick: (() => void) | null;
  };
  membersOpen: boolean;
  showMembersBadge: boolean;
  pendingCount: number;
  onToggleMembers: () => void;
  errorMessage?: string | null;
};

function CapsuleHero({
  capsuleName,
  onCustomize,
  primaryAction,
  membersOpen,
  showMembersBadge,
  pendingCount,
  onToggleMembers,
  errorMessage,
}: CapsuleHeroProps) {
  const displayName = capsuleName ?? "Customize this capsule";
  return (
    <div className={capTheme.heroWrap}>
      <div className={capTheme.heroBanner} role="img" aria-label="Capsule banner preview">
        <button
          type="button"
          className={capTheme.heroCustomizeBtn}
          aria-label="Customize capsule banner"
          onClick={() => {
            onCustomize?.();
          }}
        >
          <PencilSimple size={16} weight="bold" />
          Customize banner
        </button>
      </div>
        <div className={capTheme.heroBody}>
          <div className={capTheme.heroDetails}>
            <h2 className={capTheme.heroTitle}>{displayName}</h2>
            <p className={capTheme.heroSubtitle}>Highlight what makes this capsule special.</p>
          </div>
          <div className={capTheme.heroActions}>
            <button
              type="button"
              className={`${capTheme.heroAction} ${capTheme.heroActionPrimary}`}
              onClick={primaryAction.onClick ?? undefined}
              disabled={primaryAction.disabled}
            >
              <UsersThree size={16} weight="bold" />
              {primaryAction.label}
            </button>
            <button type="button" className={`${capTheme.heroAction} ${capTheme.heroActionSecondary}`}>
              <ShareFat size={16} weight="bold" />
              Share
            </button>
          </div>
          {errorMessage ? (
            <div className={capTheme.membersNotice}>
              <WarningCircle size={16} weight="bold" />
              <span>{errorMessage}</span>
            </div>
          ) : null}
        </div>
        <nav className={capTheme.heroTabs} aria-label="Capsule quick links">
          {HERO_LINKS.map((label, index) => {
            const isMembersLink = label === "Members";
            const isActive = isMembersLink ? membersOpen : !membersOpen && index === 0;
            const className = isActive
              ? `${capTheme.heroTab} ${capTheme.heroTabActive}`
              : capTheme.heroTab;
            return (
              <button
                key={label}
                type="button"
                className={className}
                onClick={isMembersLink ? onToggleMembers : undefined}
              >
                {label}
                {isMembersLink && showMembersBadge ? (
                  <span className={capTheme.heroTabBadge}>{pendingCount}</span>
                ) : null}
              </button>
            );
          })}
        </nav>
    </div>
  );
}

function LiveStreamCanvas() {
  // Placeholder canvas that fits a 16:9 stream inside the available area
  // When wired to a real player, replace the inner element with the player.
  return (
    <div className={capTheme.streamStage}>
      <div className={capTheme.streamSurface} role="img" aria-label="Live stream placeholder">
        <div className={capTheme.streamOverlay}>
          <span className={capTheme.streamBadge} aria-hidden>
            LIVE
          </span>
          <span className={capTheme.streamStatus}>Stream preview</span>
        </div>
        <div className={capTheme.streamMessage}>
          <p className={capTheme.streamMessageTitle}>Waiting for your broadcast</p>
          <p className={capTheme.streamMessageSubtitle}>
            Start streaming from your encoder or studio. Once the signal arrives, your show will appear here.
          </p>
        </div>
      </div>
    </div>
  );
}

function CapsuleFeed({ capsuleId, capsuleName }: { capsuleId: string | null; capsuleName: string | null }) {
  const {
    posts,
    likePending,
    memoryPending,
    activeFriendTarget,
    friendActionPending,
    handleToggleLike,
    handleToggleMemory,
    handleFriendRequest,
    handleDelete,
    handleFriendRemove,
    setActiveFriendTarget,
    formatCount,
    timeAgo,
    exactTime,
    canRemember,
    hasFetched,
    isRefreshing,
    friendMessage,
  } = useCapsuleFeed(capsuleId);

  const emptyMessage = capsuleName
    ? `No posts in ${capsuleName} yet. Be the first to share an update.`
    : "No posts in this capsule yet. Be the first to share an update.";

  return (
    <section className={`${homeStyles.feed} ${capTheme.feedWrap}`.trim()}>
      {friendMessage && hasFetched ? <div className={homeStyles.postFriendNotice}>{friendMessage}</div> : null}
      <HomeFeedList
        posts={posts}
        likePending={likePending}
        memoryPending={memoryPending}
        activeFriendTarget={activeFriendTarget}
        friendActionPending={friendActionPending}
        onToggleLike={handleToggleLike}
        onToggleMemory={handleToggleMemory}
        onFriendRequest={handleFriendRequest}
        onDelete={handleDelete}
        onRemoveFriend={handleFriendRemove}
        onToggleFriendTarget={setActiveFriendTarget}
        formatCount={formatCount}
        timeAgo={timeAgo}
        exactTime={exactTime}
        canRemember={canRemember}
        hasFetched={hasFetched}
        isRefreshing={isRefreshing}
        emptyMessage={emptyMessage}
      />
    </section>
  );
}

function StorePlaceholder() {
  return (
    <div className={capTheme.placeholderCard}>
      <h3 className={capTheme.placeholderTitle}>Capsule Store</h3>
      <p className={capTheme.placeholderText}>Products and offers will appear here.</p>
    </div>
  );
}

type Section = { id: string; title: string };

function CapsuleSections() {
  const [sections, setSections] = React.useState<Section[]>([
    { id: "about", title: "About" },
    { id: "schedule", title: "Schedule" },
    { id: "sponsors", title: "Sponsors" },
  ]);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draftTitle, setDraftTitle] = React.useState<string>("");

  const startEdit = (id: string, current: string) => {
    setEditingId(id);
    setDraftTitle(current);
  };
  const confirmEdit = () => {
    if (!editingId) return;
    setSections((prev) => prev.map((s) => (s.id === editingId ? { ...s, title: draftTitle.trim() || s.title } : s)));
    setEditingId(null);
    setDraftTitle("");
  };
  const remove = (id: string) => setSections((prev) => prev.filter((s) => s.id !== id));
  const add = () => {
    const id = `section_${Math.random().toString(36).slice(2, 8)}`;
    const title = "New Section";
    setSections((prev) => [...prev, { id, title }]);
    setEditingId(id);
    setDraftTitle(title);
  };

  return (
    <div className={capTheme.sectionsGrid}>
      {sections.map((s) => (
        <div key={s.id} className={capTheme.sectionTile}>
          <div className={capTheme.sectionTileHeader}>
            {editingId === s.id ? (
              <input
                className={capTheme.sectionTitleInput}
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmEdit();
                }}
                autoFocus
              />
            ) : (
              <h4 className={capTheme.sectionTileTitle}>{s.title}</h4>
            )}
            <div className={capTheme.sectionTileActions}>
              {editingId === s.id ? (
                <button className={capTheme.iconBtn} onClick={confirmEdit} aria-label="Save section title">
                  <Check size={16} weight="bold" />
                </button>
              ) : (
                <button
                  className={capTheme.iconBtn}
                  onClick={() => startEdit(s.id, s.title)}
                  aria-label="Rename section"
                >
                  <PencilSimple size={16} weight="bold" />
                </button>
              )}
              <button className={capTheme.iconBtn} onClick={() => remove(s.id)} aria-label="Delete section">
                <Trash size={16} weight="bold" />
              </button>
            </div>
          </div>
          <div className={capTheme.sectionTileBody}>Customize this area…</div>
        </div>
      ))}
      <button className={capTheme.sectionAdd} type="button" onClick={add} aria-label="Add section">
        <Plus size={18} weight="bold" />
        Add section
      </button>
    </div>
  );
}
