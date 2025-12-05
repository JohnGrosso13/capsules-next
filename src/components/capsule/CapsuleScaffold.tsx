"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Broadcast,
  CaretDown,
  DoorOpen,
  MagicWand,
  ImageSquare,
  Newspaper,
  PencilSimple,
  UserPlus,
  Storefront,
  ShareFat,
  UsersThree,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import MuxPlayer from "@mux/mux-player-react";
import { AiPrompterStage, type PrompterChip } from "@/components/ai-prompter-stage";
import { CapsuleMembersPanel } from "@/components/capsule/CapsuleMembersPanel";
import { CapsuleEventsSection } from "@/components/capsule/CapsuleEventsSection";
import { useComposerActions } from "@/components/composer/ComposerProvider";
import { Button } from "@/components/ui/button";
import { HomeFeedList } from "@/components/home-feed-list";
import { FeedSurface } from "@/components/feed-surface";
import type { HomeFeedPost } from "@/hooks/useHomeFeed";
import {
  buildDocumentCardData,
  buildPrompterAttachment,
  DocumentAttachmentCard,
  type DocumentAttachmentSource,
  type DocumentCardData,
} from "@/components/documents/document-card";
import feedStyles from "@/components/home-feed.module.css";
import { useCapsuleFeed, formatFeedCount } from "@/hooks/useHomeFeed";
import { useCapsuleLadders } from "@/hooks/useCapsuleLadders";
import { useCapsuleMembership } from "@/hooks/useCapsuleMembership";
import { useCurrentUser } from "@/services/auth/client";
import capTheme from "@/app/(authenticated)/capsule/capsule.module.css";
import memberStyles from "./CapsuleMembersPanel.module.css";
import {
  CapsuleBannerCustomizer,
  CapsuleLogoCustomizer,
  CapsuleStoreBannerCustomizer,
  CapsuleTileCustomizer,
} from "./CapsuleCustomizer";
import { useCapsuleLibrary, type CapsuleLibraryItem } from "@/hooks/useCapsuleLibrary";
import { useCapsuleHistory } from "@/hooks/useCapsuleHistory";
import CapsuleHistoryCuration from "./CapsuleHistoryCuration";
import CapsuleWikiView from "./CapsuleWikiView";
import { fetchViewerLiveStream } from "@/lib/mux/liveClient";
import { CapsuleStoreView } from "./CapsuleStoreView";

type CapsuleTab = "live" | "feed" | "store";
type FeedTargetDetail = { scope?: string | null; capsuleId?: string | null };
const FEED_TARGET_EVENT = "composer:feed-target";
const LIGHTBOX_EVENT_NAME = "capsules:lightbox:open";
type CapsuleHeroSection = "featured" | "events" | "history" | "media" | "files";
export type CapsuleContentProps = {
  capsuleId?: string | null;
  capsuleName?: string | null;
};

const HERO_LINKS = ["Featured", "Members", "History", "Events", "Media", "Files"] as const;
// The banner now provides only the visual header. Tabs were moved below it.
export function CapsuleContent({
  capsuleId: capsuleIdProp,
  capsuleName: capsuleNameProp,
}: CapsuleContentProps = {}) {
  const composer = useComposerActions();
  const [tab, setTab] = React.useState<CapsuleTab>("feed");
  const [capsuleId, setCapsuleId] = React.useState<string | null>(() => capsuleIdProp ?? null);
  const [capsuleName, setCapsuleName] = React.useState<string | null>(
    () => capsuleNameProp ?? null,
  );
  const [bannerCustomizerOpen, setBannerCustomizerOpen] = React.useState(false);
  const [tileCustomizerOpen, setTileCustomizerOpen] = React.useState(false);
  const [logoCustomizerOpen, setLogoCustomizerOpen] = React.useState(false);
  const [storeCustomizerOpen, setStoreCustomizerOpen] = React.useState(false);
  const [bannerUrlOverride, setBannerUrlOverride] = React.useState<string | null>(null);
  const [storeBannerUrlOverride, setStoreBannerUrlOverride] = React.useState<string | null>(null);
  const router = useRouter();
  const { user } = useCurrentUser();
  const [membersOpen, setMembersOpen] = React.useState(false);
  const [heroSection, setHeroSection] = React.useState<CapsuleHeroSection>("featured");
  const {
    membership,
    loading: membershipLoading,
    error: membershipError,
    mutatingAction: membershipMutatingAction,
    requestJoin,
    approveRequest,
    declineRequest,
    removeMember,
    setMemberRole,
    setMembershipPolicy,
    follow: followCapsule,
    unfollow: unfollowCapsule,
    leave,
    inviteMember,
    refresh: refreshMembership,
    setError: setMembershipError,
  } = useCapsuleMembership(capsuleId);
  const {
    media: capsuleMedia,
    files: capsuleFiles,
    loading: libraryLoading,
    error: libraryError,
    refresh: refreshLibrary,
  } = useCapsuleLibrary(capsuleId);
  const {
    ladders: capsuleLadders,
    tournaments: capsuleTournaments,
    loading: laddersLoading,
    error: laddersError,
    refresh: refreshLadders,
  } = useCapsuleLadders(capsuleId);

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
  const canCustomize = Boolean(viewer?.canCustomize ?? viewer?.isOwner);
  const isAuthenticated = Boolean(user);
  const handleSignIn = React.useCallback(() => {
    if (typeof window === "undefined") return;
    const redirectUrl = `${window.location.pathname}${window.location.search}` || "/capsule";
    router.push(`/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`);
  }, [router]);
  const showMembers = React.useCallback(() => {
    setMembersOpen(true);
    setHeroSection("featured");
  }, []);
  const showFeatured = React.useCallback(() => {
    setMembersOpen(false);
    setHeroSection("featured");
  }, []);
  const showEvents = React.useCallback(() => {
    setMembersOpen(false);
    setHeroSection("events");
  }, []);
  const showHistory = React.useCallback(() => {
    setMembersOpen(false);
    setHeroSection("history");
  }, []);
  const showMedia = React.useCallback(() => {
    setMembersOpen(false);
    setHeroSection("media");
  }, []);
  const showFiles = React.useCallback(() => {
    setMembersOpen(false);
    setHeroSection("files");
  }, []);
  const handleAskDocument = React.useCallback(
    (doc: DocumentCardData) => {
      const promptSegments = [`Summarize the document "${doc.name}" for the capsule.`];
      if (doc.summary) {
        promptSegments.push(`Existing summary: ${doc.summary}`);
      } else if (doc.snippet) {
        promptSegments.push(`Preview: ${doc.snippet}`);
      }
      const attachment = buildPrompterAttachment(doc);
      composer
        .submitPrompt(promptSegments.join("\n\n"), [attachment])
        .catch((error) => console.error("Document prompt submit failed", error));
    },
    [composer],
  );
  const sendMembershipRequest = React.useCallback(() => {
    void requestJoin().catch(() => {});
  }, [requestJoin]);
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
  const handleChangeMemberRole = React.useCallback(
    (memberId: string, role: string) => setMemberRole(memberId, role).catch(() => {}),
    [setMemberRole],
  );
  const handleChangeMembershipPolicy = React.useCallback(
    (policy: "open" | "request_only" | "invite_only") =>
      setMembershipPolicy(policy).catch(() => {}),
    [setMembershipPolicy],
  );
  const handleInviteMember = React.useCallback(
    (targetUserId: string) => inviteMember(targetUserId).catch(() => {}),
    [inviteMember],
  );
  const handleFollowCapsule = React.useCallback(
    () => followCapsule().catch(() => {}),
    [followCapsule],
  );
  const handleUnfollowCapsule = React.useCallback(
    () => unfollowCapsule().catch(() => {}),
    [unfollowCapsule],
  );
  const handleLeaveCapsule = React.useCallback(() => leave().catch(() => {}), [leave]);
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
    if (viewer.canManageMembers) {
      return {
        label: "Manage Members",
        disabled: membershipLoading,
        onClick: showMembers,
      };
    }
    if (viewer.isMember) {
      return {
        label: "View Members",
        disabled: false,
        onClick: showMembers,
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
    showMembers,
    sendMembershipRequest,
  ]);

  const heroFollow = React.useMemo<{
    label: string;
    disabled: boolean;
    onClick: (() => void) | null;
  } | null>(() => {
    if (!viewer || viewer.isOwner || viewer.isMember) return null;
    if (viewer.isFollower) {
      const busy = membershipMutatingAction === "unfollow";
      return {
        label: busy ? "Unfollowing..." : "Following",
        disabled: busy,
        onClick: busy ? null : handleUnfollowCapsule,
      };
    }
    if (!viewer.canFollow) return null;
    const busy = membershipMutatingAction === "follow";
    return {
      label: busy ? "Following..." : "Follow",
      disabled: busy,
      onClick: busy ? null : handleFollowCapsule,
    };
  }, [viewer, membershipMutatingAction, handleFollowCapsule, handleUnfollowCapsule]);
  const heroLeave = React.useMemo<{
    label: string;
    disabled: boolean;
    onClick: (() => void) | null;
  } | null>(() => {
    if (!viewer || viewer.isOwner || !viewer.isMember) return null;
    const busy = membershipMutatingAction === "leave";
    return {
      label: busy ? "Leaving..." : "Leave capsule",
      disabled: busy,
      onClick: busy ? null : handleLeaveCapsule,
    };
  }, [viewer, membershipMutatingAction, handleLeaveCapsule]);
  const membershipErrorVisible = membershipError && !membersOpen ? membershipError : null;
  const capsuleBannerUrl =
    bannerUrlOverride ?? (membership?.capsule ? membership.capsule.bannerUrl : null);
  const capsuleStoreBannerUrl =
    storeBannerUrlOverride ?? (membership?.capsule ? membership.capsule.storeBannerUrl : null);

  React.useEffect(() => {
    if (!canCustomize) {
      if (bannerCustomizerOpen) setBannerCustomizerOpen(false);
      if (tileCustomizerOpen) setTileCustomizerOpen(false);
      if (logoCustomizerOpen) setLogoCustomizerOpen(false);
      if (storeCustomizerOpen) setStoreCustomizerOpen(false);
    }
  }, [
    bannerCustomizerOpen,
    canCustomize,
    logoCustomizerOpen,
    storeCustomizerOpen,
    tileCustomizerOpen,
  ]);

  const lastMembershipBannerRef = React.useRef<string | null | undefined>(undefined);
  React.useEffect(() => {
    const next = membership?.capsule?.bannerUrl ?? null;
    if (lastMembershipBannerRef.current === next) {
      return;
    }
    lastMembershipBannerRef.current = next;
    setBannerUrlOverride(next);
  }, [membership?.capsule?.bannerUrl]);

  const lastMembershipStoreBannerRef = React.useRef<string | null | undefined>(undefined);
  React.useEffect(() => {
    const next = membership?.capsule?.storeBannerUrl ?? null;
    if (lastMembershipStoreBannerRef.current === next) {
      return;
    }
    lastMembershipStoreBannerRef.current = next;
    setStoreBannerUrlOverride(next);
  }, [membership?.capsule?.storeBannerUrl]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const handleStoreBannerUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ capsuleId?: string | null; storeBannerUrl?: string | null }>).detail;
      if (capsuleId && detail?.capsuleId && detail.capsuleId !== capsuleId) return;
      if (typeof detail?.storeBannerUrl === "string" || detail?.storeBannerUrl === null) {
        setStoreBannerUrlOverride(detail.storeBannerUrl ?? null);
      }
    };
    window.addEventListener("capsule:store-banner-updated", handleStoreBannerUpdate);
    return () => {
      window.removeEventListener("capsule:store-banner-updated", handleStoreBannerUpdate);
    };
  }, [capsuleId]);

  React.useEffect(() => {
    if (typeof capsuleNameProp !== "undefined") {
      const trimmed = typeof capsuleNameProp === "string" ? capsuleNameProp.trim() : null;
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
      const nextName = typeof detail.capsuleName === "string" ? detail.capsuleName.trim() : null;
      if (nextName) {
        setCapsuleName(nextName);
      }
    };
    window.addEventListener("capsule:live-chat", handleLiveChat);
    return () => {
      window.removeEventListener("capsule:live-chat", handleLiveChat);
    };
  }, [capsuleNameProp, capsuleName]);

  const handleSelect = React.useCallback((next: CapsuleTab) => {
    setTab(next);
    const ev = new CustomEvent("capsule:tab", { detail: { tab: next } });
    window.dispatchEvent(ev);
  }, []);

  const routedTab = useSearchParams()?.get("tab") ?? null;
  React.useEffect(() => {
    if (!routedTab) return;
    const normalized = routedTab.toLowerCase();
    if (normalized !== "feed" && normalized !== "live" && normalized !== "store") return;
    if (normalized === tab) return;
    handleSelect(normalized as CapsuleTab);
  }, [handleSelect, routedTab, tab]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const detail: FeedTargetDetail =
      tab === "feed" ? { scope: "capsule", capsuleId } : { scope: "home" };
    window.dispatchEvent(new CustomEvent(FEED_TARGET_EVENT, { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent(FEED_TARGET_EVENT, { detail: { scope: "home" } }));
    };
  }, [tab, capsuleId]);

  React.useEffect(() => {
    if (tab !== "feed") {
      setMembersOpen(false);
      setHeroSection("featured");
    }
  }, [tab]);
  React.useEffect(() => {
    if (heroSection === "events") {
      refreshLadders();
    }
  }, [heroSection, refreshLadders]);

  const prompterChips = React.useMemo<PrompterChip[] | undefined>(() => {
    if (tab === "feed") {
      // Use default chips for the feed surface.
      return undefined;
    }
    if (tab === "store") {
      // Store-specific intents to help set up the storefront.
      return [
        {
          label: "Plan my store layout",
          id: "capsule_store_plan_layout",
          surface: "capsule_store",
          value:
            "Help me plan the layout, sections, and calls to action for this capsule store.",
        },
        {
          label: "Write product cards",
          id: "capsule_store_product_copy",
          surface: "capsule_store",
          value:
            "Draft short, punchy product titles and descriptions for my capsule store merch.",
        },
        {
          label: "Design banner copy",
          id: "capsule_store_banner_copy",
          surface: "capsule_store",
          value:
            "Write hero banner copy that explains what this capsule store is and why visitors should care.",
        },
        {
          label: "Launch checklist",
          id: "capsule_store_launch_checklist",
          surface: "capsule_store",
          value: "Create a checklist for launching this capsule store successfully.",
        },
      ];
    }
    // Live tab: keep the prompter available but without suggested chips.
    return [];
  }, [tab]);

  const prompter = (
    <AiPrompterStage
      chips={prompterChips ?? []}
      onAction={composer.handlePrompterAction}
      onHandoff={composer.handlePrompterHandoff}
      surface={tab === "store" ? "capsule_store" : null}
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
            bannerUrl={capsuleBannerUrl}
            canCustomize={canCustomize}
            {...(canCustomize
              ? {
                  onCustomize: () => setBannerCustomizerOpen(true),
                  onCustomizeTile: () => setTileCustomizerOpen(true),
                  onCustomizeLogo: () => setLogoCustomizerOpen(true),
                }
              : {})}
            primaryAction={heroPrimary}
            followAction={heroFollow}
            leaveAction={heroLeave}
            membersOpen={membersOpen}
            activeSection={heroSection}
            onSelectMembers={showMembers}
            onSelectEvents={showEvents}
            onSelectHistory={showHistory}
            onSelectFeatured={showFeatured}
            onSelectMedia={showMedia}
            onSelectFiles={showFiles}
            errorMessage={membershipErrorVisible}
          />
          {membersOpen ? (
            <CapsuleMembersPanel
              open
              membership={membership ?? null}
              loading={membershipLoading}
              error={membershipError ?? null}
              mutatingAction={membershipMutatingAction}
              onApprove={handleApproveRequest}
              onDecline={handleDeclineRequest}
              onRemove={handleRemoveMember}
              onChangeRole={handleChangeMemberRole}
              onInvite={handleInviteMember}
              onChangePolicy={handleChangeMembershipPolicy}
              {...(heroLeave ? { onLeave: handleLeaveCapsule } : {})}
            />
          ) : (
            <>
              <div className={capTheme.prompterTop}>{prompter}</div>
              {heroSection === "events" ? (
                <CapsuleEventsSection
                  capsuleId={capsuleId ?? null}
                  ladders={capsuleLadders}
                  tournaments={capsuleTournaments}
                  loading={laddersLoading}
                  error={laddersError}
                  onRetry={refreshLadders}
                />
      ) : heroSection === "media" ? (
        <CapsuleMediaSection
          items={capsuleMedia}
          loading={libraryLoading}
          error={libraryError}
          onRetry={refreshLibrary}
                />
              ) : heroSection === "files" ? (
                <CapsuleFilesSection
                  items={capsuleFiles}
                  loading={libraryLoading}
                  error={libraryError}
                  onRetry={refreshLibrary}
                  formatCount={formatFeedCount}
                  onAsk={handleAskDocument}
                />
              ) : heroSection === "history" ? (
                <CapsuleHistorySection
                  capsuleId={capsuleId}
                  capsuleName={normalizedCapsuleName}
                  viewerIsOwner={Boolean(viewer?.canModerateContent ?? viewer?.isOwner)}
                />
              ) : (
                <div
                  className={`${capTheme.liveCanvas} ${capTheme.feedCanvas}`}
                  aria-label="Capsule feed"
                  data-capsule-id={capsuleId ?? undefined}
                >
                  <CapsuleFeed capsuleId={capsuleId} capsuleName={normalizedCapsuleName} />
                </div>
              )}
            </>
          )}
        </>
      ) : tab === "live" ? (
        <div className={capTheme.liveCanvas} aria-label="Live stream area">
          <LiveStreamCanvas capsuleId={capsuleId} capsuleName={normalizedCapsuleName} />
        </div>
      ) : (
        <CapsuleStoreView
          capsuleName={normalizedCapsuleName}
          storeBannerUrl={capsuleStoreBannerUrl}
          mode={canCustomize ? "founder" : "visitor"}
          prompter={prompter}
          {...(canCustomize ? { onCustomizeStoreBanner: () => setStoreCustomizerOpen(true) } : {})}
        />
      )}
    </div>
  );

  return (
    <>
      {LiveArea}
      {tab === "live" ? <div className={capTheme.prompterBelow}>{prompter}</div> : null}
      {canCustomize && bannerCustomizerOpen ? (
        <CapsuleBannerCustomizer
          open
          capsuleId={capsuleId}
          capsuleName={normalizedCapsuleName}
          onClose={() => setBannerCustomizerOpen(false)}
          onSaved={(result) => {
            if (result.type === "banner") {
              setBannerUrlOverride(result.bannerUrl ?? null);
            }
            void refreshMembership();
          }}
        />
      ) : null}
      {canCustomize && tileCustomizerOpen ? (
        <CapsuleTileCustomizer
          open
          capsuleId={capsuleId}
          capsuleName={normalizedCapsuleName}
          onClose={() => setTileCustomizerOpen(false)}
          onSaved={(result) => {
            if (result.type === "tile") {
              setTileCustomizerOpen(false);
              void refreshMembership();
            }
          }}
        />
      ) : null}
      {canCustomize && logoCustomizerOpen ? (
        <CapsuleLogoCustomizer
          open
          capsuleId={capsuleId}
          capsuleName={normalizedCapsuleName}
          onClose={() => setLogoCustomizerOpen(false)}
          onSaved={(result) => {
            if (result.type === "logo") {
              setLogoCustomizerOpen(false);
              void refreshMembership();
            }
          }}
        />
      ) : null}
      {canCustomize && storeCustomizerOpen ? (
        <CapsuleStoreBannerCustomizer
          open
          capsuleId={capsuleId}
          capsuleName={normalizedCapsuleName}
          onClose={() => setStoreCustomizerOpen(false)}
          onSaved={(result) => {
            if (result.type === "storeBanner") {
              setStoreBannerUrlOverride(result.storeBannerUrl ?? null);
              if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent("capsule:store-banner-updated", {
                    detail: { capsuleId, storeBannerUrl: result.storeBannerUrl ?? null },
                  }),
                );
              }
            }
            void refreshMembership();
          }}
        />
      ) : null}
    </>
  );
}

type CapsuleHeroProps = {
  capsuleName: string | null;
  bannerUrl: string | null;
  canCustomize: boolean;
  onCustomize?: () => void;
  onCustomizeTile?: () => void;
  onCustomizeLogo?: () => void;
  primaryAction: {
    label: string;
    disabled: boolean;
    onClick: (() => void) | null;
  };
  followAction?: {
    label: string;
    disabled: boolean;
    onClick: (() => void) | null;
  } | null;
  leaveAction?: {
    label: string;
    disabled: boolean;
    onClick: (() => void) | null;
  } | null;
  membersOpen: boolean;
  activeSection: CapsuleHeroSection;
  onSelectMembers: () => void;
  onSelectEvents: () => void;
  onSelectHistory: () => void;
  onSelectFeatured: () => void;
  onSelectMedia: () => void;
  onSelectFiles: () => void;
  errorMessage?: string | null;
};

function CapsuleHero({
  capsuleName,
  bannerUrl,
  canCustomize,
  onCustomize,
  onCustomizeTile,
  onCustomizeLogo,
  primaryAction,
  followAction = null,
  leaveAction = null,
  membersOpen,
  activeSection,
  onSelectMembers,
  onSelectEvents,
  onSelectHistory,
  onSelectFeatured,
  onSelectMedia,
  onSelectFiles,
  errorMessage,
}: CapsuleHeroProps) {
  const _displayName = capsuleName ?? "Customize this capsule";
  const heroBannerStyle = bannerUrl ? { backgroundImage: `url(${bannerUrl})` } : undefined;
  const [customizeMenuOpen, setCustomizeMenuOpen] = React.useState(false);
  const customizeMenuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!customizeMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!customizeMenuRef.current) return;
      if (customizeMenuRef.current.contains(event.target as Node)) return;
      setCustomizeMenuOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCustomizeMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [customizeMenuOpen]);
  return (
    <div className={capTheme.heroWrap}>
      <div
        className={capTheme.heroBanner}
        role="img"
        aria-label="Capsule banner preview"
        data-has-banner={bannerUrl ? "true" : undefined}
      >
        {bannerUrl ? (
          <div className={capTheme.heroBannerImage} style={heroBannerStyle} aria-hidden="true" />
        ) : null}
      </div>
      <div className={capTheme.heroActionsRow}>
        {canCustomize ? (
          <div className={capTheme.heroCustomizeGroup} ref={customizeMenuRef}>
            <button
              type="button"
              className={capTheme.heroCustomizeBtn}
              aria-label="Open capsule customization menu"
              onClick={() => {
                setCustomizeMenuOpen((open) => !open);
              }}
              aria-haspopup="menu"
              aria-expanded={customizeMenuOpen}
            >
              <PencilSimple size={16} weight="bold" />
              Customize visuals
              <CaretDown size={12} weight="bold" />
            </button>
            {customizeMenuOpen ? (
              <div className={capTheme.heroCustomizeMenuSurface} role="menu">
                <button
                  type="button"
                  className={capTheme.heroCustomizeMenuItem}
                  aria-label="Customize capsule banner"
                  onClick={() => {
                    onCustomize?.();
                    setCustomizeMenuOpen(false);
                  }}
                  role="menuitem"
                >
                  <PencilSimple size={16} weight="bold" />
                  <span>Customize banner</span>
                </button>
                {onCustomizeTile ? (
                  <button
                    type="button"
                    className={capTheme.heroCustomizeMenuItem}
                    aria-label="Customize promo tile"
                    onClick={() => {
                      onCustomizeTile?.();
                      setCustomizeMenuOpen(false);
                    }}
                    role="menuitem"
                  >
                    <MagicWand size={16} weight="bold" />
                    <span>Customize promo tile</span>
                  </button>
                ) : null}
                {onCustomizeLogo ? (
                  <button
                    type="button"
                    className={capTheme.heroCustomizeMenuItem}
                    aria-label="Customize capsule logo"
                    onClick={() => {
                      onCustomizeLogo?.();
                      setCustomizeMenuOpen(false);
                    }}
                    role="menuitem"
                  >
                    <ImageSquare size={16} weight="bold" />
                    <span>Customize logo</span>
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
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
          {followAction ? (
            <button
              type="button"
              className={`${capTheme.heroAction} ${capTheme.heroActionSecondary}`}
              onClick={followAction.onClick ?? undefined}
              disabled={followAction.disabled}
            >
              <UserPlus size={16} weight="bold" />
              {followAction.label}
            </button>
          ) : null}
          {leaveAction ? (
            <button
              type="button"
              className={`${capTheme.heroAction} ${capTheme.heroActionDanger}`}
              onClick={leaveAction.onClick ?? undefined}
              disabled={leaveAction.disabled}
            >
              <DoorOpen size={16} weight="bold" />
              {leaveAction.label}
            </button>
          ) : null}
          <button
            type="button"
            className={`${capTheme.heroAction} ${capTheme.heroActionSecondary}`}
          >
            <ShareFat size={16} weight="bold" />
            Share
          </button>
        </div>
      </div>
      {errorMessage ? (
        <div className={memberStyles.notice}>
          <WarningCircle size={16} weight="bold" />
          <span>{errorMessage}</span>
        </div>
      ) : null}
      <nav className={capTheme.heroTabs} aria-label="Capsule quick links">
        {HERO_LINKS.map((label) => {
          const isMembersLink = label === "Members";
          const isFeaturedLink = label === "Featured";
          const isHistoryLink = label === "History";
          const isEventsLink = label === "Events";
          const isMediaLink = label === "Media";
          const isFilesLink = label === "Files";
          const isActive = (() => {
            if (isMembersLink) return membersOpen;
            if (isHistoryLink) return !membersOpen && activeSection === "history";
            if (isEventsLink) return !membersOpen && activeSection === "events";
            if (isMediaLink) return !membersOpen && activeSection === "media";
            if (isFilesLink) return !membersOpen && activeSection === "files";
            if (isFeaturedLink) return !membersOpen && activeSection === "featured";
            return false;
          })();
          const className = isActive
            ? `${capTheme.heroTab} ${capTheme.heroTabActive}`
            : capTheme.heroTab;
          const handleClick = () => {
            if (isMembersLink) {
              onSelectMembers();
            } else if (isHistoryLink) {
              onSelectHistory();
            } else if (isEventsLink) {
              onSelectEvents();
            } else if (isMediaLink) {
              onSelectMedia();
            } else if (isFilesLink) {
              onSelectFiles();
            } else if (isFeaturedLink) {
              onSelectFeatured();
            } else {
              onSelectFeatured();
            }
          };
          return (
            <button key={label} type="button" className={className} onClick={handleClick}>
              {label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

type CapsuleLibrarySectionProps = {
  items: CapsuleLibraryItem[];
  loading: boolean;
  error: string | null;
  onRetry(): void;
};

type CapsuleFilesSectionProps = CapsuleLibrarySectionProps & {
  formatCount(value?: number | null): string;
  onAsk(doc: DocumentCardData): void;
};

function CapsuleLibraryState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <FeedSurface variant="capsule">
      <div className={capTheme.libraryState}>
        <p>{message}</p>
        {onRetry ? (
          <button type="button" className={capTheme.heroAction} onClick={onRetry}>
            Try again
          </button>
        ) : null}
      </div>
    </FeedSurface>
  );
}

function CapsuleMediaSection({ items, loading, error, onRetry }: CapsuleLibrarySectionProps) {
  if (loading) return <CapsuleLibraryState message="Loading media..." />;
  if (error) return <CapsuleLibraryState message={error} onRetry={onRetry} />;
  if (!items.length) return <CapsuleLibraryState message="No media shared yet." />;

  return (
    <FeedSurface variant="capsule">
      <div className={feedStyles.mediaGallery} data-count={items.length}>
        {items.map((item) => {
          const mime = item.mimeType?.toLowerCase() ?? "";
          const isVideo = mime.startsWith("video/");
          const isImage = mime.startsWith("image/");
          const thumbnail = item.thumbnailUrl ?? (isImage ? item.url : null);
          return (
            <div key={item.id} className={feedStyles.mediaWrapper} data-kind={isVideo ? "video" : "image"}>
              {isVideo ? (
                <video
                  className={feedStyles.media}
                  data-kind="video"
                  controls
                  playsInline
                  preload="metadata"
                  poster={thumbnail ?? undefined}
                >
                  <source src={item.url} type={item.mimeType ?? undefined} />
                  Your browser does not support the video tag.
                </video>
              ) : (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={feedStyles.mediaButton}
                  data-kind="image"
                >
                  <Image
                    className={feedStyles.media}
                    src={thumbnail ?? item.url}
                    alt={item.title ?? "Capsule media"}
                    width={1080}
                    height={1080}
                    sizes="(max-width: 640px) 100vw, 720px"
                    loading="lazy"
                    unoptimized
                  />
                </a>
              )}
            </div>
          );
        })}
      </div>
    </FeedSurface>
  );
}

function CapsuleFilesSection({ items, loading, error, onRetry, formatCount, onAsk }: CapsuleFilesSectionProps) {
  if (loading) return <CapsuleLibraryState message="Loading files..." />;
  if (error) return <CapsuleLibraryState message={error} onRetry={onRetry} />;
  if (!items.length) return <CapsuleLibraryState message="No files shared yet." />;

  const documents = items.map((item) => {
    const meta = item.meta ?? null;
    const uploadSessionId = (() => {
      if (!meta || typeof meta !== "object") return null;
      const record = meta as Record<string, unknown>;
      for (const key of ["upload_session_id", "session_id"]) {
        const value = record[key];
        if (typeof value === "string" && value.trim().length) return value.trim();
      }
      return null;
    })();
    const source: DocumentAttachmentSource = {
      id: item.id,
      url: item.url,
      name: item.title ?? null,
      mimeType: item.mimeType ?? null,
      meta,
      uploadSessionId,
    };
    return buildDocumentCardData(source);
  });

  return (
    <FeedSurface variant="capsule">
      <div className={feedStyles.documentGrid}>
        {documents.map((doc) => (
          <DocumentAttachmentCard
            key={doc.id}
            doc={doc}
            formatCount={formatCount}
            onAsk={() => onAsk(doc)}
          />
        ))}
      </div>
    </FeedSurface>
  );
}

function CapsuleHistorySection({
  capsuleId,
  capsuleName: _capsuleName,
  viewerIsOwner,
}: {
  capsuleId: string | null;
  capsuleName: string | null;
  viewerIsOwner: boolean;
}) {
  const { snapshot, loading, error, refresh } = useCapsuleHistory(capsuleId);
  const [editing, setEditing] = React.useState(false);

  const handleRefresh = React.useCallback(() => {
    void refresh(true);
  }, [refresh]);

  React.useEffect(() => {
    if (!viewerIsOwner) {
      setEditing(false);
    }
  }, [viewerIsOwner]);

  if (!capsuleId) {
    return <CapsuleLibraryState message="Select a capsule to see its history." />;
  }

  if (loading && !snapshot) {
    return <CapsuleLibraryState message="Building capsule history..." />;
  }

  if (error) {
    return <CapsuleLibraryState message={error} onRetry={handleRefresh} />;
  }

  if (!snapshot) {
    return (
      <CapsuleLibraryState message="No activity yet. Post updates to start your capsule wiki." />
    );
  }

  const sections = snapshot.sections ?? [];
  if (!sections.length) {
    return (
      <CapsuleLibraryState message="No activity yet. Post updates to start your capsule wiki." />
    );
  }

  return (
    <FeedSurface variant="capsule">
      <div className={capTheme.wikiWrap}>
        <CapsuleWikiView
          snapshot={snapshot}
          canEdit={viewerIsOwner}
          loading={loading}
          {...(viewerIsOwner ? { onEdit: () => setEditing(true) } : {})}
        />
      </div>
      {viewerIsOwner ? (
        <div className={capTheme.wikiEditor} data-open={editing ? "true" : undefined}>
          {editing ? (
            <>
              <div className={capTheme.wikiEditorHeader}>
                <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
                  Done editing
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={handleRefresh} disabled={loading}>
                  Refresh AI Draft
                </Button>
              </div>
              <CapsuleHistoryCuration
                capsuleId={capsuleId}
                snapshot={snapshot}
                loading={loading}
                error={error}
                onRefresh={refresh}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </FeedSurface>
  );
}

function LiveStreamCanvas({
  capsuleId,
  capsuleName,
}: {
  capsuleId: string | null;
  capsuleName: string | null;
}) {
  const [status, setStatus] = React.useState<string>("loading");
  const [playbackId, setPlaybackId] = React.useState<string | null>(null);
  const [latency, setLatency] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const refreshRef = React.useRef<AbortController | null>(null);

  const dispatchChatStatus = React.useCallback(
    (nextStatus: string) => {
      if (typeof window === "undefined") return;
      const detail = {
        capsuleId,
        capsuleName,
        status: nextStatus.toLowerCase() === "active" ? ("live" as const) : ("waiting" as const),
      };
      window.dispatchEvent(new CustomEvent("capsule:live-chat", { detail }));
    },
    [capsuleId, capsuleName],
  );

  const loadStream = React.useCallback(async () => {
    if (!capsuleId) {
      setStatus("idle");
      setPlaybackId(null);
      setError("Select a capsule to view its live stream.");
      return;
    }
    const controller = new AbortController();
    if (refreshRef.current) {
      refreshRef.current.abort();
    }
    refreshRef.current = controller;
    setError(null);
    try {
      const payload = await fetchViewerLiveStream({ capsuleId, signal: controller.signal });
      setPlaybackId(payload.playback.playbackId);
      setLatency(payload.liveStream.latencyMode);
      setStatus(payload.status ?? "idle");
      dispatchChatStatus(payload.status ?? "idle");
    } catch (err) {
      if (controller.signal.aborted) return;
      const message =
        err instanceof Error ? err.message : "Unable to load the live stream right now.";
      setError(message);
      setStatus("errored");
      dispatchChatStatus("waiting");
    } finally {
      if (refreshRef.current === controller) {
        refreshRef.current = null;
      }
    }
  }, [capsuleId, dispatchChatStatus]);

  React.useEffect(() => {
    void loadStream();
    const timer = window.setInterval(() => {
      void loadStream();
    }, 15000);
    return () => {
      window.clearInterval(timer);
      if (refreshRef.current) {
        refreshRef.current.abort();
      }
    };
  }, [loadStream]);

  const resolvedStatus =
    status === "active" || status === "connected"
      ? "live"
      : status === "idle"
        ? "idle"
        : status === "errored"
          ? "error"
          : "loading";

  const showPlayer = Boolean(playbackId);

  return (
    <div className={capTheme.streamStage}>
      <div className={capTheme.streamSurface} role="img" aria-label="Live stream player">
        <div className={capTheme.streamOverlay}>
          <span className={capTheme.streamBadge} aria-hidden data-status={resolvedStatus}>
            LIVE
          </span>
          <span className={capTheme.streamStatus}>
            {resolvedStatus === "live"
              ? "Streaming now"
              : resolvedStatus === "idle"
                ? "Standby"
                : resolvedStatus === "error"
                  ? "Stream unavailable"
                  : "Connecting..."}
          </span>
        </div>
        <div className={capTheme.streamMessage}>
          {showPlayer ? (
            <MuxPlayer
              playbackId={playbackId!}
              streamType="live"
              metadata={{
                video_title: capsuleName ? `${capsuleName} live stream` : "Live stream",
              }}
              style={{ width: "100%", height: "100%", borderRadius: "18px" }}
            />
          ) : (
            <>
              <p className={capTheme.streamMessageTitle}>
                {error ?? "Waiting for the broadcast"}
              </p>
              <p className={capTheme.streamMessageSubtitle}>
                {error
                  ? "We couldn't load the stream. Try again soon."
                  : "Start streaming from your encoder or studio. Once the signal arrives, it will appear here."}
              </p>
            </>
          )}
        </div>
        <div className={capTheme.streamMeta}>
          <span>Latency: {latency ?? "unknown"}</span>
          <span>Status: {status}</span>
        </div>
      </div>
    </div>
  );
}



function CapsuleFeed({
  capsuleId,
  capsuleName,
}: {
  capsuleId: string | null;
  capsuleName: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [focusPostId, setFocusPostId] = React.useState<string | null>(() => {
    const raw = searchParams?.get("postId");
    return raw && raw.trim().length ? raw.trim() : null;
  });
  const [clearedQueryParam, setClearedQueryParam] = React.useState(false);
  const [externalPost, setExternalPost] = React.useState<HomeFeedPost | null>(null);
  const [externalLoading, setExternalLoading] = React.useState(false);

  React.useEffect(() => {
    if (!capsuleId) {
      setFocusPostId(null);
      return;
    }
    const raw = searchParams?.get("postId");
    const normalized = raw && raw.trim().length ? raw.trim() : null;
    setFocusPostId((previous) => (previous === normalized ? previous : normalized));
    if (normalized) {
      setClearedQueryParam(false);
    }
  }, [capsuleId, searchParams]);

  const searchParamsString = searchParams?.toString() ?? "";
  React.useEffect(() => {
    if (!focusPostId || clearedQueryParam) return;
    if (!pathname) return;
    if (!searchParamsString.includes("postId=")) {
      setClearedQueryParam(true);
      return;
    }
    const params = new URLSearchParams(searchParamsString);
    if (!params.has("postId")) {
      setClearedQueryParam(true);
      return;
    }
    params.delete("postId");
    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    setClearedQueryParam(true);
  }, [focusPostId, clearedQueryParam, pathname, router, searchParamsString]);

  React.useEffect(() => {
    setExternalPost(null);
  }, [capsuleId]);

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
    handleFollowUser,
    handleUnfollowUser,
    setActiveFriendTarget,
    formatCount,
    timeAgo,
    exactTime,
    canRemember,
    hasFetched,
    isRefreshing,
    friendMessage,
    items,
    loadMore,
    hasMore,
    isLoadingMore,
  } = useCapsuleFeed(capsuleId);

  React.useEffect(() => {
    const handleLightboxOpen = async (event: Event) => {
      const detail = (event as CustomEvent<{ postId?: string }>).detail;
      const postId = detail?.postId;
      if (typeof postId !== "string" || !postId.trim().length) return;
      const normalized = postId.trim();
      setFocusPostId(normalized);

      if (posts.some((post) => post.id === normalized)) {
        return;
      }

      if (externalLoading) return;
      setExternalLoading(true);
      try {
        const response = await fetch("/api/posts/view", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: normalized }),
        });
        if (!response.ok) {
          console.warn("Lightbox fetch failed", response.status);
          return;
        }
        const data = (await response.json()) as { post?: HomeFeedPost };
        if (data?.post && typeof data.post.id === "string") {
          setExternalPost(data.post);
        }
      } catch (error) {
        console.warn("Lightbox fetch error", error);
      } finally {
        setExternalLoading(false);
      }
    };

    window.addEventListener(LIGHTBOX_EVENT_NAME, handleLightboxOpen as EventListener);
    return () => {
      window.removeEventListener(LIGHTBOX_EVENT_NAME, handleLightboxOpen as EventListener);
    };
  }, [externalLoading, posts]);

  React.useEffect(() => {
    const target = focusPostId?.trim();
    if (!target) return;
    if (externalLoading) return;
    if (externalPost?.id === target) return;
    if (posts.some((post) => post.id === target)) return;

    let cancelled = false;
    const fetchPost = async () => {
      setExternalLoading(true);
      try {
        const response = await fetch("/api/posts/view", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: target }),
        });
        if (!response.ok) {
          console.warn("Lightbox fetch failed", response.status);
          return;
        }
        const data = (await response.json()) as { post?: HomeFeedPost };
        if (!cancelled && data?.post && typeof data.post.id === "string") {
          setExternalPost(data.post);
        }
      } catch (error) {
        console.warn("Lightbox fetch error", error);
      } finally {
        if (!cancelled) {
          setExternalLoading(false);
        }
      }
    };

    void fetchPost();
    return () => {
      cancelled = true;
    };
  }, [externalLoading, externalPost?.id, focusPostId, posts]);

  const postsWithExternal = React.useMemo(() => {
    if (externalPost && !posts.some((post) => post.id === externalPost.id)) {
      return [externalPost, ...posts];
    }
    return posts;
  }, [externalPost, posts]);

  const itemsWithExternal = React.useMemo(() => {
    if (!externalPost) return items;
    const existing = items ?? [];
    const alreadyPresent = existing.some(
      (entry) => entry.type === "post" && entry.post.id === externalPost.id,
    );
    if (alreadyPresent) return existing;
    const injected = {
      id: externalPost.id,
      type: "post" as const,
      post: externalPost,
      score: null,
      slotInterval: null,
      pinnedAt: null,
      payload: null,
    };
    return [injected, ...existing];
  }, [externalPost, items]);

  const emptyMessage = capsuleName
    ? `No posts in ${capsuleName} yet. Be the first to share an update.`
    : "No posts in this capsule yet. Be the first to share an update.";

  return (
    <FeedSurface variant="capsule">
      {friendMessage && hasFetched ? (
        <div className={feedStyles.postFriendNotice}>{friendMessage}</div>
      ) : null}
      <HomeFeedList
        posts={postsWithExternal}
        items={itemsWithExternal}
        likePending={likePending}
        memoryPending={memoryPending}
        activeFriendTarget={activeFriendTarget}
        friendActionPending={friendActionPending}
        onToggleLike={handleToggleLike}
        onToggleMemory={handleToggleMemory}
        onFriendRequest={handleFriendRequest}
        onDelete={handleDelete}
        onRemoveFriend={handleFriendRemove}
        onFollowUser={handleFollowUser}
        onUnfollowUser={handleUnfollowUser}
        onToggleFriendTarget={setActiveFriendTarget}
        formatCount={formatCount}
        timeAgo={timeAgo}
        exactTime={exactTime}
        canRemember={canRemember}
        hasFetched={hasFetched}
        isRefreshing={isRefreshing}
        emptyMessage={emptyMessage}
        focusPostId={focusPostId}
        promoInterval={null}
        onLoadMore={loadMore}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
      />
    </FeedSurface>
  );
}
