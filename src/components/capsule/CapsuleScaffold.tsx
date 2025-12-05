"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Broadcast,
  DoorOpen,
  MagnifyingGlass,
  MagicWand,
  ImageSquare,
  Newspaper,
  CreditCard,
  EnvelopeSimple,
  MapPin,
  PencilSimple,
  UserPlus,
  PushPinSimple,
  CaretUp,
  CaretDown,
  ShoppingCartSimple,
  SealPercent,
  X,
  Storefront,
  ShareFat,
  UsersThree,
  WarningCircle,
  Sparkle,
  UploadSimple,
  ImagesSquare,
  CheckCircle,
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
import { useMemoryUploads } from "@/components/memory/use-memory-uploads";
import { computeDisplayUploads } from "@/components/memory/process-uploads";
import { shouldBypassCloudflareImages } from "@/lib/cloudflare/runtime";
import type { DisplayMemoryUpload } from "@/components/memory/uploads-types";

type CapsuleTab = "live" | "feed" | "store";
type FeedTargetDetail = { scope?: string | null; capsuleId?: string | null };
const FEED_TARGET_EVENT = "composer:feed-target";
const LIGHTBOX_EVENT_NAME = "capsules:lightbox:open";
type CapsuleHeroSection = "featured" | "events" | "history" | "media" | "files";
type CheckoutStep = "shipping" | "billing" | "review" | "confirmation";

export type CapsuleContentProps = {
  capsuleId?: string | null;
  capsuleName?: string | null;
};

const HERO_LINKS = ["Featured", "Members", "History", "Events", "Media", "Files"] as const;
const storeCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

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
  const displayName = capsuleName ?? "Customize this capsule";
  const heroBannerStyle = bannerUrl ? { backgroundImage: `url(${bannerUrl})` } : undefined;
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
        {canCustomize ? (
          <div className={capTheme.heroCustomizeGroup}>
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
            {onCustomizeTile ? (
              <button
                type="button"
                className={`${capTheme.heroCustomizeBtn} ${capTheme.heroCustomizeBtnSecondary}`}
                aria-label="Customize promo tile"
                onClick={() => {
                  onCustomizeTile?.();
                }}
              >
                <MagicWand size={16} weight="bold" />
                Customize promo tile
              </button>
            ) : null}
            {onCustomizeLogo ? (
              <button
                type="button"
                className={`${capTheme.heroCustomizeBtn} ${capTheme.heroCustomizeBtnSecondary}`}
                aria-label="Customize capsule logo"
                onClick={() => {
                  onCustomizeLogo?.();
                }}
              >
                <ImageSquare size={16} weight="bold" />
                Customize logo
              </button>
            ) : null}
          </div>
        ) : null}
        <div className={capTheme.heroBody}>
          <div className={capTheme.heroDetails}>
            <h2 className={capTheme.heroTitle}>{displayName}</h2>
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
          {errorMessage ? (
            <div className={memberStyles.notice}>
              <WarningCircle size={16} weight="bold" />
              <span>{errorMessage}</span>
            </div>
          ) : null}
        </div>
      </div>
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


  type StoreViewMode = "founder" | "visitor";

  type CapsuleStoreViewProps = {
    capsuleName: string | null;
    storeBannerUrl: string | null;
    mode: StoreViewMode;
    onCustomizeStoreBanner?: () => void;
    prompter?: React.ReactNode;
  };

  function CapsuleStoreView({
    capsuleName,
    storeBannerUrl,
    mode,
    onCustomizeStoreBanner,
    prompter,
  }: CapsuleStoreViewProps) {
    type StoreProductVariant = {
      id: string;
      label: string;
      price: number | null;
      inventoryCount: number | null;
    };

    type StoreProduct = {
      id: string;
      title: string;
      description: string;
      price: number;
      imageUrl: string | null;
      memoryId?: string | null;
      featured: boolean;
      order: number;
      salesCount: number;
      createdAt: string;
      active: boolean;
      kind: "digital" | "physical" | "service";
      fulfillmentKind: "download" | "ship" | "external";
      inventoryCount: number | null;
      fulfillmentUrl: string | null;
      variants: StoreProductVariant[];
    };

  type StoreProductDraft = {
      id: string;
      title: string;
      description: string;
      price: string;
      imageUrl: string | null;
      memoryId: string | null;
      active: boolean;
      kind: StoreProduct["kind"];
      fulfillmentKind: StoreProduct["fulfillmentKind"];
      inventoryCount: number | null;
      fulfillmentUrl: string | null;
      variants: StoreProductVariant[];
    };

  const isFounder = mode === "founder";
  const storeTitle = capsuleName ? `${capsuleName} store` : "Capsule store";

    const [products, setProducts] = React.useState<StoreProduct[]>(() => [
      {
        id: "feature",
        title: "Signature Hoodie",
        description: "Mid-weight fleece hoodie with your capsule mark on the chest.",
        price: 45,
        imageUrl: null,
        memoryId: null,
        featured: true,
        order: 0,
        salesCount: 320,
        createdAt: "2024-12-15T00:00:00.000Z",
        active: true,
        kind: "physical",
        fulfillmentKind: "ship",
        inventoryCount: 42,
        fulfillmentUrl: null,
        variants: [
          { id: "feature-s", label: "Size S", price: 45, inventoryCount: 10 },
          { id: "feature-m", label: "Size M", price: 45, inventoryCount: 16 },
          { id: "feature-l", label: "Size L", price: 45, inventoryCount: 16 },
        ],
      },
      {
        id: "collectible",
        title: "Die-cut Sticker Set",
        description: "Three-pack of matte stickers for laptops, cases, and cameras.",
        price: 9,
        imageUrl: null,
        memoryId: null,
        featured: false,
        order: 1,
        salesCount: 180,
        createdAt: "2025-02-04T00:00:00.000Z",
        active: true,
        kind: "physical",
        fulfillmentKind: "ship",
        inventoryCount: 120,
        fulfillmentUrl: null,
        variants: [],
      },
      {
        id: "bundle",
        title: "Creator Essentials Kit",
        description: "Hoodie + tee + sticker set bundled with a launch discount.",
        price: 79,
        imageUrl: null,
        memoryId: null,
        featured: false,
        order: 2,
        salesCount: 95,
        createdAt: "2025-01-10T00:00:00.000Z",
        active: true,
        kind: "physical",
        fulfillmentKind: "ship",
        inventoryCount: 58,
        fulfillmentUrl: null,
        variants: [
          { id: "bundle-default", label: "Standard pack", price: 79, inventoryCount: 58 },
        ],
      },
      {
        id: "digital",
        title: "Stream Overlay Pack",
        description: "Overlay, alerts, and panels themed for this capsule.",
        price: 24,
        imageUrl: null,
        memoryId: null,
        featured: false,
        order: 3,
        salesCount: 260,
        createdAt: "2025-03-01T00:00:00.000Z",
        active: true,
        kind: "digital",
        fulfillmentKind: "download",
        inventoryCount: null,
        fulfillmentUrl: "https://example.com/downloads/overlay-pack",
        variants: [
          { id: "digital-standard", label: "Standard license", price: 24, inventoryCount: null },
        ],
      },
    ]);
    const visibleProducts = React.useMemo(
      () => (isFounder ? products : products.filter((product) => product.active)),
      [isFounder, products],
    );

  const shippingOptions = React.useMemo(
    () => [
      { id: "express", label: "Express (2-3 days)", price: 14, detail: "Insured, tracked" },
      { id: "standard", label: "Standard (5-7 days)", price: 6, detail: "Tracked delivery" },
      { id: "pickup", label: "Pickup", price: 0, detail: "Meet at next event or venue" },
    ],
    [],
  );

  const checkoutSteps = React.useMemo<CheckoutStep[]>(
    () => ["shipping", "billing", "review", "confirmation"],
    [],
  );
  const checkoutStepDetails: Record<CheckoutStep, { label: string; description: string }> = {
    shipping: { label: "Shipping", description: "Contact & delivery" },
    billing: { label: "Billing", description: "Payment & billing" },
    review: { label: "Review", description: "Confirm details" },
    confirmation: { label: "Confirmation", description: "Receipt" },
  };

  const productKinds = React.useMemo(
    () => [
      { id: "physical" as const, label: "Physical" },
      { id: "digital" as const, label: "Digital" },
      { id: "service" as const, label: "Service" },
    ],
    [],
  );

  const fulfillmentOptions = React.useMemo(
    () => [
      { id: "ship" as const, label: "Ship to customer" },
      { id: "download" as const, label: "Download link" },
      { id: "external" as const, label: "External fulfillment" },
    ],
    [],
  );

  const paymentOptions = React.useMemo(
    () => [
      { id: "card", label: "Card", detail: "Visa / Mastercard / Amex" },
      { id: "apple", label: "Apple Pay", detail: "Fast checkout on supported devices" },
      { id: "gpay", label: "Google Pay", detail: "Use saved details from Google" },
    ],
    [],
  );

  const taxRate = 0.0825;
  const defaultShipping = shippingOptions[1]?.id ?? shippingOptions[0]?.id ?? "standard";
  const defaultPayment = paymentOptions[0]?.id ?? "card";

  const storeBannerStyle = storeBannerUrl
    ? ({
        ["--store-banner-image" as string]: `url("${storeBannerUrl}")`,
      } as React.CSSProperties)
    : undefined;

  const [editingProductId, setEditingProductId] = React.useState<string | null>(null);
  const [productDraft, setProductDraft] = React.useState<StoreProductDraft | null>(null);
  const [memoryPickerFor, setMemoryPickerFor] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [reorderMode, setReorderMode] = React.useState(false);
  const [sortMode, setSortMode] = React.useState<"best" | "new" | "manual">("best");
  const [heroProductId, setHeroProductId] = React.useState<string | null>(null);
  const [draggingProductId, setDraggingProductId] = React.useState<string | null>(null);
    const [checkoutOpen, setCheckoutOpen] = React.useState(false);
    const [checkoutStep, setCheckoutStep] = React.useState<CheckoutStep>("shipping");
    const [checkoutAttempted, setCheckoutAttempted] = React.useState(false);
    const [checkoutDetails, setCheckoutDetails] = React.useState(() => ({
      email: "",
      phone: "",
      fullName: "",
      address1: "",
      address2: "",
      city: "",
      region: "",
      postal: "",
      country: "United States",
      shippingOption: defaultShipping,
      paymentMethod: defaultPayment,
      promoCode: "",
      notes: "",
      termsAccepted: false,
      cardName: "",
      cardNumber: "",
      cardExpiry: "",
      cardCvc: "",
      billingSameAsShipping: true,
      billingName: "",
      billingAddress1: "",
      billingAddress2: "",
      billingCity: "",
      billingRegion: "",
      billingPostal: "",
      billingCountry: "United States",
    }));
    const [orderReference, setOrderReference] = React.useState<string | null>(null);
    const currentStepIndex = checkoutSteps.indexOf(checkoutStep);

  const {
    user: memoryUser,
    items: memoryItems,
    loading: memoryLoading,
    error: memoryError,
    refresh: refreshMemories,
  } = useMemoryUploads("upload");
  const cloudflareEnabled = React.useMemo(() => !shouldBypassCloudflareImages(), []);
  const currentOrigin = React.useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : null),
    [],
  );
  const memoryUploads = React.useMemo(
    () => computeDisplayUploads(memoryItems, { origin: currentOrigin, cloudflareEnabled }),
    [cloudflareEnabled, currentOrigin, memoryItems],
  );

    const sortedProducts = React.useMemo(() => {
      const list = [...visibleProducts];
      const baseSorted = list.sort((a, b) => {
        // Featured always first.
        if (a.featured !== b.featured) return a.featured ? -1 : 1;

        if (sortMode === "best") {
          if (a.salesCount !== b.salesCount) return b.salesCount - a.salesCount;
          return a.order - b.order;
        }
        if (sortMode === "new") {
          const aTime = new Date(a.createdAt).getTime();
          const bTime = new Date(b.createdAt).getTime();
          if (aTime !== bTime) return bTime - aTime;
          return a.order - b.order;
        }

        // Manual
        return a.order - b.order;
      });

      return baseSorted;
    }, [sortMode, visibleProducts]);

    const beginEditingProduct = React.useCallback((product: StoreProduct) => {
      setEditingProductId(product.id);
      setProductDraft({
        id: product.id,
        title: product.title,
        description: product.description,
        price: product.price.toString(),
        imageUrl: product.imageUrl,
        memoryId: product.memoryId ?? null,
        active: product.active,
        kind: product.kind,
        fulfillmentKind: product.fulfillmentKind,
        inventoryCount: product.inventoryCount,
        fulfillmentUrl: product.fulfillmentUrl,
        variants: product.variants,
      });
      setMemoryPickerFor(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }, []);

    const startNewProduct = React.useCallback(() => {
      const nextId = `product-${Date.now()}`;
      const nextOrder = products.length ? Math.max(...products.map((p) => p.order)) + 1 : 0;
      const fresh: StoreProduct = {
        id: nextId,
        title: "New product",
        description: "Add a description to tell buyers what they'll get.",
        price: 0,
        imageUrl: null,
        memoryId: null,
        featured: false,
        order: nextOrder,
        salesCount: 0,
        createdAt: new Date().toISOString(),
        active: false,
        kind: "physical",
        fulfillmentKind: "ship",
        inventoryCount: null,
        fulfillmentUrl: null,
        variants: [],
      };
      setProducts((previous) => [...previous, fresh]);
      beginEditingProduct(fresh);
    }, [beginEditingProduct, products]);

  const cancelEditingProduct = React.useCallback(() => {
    setEditingProductId(null);
    setProductDraft(null);
    setMemoryPickerFor(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

    const updateDraftField = React.useCallback(
      <K extends keyof Omit<StoreProductDraft, "id">>(field: K, value: StoreProductDraft[K]) => {
        setProductDraft((previous) => (previous ? { ...previous, [field]: value } : previous));
      },
      [],
    );

    const addDraftVariant = React.useCallback(() => {
      setProductDraft((previous) =>
        previous
          ? {
              ...previous,
              variants: [
                ...previous.variants,
                {
                  id: `variant-${Date.now()}`,
                  label: "New option",
                  price: null,
                  inventoryCount: null,
                },
              ],
            }
          : previous,
      );
    }, []);

    const updateDraftVariant = React.useCallback(
      (variantId: string, updates: Partial<StoreProductVariant>) => {
        setProductDraft((previous) =>
          previous
            ? {
                ...previous,
                variants: previous.variants.map((variant) =>
                  variant.id === variantId ? { ...variant, ...updates } : variant,
                ),
              }
            : previous,
        );
      },
      [],
    );

    const removeDraftVariant = React.useCallback((variantId: string) => {
      setProductDraft((previous) =>
        previous
          ? {
              ...previous,
              variants: previous.variants.filter((variant) => variant.id !== variantId),
            }
          : previous,
      );
    }, []);

  const applyImageFromFile = React.useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setProductDraft((previous) =>
        previous && typeof reader.result === "string"
          ? { ...previous, imageUrl: reader.result, memoryId: null }
          : previous,
      );
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileInputChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (event.target.value) event.target.value = "";
      if (!file) return;
      applyImageFromFile(file);
    },
    [applyImageFromFile],
  );

  const handleMemorySelect = React.useCallback((upload: DisplayMemoryUpload) => {
    setProductDraft((previous) =>
      previous ? { ...previous, imageUrl: upload.displayUrl, memoryId: upload.id ?? null } : previous,
    );
    setMemoryPickerFor(null);
  }, []);

    const saveProductDraft = React.useCallback(() => {
      if (!productDraft) return;
      const parsedPrice = Number.parseFloat(productDraft.price);
      const parsedInventory =
        productDraft.inventoryCount === null || Number.isNaN(productDraft.inventoryCount)
          ? null
          : Math.max(0, productDraft.inventoryCount);
      setProducts((previous) =>
        previous.map((product) =>
          product.id === productDraft.id
            ? {
                ...product,
                title: productDraft.title.trim() || "Untitled product",
                description: productDraft.description.trim(),
                price:
                  Number.isFinite(parsedPrice) && parsedPrice >= 0 ? parsedPrice : product.price,
                imageUrl: productDraft.imageUrl,
                memoryId: productDraft.memoryId,
                active: productDraft.active,
                kind: productDraft.kind,
                fulfillmentKind: productDraft.fulfillmentKind,
                inventoryCount: parsedInventory,
                fulfillmentUrl: productDraft.fulfillmentUrl?.trim() || null,
                variants: productDraft.variants.map((variant) => ({
                  ...variant,
                  label: variant.label.trim() || "Option",
                  price:
                    typeof variant.price === "number" && Number.isFinite(variant.price)
                      ? variant.price
                      : null,
                  inventoryCount:
                    variant.inventoryCount === null || Number.isNaN(variant.inventoryCount)
                      ? null
                      : Math.max(0, variant.inventoryCount),
                })),
              }
            : product,
        ),
      );
      setEditingProductId(null);
      setProductDraft(null);
      setMemoryPickerFor(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }, [productDraft]);

  const openImagePicker = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

    const toggleFeatured = React.useCallback((productId: string) => {
      setProducts((previous) =>
        previous.map((product) =>
          product.id === productId ? { ...product, featured: !product.featured } : product,
        ),
      );
    }, []);

    const toggleActive = React.useCallback((productId: string) => {
      setProducts((previous) =>
        previous.map((product) =>
          product.id === productId ? { ...product, active: !product.active } : product,
        ),
      );
    }, []);

    const deleteProduct = React.useCallback(
      (productId: string) => {
        setProducts((previous) => previous.filter((product) => product.id !== productId));
        setCart((previous) => {
          if (!(productId in previous)) return previous;
          const next = { ...previous };
          delete next[productId];
          return next;
        });
        if (editingProductId === productId) {
          setEditingProductId(null);
          setProductDraft(null);
        }
      },
      [editingProductId],
    );

  const moveProduct = React.useCallback(
    (productId: string, direction: "up" | "down") => {
      setProducts((previous) => {
        const ordered = [...previous].sort((a, b) => {
          if (a.featured !== b.featured) return a.featured ? -1 : 1;
          return a.order - b.order;
        });
        const index = ordered.findIndex((p) => p.id === productId);
        if (index < 0) return previous;
        const swapIndex = direction === "up" ? index - 1 : index + 1;
        if (swapIndex < 0 || swapIndex >= ordered.length) return previous;

        const first = ordered[index];
        const second = ordered[swapIndex];
        if (!first || !second) return previous;

        return previous.map((product) => {
          if (product.id === first.id) return { ...product, order: second.order };
          if (product.id === second.id) return { ...product, order: first.order };
          return product;
        });
      });
    },
    [],
  );

  const setHeroFromProduct = React.useCallback((productId: string) => {
    setHeroProductId(productId);
  }, []);

  const handleDragStart = React.useCallback((productId: string) => {
    setDraggingProductId(productId);
  }, []);

  const handleDragEnd = React.useCallback(() => {
    setDraggingProductId(null);
  }, []);

  const handleDragOver = React.useCallback(
    (event: React.DragEvent<HTMLElement>, targetId: string) => {
      if (!reorderMode || !draggingProductId || draggingProductId === targetId) return;
      event.preventDefault();
      setProducts((previous) => {
        const ordered = [...previous].sort((a, b) => a.order - b.order);
        const fromIndex = ordered.findIndex((p) => p.id === draggingProductId);
        const toIndex = ordered.findIndex((p) => p.id === targetId);
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return previous;

        const updated = [...ordered];
        const [moved] = updated.splice(fromIndex, 1);
        if (!moved) return previous;
        updated.splice(toIndex, 0, moved);

        return updated.map((product, idx) => ({ ...product, order: idx }));
      });
    },
    [draggingProductId, reorderMode],
  );

    const updateCheckoutField = React.useCallback(
      (field: keyof typeof checkoutDetails, value: string | boolean) => {
        setCheckoutDetails((prev) => ({ ...prev, [field]: value }));
      },
      [],
    );

    const [cart, setCart] = React.useState<Record<string, number>>({});
    const [variantSelection, setVariantSelection] = React.useState<Record<string, string | null>>({});
    const storeSearchId = React.useId();

    const getDefaultVariantId = React.useCallback((product: StoreProduct): string | null => {
      return product.variants.length ? product.variants[0]?.id ?? null : null;
    }, []);

    const setInitialVariantSelections = React.useCallback(
      (productList: StoreProduct[]) => {
        setVariantSelection((previous) => {
          const next = { ...previous };
          productList.forEach((product) => {
            if (next[product.id] === undefined) {
              next[product.id] = getDefaultVariantId(product);
            }
          });
          return next;
        });
      },
      [getDefaultVariantId],
    );

    React.useEffect(() => {
      setInitialVariantSelections(products);
    }, [products, setInitialVariantSelections]);

    const resolveVariant = React.useCallback(
      (product: StoreProduct, variantId: string | null | undefined): StoreProductVariant | null => {
        if (!variantId) return null;
        return product.variants.find((variant) => variant.id === variantId) ?? null;
      },
      [],
    );

    const updateVariantSelection = React.useCallback(
      (productId: string, variantId: string | null) => {
        setVariantSelection((previous) => ({ ...previous, [productId]: variantId }));
      },
      [],
    );

    const resolveSelectedVariantId = React.useCallback(
      (product: StoreProduct) => {
        const chosen = variantSelection[product.id];
        if (chosen && resolveVariant(product, chosen)) return chosen;
        return getDefaultVariantId(product);
      },
      [getDefaultVariantId, resolveVariant, variantSelection],
    );

    const heroProduct = React.useMemo(() => {
      const direct = heroProductId ? visibleProducts.find((p) => p.id === heroProductId) : null;
      if (direct) return direct;
      const featured = sortedProducts.find((p) => p.featured);
      if (featured) return featured;
      return sortedProducts[0] ?? null;
    }, [heroProductId, sortedProducts, visibleProducts]);
    const heroVariantId = heroProduct ? resolveSelectedVariantId(heroProduct) : null;
    const heroVariant = heroProduct ? resolveVariant(heroProduct, heroVariantId) : null;
    const heroDisplayPrice = heroProduct ? heroVariant?.price ?? heroProduct.price : 0;

    const createCartKey = React.useCallback(
      (productId: string, variantId: string | null | undefined) =>
        `${productId}::${variantId ?? "base"}`,
      [],
    );

    const parseCartKey = React.useCallback(
      (key: string) => {
        const [productId, variantId] = key.split("::");
        return { productId, variantId: variantId === "base" ? null : variantId };
      },
      [],
    );

    const addToCart = React.useCallback(
      (productId: string, variantId?: string | null) => {
        const product = products.find((entry) => entry.id === productId);
        if (!product) return;
        if (!product.active && !isFounder) return;
        const resolvedVariantId =
          variantId ?? variantSelection[productId] ?? getDefaultVariantId(product);
        const key = createCartKey(productId, resolvedVariantId);
        setCart((previous) => ({
          ...previous,
          [key]: (previous[key] ?? 0) + 1,
        }));
      },
      [createCartKey, getDefaultVariantId, isFounder, products, variantSelection],
    );

    const removeFromCart = React.useCallback((cartKey: string) => {
      setCart((previous) => {
        const next = { ...previous };
        delete next[cartKey];
        return next;
      });
    }, []);

    const increment = React.useCallback((cartKey: string) => {
      setCart((previous) => ({
        ...previous,
        [cartKey]: Math.max(1, (previous[cartKey] ?? 0) + 1),
      }));
    }, []);

    const decrement = React.useCallback((cartKey: string) => {
      setCart((previous) => {
        const current = previous[cartKey] ?? 0;
        if (current <= 1) {
          const next = { ...previous };
          delete next[cartKey];
          return next;
        }
        return {
          ...previous,
          [cartKey]: current - 1,
        };
      });
    }, []);

    const cartItems = React.useMemo(() => {
      const entries = Object.entries(cart);
      const items = entries
        .map(([key, quantity]) => {
          if (quantity <= 0) return null;
          const { productId, variantId } = parseCartKey(key);
          const product = visibleProducts.find((p) => p.id === productId);
          if (!product) return null;
          const variant = resolveVariant(product, variantId);
          const unitPrice = variant?.price ?? product.price;
          return { key, product, variant, quantity, unitPrice };
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
          return items;
      }, [cart, parseCartKey, resolveVariant, visibleProducts]);

    const shippingRequired = React.useMemo(
      () => cartItems.some((item) => item.product.fulfillmentKind === "ship"),
      [cartItems],
    );

    const needsBillingAddress = React.useMemo(
      () => !checkoutDetails.billingSameAsShipping || !shippingRequired,
      [checkoutDetails.billingSameAsShipping, shippingRequired],
    );

    React.useEffect(() => {
      if (!shippingRequired || !checkoutDetails.billingSameAsShipping) return;
      setCheckoutDetails((previous) => {
        if (!previous.billingSameAsShipping) return previous;
        const next = {
          ...previous,
          billingName: previous.fullName,
          billingAddress1: previous.address1,
          billingAddress2: previous.address2,
          billingCity: previous.city,
          billingRegion: previous.region,
          billingPostal: previous.postal,
          billingCountry: previous.country || previous.billingCountry || "United States",
        };
        const changed =
          next.billingName !== previous.billingName ||
          next.billingAddress1 !== previous.billingAddress1 ||
          next.billingAddress2 !== previous.billingAddress2 ||
          next.billingCity !== previous.billingCity ||
          next.billingRegion !== previous.billingRegion ||
          next.billingPostal !== previous.billingPostal ||
          next.billingCountry !== previous.billingCountry;
        return changed ? next : previous;
      });
    }, [
      checkoutDetails.address1,
      checkoutDetails.address2,
      checkoutDetails.billingSameAsShipping,
      checkoutDetails.city,
      checkoutDetails.country,
      checkoutDetails.fullName,
      checkoutDetails.postal,
      checkoutDetails.region,
      shippingRequired,
    ]);

    React.useEffect(() => {
      setCart((previous) => {
        const next = { ...previous };
        Object.keys(next).forEach((key) => {
          const { productId, variantId } = parseCartKey(key);
          const product = products.find((p) => p.id === productId);
          const variantMissing = variantId && product ? !resolveVariant(product, variantId) : false;
          if (!product || (!product.active && !isFounder) || variantMissing) {
            delete next[key];
          }
        });
        return next;
      });
    }, [isFounder, parseCartKey, products, resolveVariant]);

    const subtotal = React.useMemo(
      () => cartItems.reduce((total, item) => total + item.unitPrice * item.quantity, 0),
      [cartItems],
    );

    const selectedShipping = React.useMemo(
      () =>
        shippingRequired
          ? shippingOptions.find((option) => option.id === checkoutDetails.shippingOption)
          : null,
      [checkoutDetails.shippingOption, shippingOptions, shippingRequired],
    );

    React.useEffect(() => {
      if (!shippingRequired) return;
      const hasSelection = shippingOptions.some((option) => option.id === checkoutDetails.shippingOption);
      if (!hasSelection) {
        setCheckoutDetails((previous) => ({
          ...previous,
          shippingOption: defaultShipping,
        }));
      }
    }, [checkoutDetails.shippingOption, defaultShipping, shippingOptions, shippingRequired]);

    const shippingCost = shippingRequired && selectedShipping ? selectedShipping.price : 0;
    const taxEstimate = Math.max(0, subtotal + shippingCost) * taxRate;
    const orderTotal = subtotal + shippingCost + taxEstimate;

    const hasItems = cartItems.length > 0;

    const checkoutErrors = React.useMemo(() => {
      const errors: Record<string, string> = {};
      const email = checkoutDetails.email.trim();
      const emailValid = email.length > 3 && email.includes("@") && email.includes(".");
      if (!emailValid) errors.email = "Enter a valid email.";
      if (shippingRequired && checkoutDetails.fullName.trim().length < 2) errors.fullName = "Enter your full name.";
      if (shippingRequired) {
        if (checkoutDetails.address1.trim().length < 4) errors.address1 = "Enter a street address.";
        if (checkoutDetails.city.trim().length < 2) errors.city = "Enter a city.";
        if (checkoutDetails.region.trim().length < 2) errors.region = "Enter a state or region.";
        if (checkoutDetails.postal.trim().length < 3) errors.postal = "Enter a postal code.";
        if (!checkoutDetails.country.trim().length) errors.country = "Enter a country.";
        const hasShippingSelection = shippingOptions.some(
          (option) => option.id === checkoutDetails.shippingOption,
        );
        if (!hasShippingSelection) errors.shippingOption = "Choose a shipping speed.";
      }
      if (checkoutDetails.cardName.trim().length < 2) errors.cardName = "Name on card required.";
      const digitsOnly = checkoutDetails.cardNumber.replace(/\D+/g, "");
      if (digitsOnly.length < 12) errors.cardNumber = "Enter a valid card number.";
      const expiryValid = /^\d{2}\/\d{2}$/.test(checkoutDetails.cardExpiry.trim());
      if (!expiryValid) errors.cardExpiry = "Use MM/YY format.";
      const cvcValid = /^\\d{3,4}$/.test(checkoutDetails.cardCvc.trim());
      if (!cvcValid) errors.cardCvc = "Enter a 3-4 digit CVC.";
      if (needsBillingAddress) {
        if (checkoutDetails.billingName.trim().length < 2) errors.billingName = "Enter billing name.";
        if (checkoutDetails.billingAddress1.trim().length < 4)
          errors.billingAddress1 = "Enter billing address.";
        if (checkoutDetails.billingCity.trim().length < 2) errors.billingCity = "Enter city.";
        if (checkoutDetails.billingRegion.trim().length < 2) errors.billingRegion = "Enter region.";
        if (checkoutDetails.billingPostal.trim().length < 3) errors.billingPostal = "Enter postal code.";
        if (!checkoutDetails.billingCountry.trim().length) errors.billingCountry = "Enter country.";
      }
      if (!checkoutDetails.termsAccepted) errors.terms = "Please agree to the terms.";
      if (!hasItems) errors.cart = "Add at least one item to checkout.";
      return errors;
    }, [checkoutDetails, hasItems, needsBillingAddress, shippingOptions, shippingRequired]);

    const errorFor = React.useCallback(
      (key: keyof typeof checkoutErrors) => (checkoutAttempted ? checkoutErrors[key] : undefined),
      [checkoutAttempted, checkoutErrors],
    );

    const canPlaceOrder = hasItems && Object.keys(checkoutErrors).length === 0;

    const placeOrder = React.useCallback(() => {
      setCheckoutAttempted(true);
      if (!canPlaceOrder) return;
      const ref = `ORD-${Date.now()}`;
      console.info("capsule.store.place_order", {
        cart,
        cartItems,
        details: checkoutDetails,
        totals: { subtotal, shipping: shippingCost, tax: taxEstimate, total: orderTotal },
        reference: ref,
      });
      setOrderReference(ref);
      setCheckoutStep("confirmation");
    }, [
      canPlaceOrder,
      cart,
      cartItems,
      checkoutDetails,
      orderTotal,
      shippingCost,
      subtotal,
      taxEstimate,
    ]);

    const validateShippingStep = React.useCallback(() => {
      setCheckoutAttempted(true);
      const requiredKeys: (keyof typeof checkoutErrors)[] = ["email"];
      if (shippingRequired) {
        requiredKeys.push(
          "fullName",
          "address1",
          "city",
          "region",
          "postal",
          "country",
          "shippingOption",
        );
      }
      const hasErrors = requiredKeys.some((key) => checkoutErrors[key]);
      if (checkoutErrors.cart) return false;
      return !hasErrors;
    }, [checkoutErrors, shippingRequired]);

    const validateBillingStep = React.useCallback(() => {
      setCheckoutAttempted(true);
      const billingKeys = ["cardName", "cardNumber", "cardExpiry", "cardCvc"] as const;
      const billingAddressKeys = needsBillingAddress
        ? (["billingName", "billingAddress1", "billingCity", "billingRegion", "billingPostal", "billingCountry"] as const)
        : [];
      const hasErrors = [...billingKeys, ...billingAddressKeys].some((key) => checkoutErrors[key]);
      if (checkoutErrors.cart) return false;
      return !hasErrors;
    }, [checkoutErrors, needsBillingAddress]);

    const handleNextStep = React.useCallback(() => {
      if (checkoutStep === "shipping") {
        if (validateShippingStep()) {
          setCheckoutAttempted(false);
          setCheckoutStep("billing");
        }
        return;
      }
      if (checkoutStep === "billing") {
        if (validateBillingStep()) {
          setCheckoutAttempted(false);
          setCheckoutStep("review");
        }
        return;
      }
      if (checkoutStep === "review") {
        placeOrder();
      }
    }, [checkoutStep, placeOrder, validateBillingStep, validateShippingStep]);

    const handleBackStep = React.useCallback(() => {
      const currentIndex = checkoutSteps.indexOf(checkoutStep);
      if (currentIndex <= 0) {
        setCheckoutAttempted(false);
        setCheckoutOpen(false);
        return;
      }
      const previous = checkoutSteps[currentIndex - 1];
      setCheckoutAttempted(false);
      if (previous) {
        setCheckoutStep(previous);
      }
    }, [checkoutStep, checkoutSteps]);

    const selectedPaymentOption = React.useMemo(
      () =>
        paymentOptions.find((option) => option.id === checkoutDetails.paymentMethod) ??
        paymentOptions[0] ?? { id: defaultPayment, label: "Card", detail: "Visa / Mastercard" },
      [checkoutDetails.paymentMethod, paymentOptions],
    );

    const billingSnapshot = React.useMemo(
      () =>
        checkoutDetails.billingSameAsShipping && shippingRequired
          ? {
              name: checkoutDetails.fullName,
              address1: checkoutDetails.address1,
              address2: checkoutDetails.address2,
              city: checkoutDetails.city,
              region: checkoutDetails.region,
              postal: checkoutDetails.postal,
              country: checkoutDetails.country,
            }
          : {
              name: checkoutDetails.billingName || checkoutDetails.fullName,
              address1: checkoutDetails.billingAddress1,
              address2: checkoutDetails.billingAddress2,
              city: checkoutDetails.billingCity,
              region: checkoutDetails.billingRegion,
              postal: checkoutDetails.billingPostal,
              country: checkoutDetails.billingCountry,
            },
      [
        checkoutDetails.address1,
        checkoutDetails.address2,
        checkoutDetails.billingAddress1,
        checkoutDetails.billingAddress2,
        checkoutDetails.billingCity,
        checkoutDetails.billingCountry,
        checkoutDetails.billingName,
        checkoutDetails.billingPostal,
        checkoutDetails.billingRegion,
        checkoutDetails.billingSameAsShipping,
        checkoutDetails.city,
        checkoutDetails.country,
        checkoutDetails.fullName,
        checkoutDetails.postal,
        checkoutDetails.region,
        shippingRequired,
      ],
    );

    const maskedCardSummary = React.useMemo(() => {
      const digits = checkoutDetails.cardNumber.replace(/\D+/g, "");
      const last4 = digits.slice(-4);
      return last4 ? `•••• ${last4}` : "Card pending";
    }, [checkoutDetails.cardNumber]);

  return (
    <div className={`${capTheme.liveCanvas} ${capTheme.storeCanvas}`} aria-label="Capsule store">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileInputChange}
        style={{ display: "none" }}
      />
      <div className={capTheme.storeContent}>
        <section className={`${capTheme.storeHero} ${capTheme.storeHeroRich}`}>
          <div className={capTheme.storeBannerFrame} data-glow="true">
            <div
              className={capTheme.storeBannerSurface}
              role="presentation"
              data-has-banner={storeBannerUrl ? "true" : undefined}
              style={storeBannerStyle}
            />
            <div className={capTheme.storeBannerOverlay}>
              <div className={capTheme.storeHeroMeta}>
                <h2 className={capTheme.storeHeroHeading}>{storeTitle}</h2>
              </div>
              <div className={capTheme.storeHeroActions}>
                {isFounder && onCustomizeStoreBanner ? (
                  <button
                    type="button"
                    className={capTheme.storePrimaryButton}
                    onClick={onCustomizeStoreBanner}
                  >
                    <MagicWand size={16} weight="bold" />
                    Edit banner
                  </button>
                ) : null}
                <button type="button" className={capTheme.storeGhostButton}>
                  <ShareFat size={16} weight="bold" />
                  Share store
                </button>
                <button type="button" className={capTheme.storeGhostButton}>
                  <UsersThree size={16} weight="bold" />
                  Invite friends
                </button>
              </div>
            </div>
          </div>
        </section>

        {prompter ? <div className={capTheme.storePrompterWrap}>{prompter}</div> : null}

        <div className={capTheme.storeGrid}>
          <section className={capTheme.storeMainColumn}>
            {heroProduct ? (
              <section className={capTheme.storeHeroFeatured}>
                <div className={capTheme.storeHeroImage}>
                  {heroProduct.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={heroProduct.imageUrl}
                      alt={heroProduct.title}
                      loading="lazy"
                    />
                  ) : (
                    <div className={capTheme.storeImagePlaceholder}>
                      <ImageSquare size={22} weight="duotone" />
                      <span>Feature your best product</span>
                    </div>
                  )}
                </div>
                <div className={capTheme.storeHeroDetails}>
                  <div className={capTheme.storeHeroBadge}>Featured spotlight</div>
                  <h3>{heroProduct.title}</h3>
                  <p>{heroProduct.description}</p>
                  <div className={capTheme.storeHeroMeta}>
                    <span>{storeCurrencyFormatter.format(heroDisplayPrice)}</span>
                    <span>{heroProduct.salesCount.toLocaleString()} sold</span>
                  </div>
                  <div className={capTheme.storeHeroActions}>
                    {heroProduct.variants.length ? (
                      <label className={capTheme.storeFieldInline}>
                        <span>Choose option</span>
                        <select
                          value={resolveSelectedVariantId(heroProduct) ?? ""}
                          onChange={(event) =>
                            updateVariantSelection(
                              heroProduct.id,
                              event.target.value || getDefaultVariantId(heroProduct),
                            )
                          }
                        >
                          {heroProduct.variants.map((variant) => (
                            <option key={variant.id} value={variant.id}>
                              {variant.label} -{" "}
                              {storeCurrencyFormatter.format(variant.price ?? heroProduct.price)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                      <button
                        type="button"
                        className={capTheme.storePrimaryButton}
                        onClick={() => addToCart(heroProduct.id, resolveSelectedVariantId(heroProduct))}
                        disabled={!heroProduct.active && !isFounder}
                      >
                        Add to cart
                      </button>
                    {isFounder ? (
                      <button
                        type="button"
                        className={capTheme.storeGhostButton}
                        onClick={() => beginEditingProduct(heroProduct)}
                      >
                        Edit spotlight
                      </button>
                    ) : null}
                  </div>
                </div>
              </section>
            ) : null}

            <header className={capTheme.storeControlsBar}>
              <div>
                <h3 className={capTheme.storeColumnTitle}>Featured products</h3>
              </div>
              <div className={capTheme.storeControlButtons}>
	                {isFounder ? (
	                  <>
	                    <button
	                      type="button"
	                      className={capTheme.storeControlButton}
	                      onClick={onCustomizeStoreBanner ?? (() => {})}
	                    >
	                      <span>Creative</span>
	                      <strong>Generate banner</strong>
	                    </button>
                    <button type="button" className={capTheme.storeControlButton} onClick={startNewProduct}>
                      <span>Products</span>
                      <strong>Add listing</strong>
                    </button>
                    <button
                      type="button"
                      className={`${capTheme.storeControlButton} ${
                        reorderMode ? capTheme.storeControlButtonActive : ""
                      }`}
                      onClick={() => setReorderMode((state) => !state)}
                    >
                      <span>Layout</span>
                      <strong>{reorderMode ? "Reorder: On" : "Reorder"}</strong>
                    </button>
                  </>
                ) : null}
                {["best", "new", "manual"].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`${capTheme.storeControlButton} ${
                      sortMode === mode ? capTheme.storeControlButtonActive : ""
                    }`}
                    onClick={() => setSortMode(mode as typeof sortMode)}
                  >
                    <span>Sort</span>
                    <strong>
                      {mode === "best" ? "Best selling" : mode === "new" ? "Newest" : "Manual"}
                    </strong>
                  </button>
                ))}
              </div>
            </header>

            <label className={capTheme.storeSearch} htmlFor={storeSearchId}>
              <MagnifyingGlass size={18} weight="bold" />
              <input id={storeSearchId} type="search" placeholder="Search drops" />
            </label>

	            <div className={capTheme.storeProducts}>
                {sortedProducts.map((product, index) => {
                  const isEditing = editingProductId === product.id;
                  const draft = isEditing && productDraft?.id === product.id ? productDraft : null;
                  const imageUrl = draft ? draft.imageUrl : product.imageUrl;
                  const titleValue = draft ? draft.title : product.title;
                  const descriptionValue = draft ? draft.description : product.description;
                  const priceValue = draft ? draft.price : product.price.toString();
                  const selectedVariantId = resolveSelectedVariantId(product);
                  const selectedVariant = resolveVariant(product, selectedVariantId);
                  const displayPrice = selectedVariant?.price ?? product.price;

                  const isDragging = draggingProductId === product.id;

                return (
                  <article
                    key={product.id}
                    className={capTheme.storeProductCard}
                    draggable={reorderMode}
                    onDragStart={() => handleDragStart(product.id)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(event) => handleDragOver(event, product.id)}
                    data-dragging={isDragging ? "true" : undefined}
                  >
                    <div className={capTheme.storeProductTop}>
                      <div className={capTheme.storeProductTopLeft}>
                          {isFounder ? (
                            <button
                              type="button"
                              className={capTheme.storeIconButton}
                              onClick={() => toggleFeatured(product.id)}
                            aria-label={`${product.featured ? "Unfeature" : "Feature"} ${product.title}`}
                            aria-pressed={product.featured}
                          >
                            <PushPinSimple size={16} weight="bold" />
                          </button>
                        ) : null}
                        {isEditing ? (
                            <span className={capTheme.storeProductLabel}>Editing</span>
                          ) : product.featured ? (
                            <span className={capTheme.storeProductLabel}>Featured</span>
                          ) : !product.active ? (
                            <span className={capTheme.storeProductLabel}>Unpublished</span>
                          ) : null}
                        </div>
                      {isFounder ? (
                        <div className={capTheme.storeProductTopActions}>
                            {reorderMode ? (
                              <div className={capTheme.storeReorderControls}>
                                <button
                                  type="button"
                                className={capTheme.storeIconButton}
                                onClick={() => moveProduct(product.id, "up")}
                                disabled={index === 0}
                                aria-label={`Move ${product.title} up`}
                              >
                                <CaretUp size={16} weight="bold" />
                              </button>
                              <button
                                type="button"
                                className={capTheme.storeIconButton}
                                onClick={() => moveProduct(product.id, "down")}
                                disabled={index === sortedProducts.length - 1}
                                aria-label={`Move ${product.title} down`}
                              >
                                  <CaretDown size={16} weight="bold" />
                                </button>
                              </div>
                            ) : null}
                            <button
                              type="button"
                              className={capTheme.storeGhostButton}
                              onClick={() => toggleActive(product.id)}
                            >
                              {product.active ? "Unpublish" : "Publish"}
                            </button>
                            <button
                              type="button"
                              className={capTheme.storeGhostButton}
                              onClick={() => deleteProduct(product.id)}
                            >
                              Remove
                            </button>
                            <button
                              type="button"
                              className={capTheme.storeGhostButton}
                              onClick={() =>
                                isEditing ? cancelEditingProduct() : beginEditingProduct(product)
                            }
                          >
                            {isEditing ? "Close" : "Edit"}
                          </button>
                        </div>
                      ) : null}
                    </div>

                    {isEditing ? (
                      <form
                        className={capTheme.storeProductEditor}
                        onSubmit={(event) => {
                          event.preventDefault();
                          saveProductDraft();
                        }}
                      >
                        <div
                          className={capTheme.storeProductImage}
                          data-has-image={imageUrl ? "true" : undefined}
                        >
                          {imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={imageUrl}
                              alt={titleValue || "Store product image"}
                              loading="lazy"
                            />
                          ) : (
                            <div className={capTheme.storeImagePlaceholder}>
                              <ImageSquare size={22} weight="duotone" />
                              <span>Add an image</span>
                            </div>
                          )}
                        </div>
                        <div className={capTheme.storeMediaEditor}>
                          <div className={capTheme.storeMediaControls}>
                            <button
                              type="button"
                              className={capTheme.storeMediaButton}
                              onClick={openImagePicker}
                            >
                              <UploadSimple size={16} weight="bold" />
                              Upload image
                            </button>
                            <button
                              type="button"
                              className={capTheme.storeMediaButton}
                              data-variant="ghost"
                              onClick={() => setMemoryPickerFor(product.id)}
                            >
                              <ImagesSquare size={16} weight="bold" />
                              Browse memories
                            </button>
                            {imageUrl ? (
                              <button
                                type="button"
                                className={capTheme.storeGhostButton}
                                onClick={() =>
                                  setProductDraft((previous) =>
                                    previous && previous.id === product.id
                                      ? { ...previous, imageUrl: null, memoryId: null }
                                      : previous,
                                  )
                                }
                              >
                                Remove image
                              </button>
                            ) : null}
                          </div>
                          {memoryPickerFor === product.id ? (
                            <div className={capTheme.storeMemoryPicker}>
                              <div className={capTheme.storeMemoryHeader}>
                                <span>Select a memory</span>
                                <div className={capTheme.storeMemoryButtons}>
                                  <button
                                    type="button"
                                    className={capTheme.storeGhostButton}
                                    onClick={() => refreshMemories()}
                                    disabled={memoryLoading}
                                  >
                                    {memoryLoading ? "Refreshing..." : "Refresh"}
                                  </button>
                                  <button
                                    type="button"
                                    className={capTheme.storeGhostButton}
                                    onClick={() => setMemoryPickerFor(null)}
                                  >
                                    Close
                                  </button>
                                </div>
                              </div>
                              {!memoryUser ? (
                                <p className={capTheme.storeMemoryStatus}>Sign in to use memories.</p>
                              ) : memoryError ? (
                                <p className={capTheme.storeMemoryStatus}>{memoryError}</p>
                              ) : memoryLoading ? (
                                <p className={capTheme.storeMemoryStatus}>Loading memories...</p>
                              ) : memoryUploads.length === 0 ? (
                                <p className={capTheme.storeMemoryStatus}>No memories yet.</p>
                              ) : (
                                <div className={capTheme.storeMemoryGrid}>
                                  {memoryUploads.map((upload) => (
                                    <button
                                      key={upload.id}
                                      type="button"
                                      className={capTheme.storeMemoryCard}
                                      onClick={() => handleMemorySelect(upload)}
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={upload.displayUrl}
                                        alt={upload.title ?? "Memory upload"}
                                        loading="lazy"
                                      />
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                        <label className={capTheme.storeField}>
                          <span>Title</span>
                          <input
                            type="text"
                            value={titleValue}
                            onChange={(event) => updateDraftField("title", event.target.value)}
                            required
                          />
                        </label>
                        <label className={capTheme.storeField}>
                          <span>Description</span>
                          <textarea
                            rows={3}
                            value={descriptionValue}
                            onChange={(event) =>
                              updateDraftField("description", event.target.value)
                            }
                          />
                        </label>
                          <label className={capTheme.storeFieldInline}>
                            <span>Price</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={priceValue}
                              onChange={(event) => updateDraftField("price", event.target.value)}
                            />
                          </label>
                          <label className={capTheme.storeFieldInline}>
                            <span>Product type</span>
                            <select
                              value={draft?.kind ?? product.kind}
                              onChange={(event) =>
                                updateDraftField("kind", event.target.value as StoreProduct["kind"])
                              }
                            >
                              {productKinds.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className={capTheme.storeFieldInline}>
                            <span>Fulfillment</span>
                            <select
                              value={draft?.fulfillmentKind ?? product.fulfillmentKind}
                              onChange={(event) =>
                                updateDraftField(
                                  "fulfillmentKind",
                                  event.target.value as StoreProduct["fulfillmentKind"],
                                )
                              }
                            >
                              {fulfillmentOptions.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className={capTheme.storeFieldInline}>
                            <span>Inventory</span>
                            <input
                              type="number"
                              min="0"
                              placeholder="Unlimited"
                              value={
                                draft?.inventoryCount === null || draft?.inventoryCount === undefined
                                  ? ""
                                  : draft.inventoryCount
                              }
                              onChange={(event) =>
                                updateDraftField(
                                  "inventoryCount",
                                  event.target.value === ""
                                    ? null
                                    : Number.parseInt(event.target.value, 10),
                                )
                              }
                            />
                          </label>
                          <label className={capTheme.storeField}>
                            <span>Fulfillment URL (for download/external)</span>
                            <input
                              type="url"
                              placeholder="https://example.com/download"
                              value={draft?.fulfillmentUrl ?? ""}
                              onChange={(event) =>
                                updateDraftField("fulfillmentUrl", event.target.value)
                              }
                            />
                          </label>
                          <label className={capTheme.storeToggle}>
                            <input
                              type="checkbox"
                              checked={draft?.active ?? product.active}
                              onChange={(event) => updateDraftField("active", event.target.checked)}
                            />
                            <span>Published (visible to buyers)</span>
                          </label>
                          <div className={capTheme.storeField}>
                            <span>Variants / options (optional)</span>
                            <div
                              style={{
                                display: "grid",
                                gap: "10px",
                                marginTop: "8px",
                              }}
                            >
                              {(draft?.variants ?? product.variants).map((variant) => (
                                <div
                                  key={variant.id}
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "1.4fr 1fr 1fr auto",
                                    gap: "8px",
                                    alignItems: "center",
                                  }}
                                >
                                  <input
                                    type="text"
                                    placeholder="Option label (e.g., Size M, Blue)"
                                    value={variant.label}
                                    onChange={(event) =>
                                      updateDraftVariant(variant.id, { label: event.target.value })
                                    }
                                  />
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="Price override"
                                    value={
                                      typeof variant.price === "number" && !Number.isNaN(variant.price)
                                        ? variant.price
                                        : ""
                                    }
                                    onChange={(event) =>
                                      updateDraftVariant(variant.id, {
                                        price:
                                          event.target.value === ""
                                            ? null
                                            : Number.parseFloat(event.target.value),
                                      })
                                    }
                                  />
                                  <input
                                    type="number"
                                    min="0"
                                    placeholder="Inventory"
                                    value={
                                      variant.inventoryCount === null ||
                                      typeof variant.inventoryCount === "undefined"
                                        ? ""
                                        : variant.inventoryCount
                                    }
                                    onChange={(event) =>
                                      updateDraftVariant(variant.id, {
                                        inventoryCount:
                                          event.target.value === ""
                                            ? null
                                            : Number.parseInt(event.target.value, 10),
                                      })
                                    }
                                  />
                                  <button
                                    type="button"
                                    className={capTheme.storeGhostButton}
                                    onClick={() => removeDraftVariant(variant.id)}
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>
                            <div className={capTheme.storeEditorActions}>
                              <button
                                type="button"
                                className={capTheme.storeActionButton}
                                onClick={addDraftVariant}
                              >
                                Add option
                              </button>
                            </div>
                          </div>
                          <div className={capTheme.storeEditorActions}>
                            <button
                              type="button"
                              className={capTheme.storeGhostButton}
                            onClick={cancelEditingProduct}
                          >
                            Cancel
                          </button>
                          <button type="submit" className={capTheme.storePrimaryButton}>
                            Save
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div
                          className={capTheme.storeProductImage}
                          data-has-image={imageUrl ? "true" : undefined}
                        >
                          {imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={imageUrl}
                              alt={titleValue || "Store product image"}
                              loading="lazy"
                            />
                          ) : (
                            <div className={capTheme.storeImagePlaceholder}>
                              <ImageSquare size={22} weight="duotone" />
                              <span>Add an image</span>
                            </div>
                          )}
                        </div>
                          <div className={capTheme.storeProductMeta}>
                            <div className={capTheme.storeHeroMeta}>
                              <span className={capTheme.storeBadge}>{product.kind}</span>
                              <span className={capTheme.storeBadge}>{product.fulfillmentKind}</span>
                              {product.inventoryCount !== null ? (
                                <span className={capTheme.storeBadge}>
                                  {product.inventoryCount} in stock
                                </span>
                              ) : (
                                <span className={capTheme.storeBadge}>Unlimited</span>
                              )}
                              {!product.active ? (
                                <span className={capTheme.storeBadge}>Unpublished</span>
                              ) : null}
                            </div>
                            <h4 className={capTheme.storeProductTitle}>{titleValue}</h4>
                            <p className={capTheme.storeProductDescription}>{descriptionValue}</p>
                          </div>
                          <div className={capTheme.storeProductFooter}>
                            <span className={capTheme.storeProductPrice}>
                              {storeCurrencyFormatter.format(displayPrice)}
                            </span>
                            <div className={capTheme.storeProductActions}>
                              {isFounder ? (
                                <button
                                  type="button"
                                  className={capTheme.storeActionButton}
                                  onClick={() => setHeroFromProduct(product.id)}
                                >
                                  Set as hero
                                </button>
                              ) : null}
                              {product.variants.length ? (
                                <label className={capTheme.storeFieldInline}>
                                  <span>Option</span>
                                  <select
                                    value={resolveSelectedVariantId(product) ?? ""}
                                    onChange={(event) =>
                                      updateVariantSelection(
                                        product.id,
                                        event.target.value || getDefaultVariantId(product),
                                      )
                                    }
                                  >
                                    {product.variants.map((variant) => (
                                      <option key={variant.id} value={variant.id}>
                                        {variant.label} -{" "}
                                        {storeCurrencyFormatter.format(
                                          variant.price ?? product.price,
                                        )}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              ) : null}
                              <button
                                type="button"
                                className={capTheme.storePrimaryButton}
                                onClick={() => addToCart(product.id, resolveSelectedVariantId(product))}
                                disabled={!product.active && !isFounder}
                              >
                                Add to cart
                              </button>
                            </div>
                        </div>
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          <aside className={capTheme.storeCartColumn}>
            <section className={`${capTheme.storePanel} ${capTheme.storeCheckoutCard}`}>
              <header className={capTheme.storePanelHeader}>
                <ShoppingCartSimple size={18} weight="bold" />
                <div>
                  <h3>Cart</h3>
                  <p>Real-time totals for a smooth checkout.</p>
                </div>
              </header>
              {hasItems ? (
                  <ul className={capTheme.storeCartList}>
                    {cartItems.map(({ key: cartKey, product, variant, quantity, unitPrice }) => (
                      <li key={cartKey} className={capTheme.storeCartItem}>
                        <div>
                          <span>{product.title}</span>
                          {variant ? <p>{variant.label}</p> : null}
                          <p>{storeCurrencyFormatter.format(unitPrice)}</p>
                        </div>
                        <div className={capTheme.storeCartControls}>
                          <button
                            type="button"
                            className={capTheme.storeGhostButton}
                            onClick={() => decrement(cartKey)}
                            aria-label={`Decrease quantity of ${product.title}`}
                          >
                            -
                          </button>
                          <span className={capTheme.storeQuantity}>{quantity}</span>
                          <button
                            type="button"
                            className={capTheme.storeGhostButton}
                            onClick={() => increment(cartKey)}
                            aria-label={`Increase quantity of ${product.title}`}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className={capTheme.storeGhostButton}
                            onClick={() => removeFromCart(cartKey)}
                            aria-label={`Remove ${product.title}`}
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
              ) : (
                <p className={capTheme.storeCartEmpty}>
                  Your cart is empty. Add something from the grid to begin checkout.
                </p>
              )}
              <div className={capTheme.storeCartSummary}>
                <span>Subtotal</span>
                <strong>{storeCurrencyFormatter.format(subtotal)}</strong>
              </div>
              <button
                type="button"
                className={capTheme.storePrimaryButton}
                disabled={!hasItems}
                aria-disabled={!hasItems}
                onClick={() => {
                  if (!hasItems) return;
                  setCheckoutStep("shipping");
                  setCheckoutAttempted(false);
                  setOrderReference(null);
                  setCheckoutOpen(true);
                }}
              >
                {hasItems ? "Checkout" : "Add items to checkout"}
              </button>
            </section>

          <section className={`${capTheme.storePanel} ${capTheme.storeSupportPanel}`}>
            <header className={capTheme.storePanelHeader}>
                <Sparkle size={18} weight="bold" />
                <div>
                  <h3>Supports {capsuleName ?? "this capsule"}</h3>
                  <p>Every purchase fuels future drops.</p>
                </div>
              </header>
              <ol className={capTheme.storeSteps}>
                <li>
                  <span className={capTheme.storeStepIndex}>1</span>
                  <span>Checkout; creator approves quantities.</span>
                </li>
                <li>
                  <span className={capTheme.storeStepIndex}>2</span>
                  <span>Track updates from the feed or email.</span>
                </li>
                <li>
                  <span className={capTheme.storeStepIndex}>3</span>
                  <span>Enjoy your drop and share feedback.</span>
                </li>
              </ol>
            </section>
          </aside>
        </div>

        <div className={capTheme.storeSupportRow}>
          <section
            className={`${capTheme.storePanel} ${capTheme.storePanelHighlight} ${capTheme.storeSupportCard}`}
          >
            <header className={capTheme.storePanelHeader}>
              <Sparkle size={18} weight="bold" />
              <div>
                <h3>Fuel this capsule</h3>
                <p>Donate tokens or storage so everyone can create more together.</p>
              </div>
            </header>
            <div className={capTheme.storeSupportActions}>
              <button type="button" className={capTheme.storePrimaryButton}>
                Donate tokens
              </button>
              <button type="button" className={capTheme.storeActionButton}>
                Share support link
              </button>
            </div>
          </section>

          <section className={`${capTheme.storePanel} ${capTheme.storeSupportCard}`}>
            <header className={capTheme.storePanelHeader}>
              <Storefront size={18} weight="bold" />
              <div>
                <h3>Upgrade capsule tier</h3>
                <p>Unlock higher-quality models, more memory, and priority jobs.</p>
              </div>
            </header>
            <div className={capTheme.storeSupportActions}>
              <button type="button" className={capTheme.storeActionButton}>
                View capsule plans
              </button>
              <button type="button" className={capTheme.storeGhostButton}>
                What is included?
              </button>
            </div>
          </section>
        </div>

          {checkoutOpen ? (
            <div className={capTheme.checkoutOverlay} role="dialog" aria-modal="true" aria-label="Checkout">
              <div className={capTheme.checkoutSheet}>
                <header className={capTheme.checkoutHeader}>
                  <div>
                    <p className={capTheme.checkoutEyebrow}>Review & checkout</p>
                    <h3>
                      {checkoutStep === "shipping"
                        ? "Contact & shipping"
                        : checkoutStep === "billing"
                          ? "Billing & payment"
                          : checkoutStep === "review"
                            ? "Review order"
                            : "Order confirmed"}
                    </h3>
                  </div>
                  <button
                    type="button"
                    className={capTheme.storeGhostButton}
                    onClick={() => setCheckoutOpen(false)}
                    aria-label="Close checkout"
                  >
                    <X size={16} weight="bold" />
                    Close
                  </button>
                </header>

                <div className={capTheme.checkoutStepper}>
                  {checkoutSteps.map((step, index) => {
                    const detail = checkoutStepDetails[step];
                    const status =
                      index < currentStepIndex
                        ? "done"
                        : index === currentStepIndex
                          ? "active"
                          : "upcoming";
                    const muted =
                      step === "confirmation" && !orderReference && checkoutStep !== "confirmation";
                    return (
                      <div
                        key={step}
                        className={capTheme.checkoutStepBadge}
                        data-status={status}
                        data-muted={muted ? "true" : undefined}
                      >
                        <span className={capTheme.checkoutStepIndex}>{index + 1}</span>
                        <div>
                          <strong>{detail.label}</strong>
                          <p>{detail.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className={capTheme.checkoutLayout}>
                  <form
                    className={capTheme.checkoutSection}
                    onSubmit={(event) => {
                      event.preventDefault();
                      handleNextStep();
                    }}
                  >
                    {checkoutStep === "shipping" ? (
                      <>
                        <div className={capTheme.checkoutGroup}>
                          <div className={capTheme.checkoutGroupHeader}>
                            <EnvelopeSimple size={16} weight="bold" />
                            <div>
                              <h4>Contact</h4>
                              <p>Where we&apos;ll send updates and receipts.</p>
                            </div>
                          </div>
                          <label
                            className={capTheme.storeField}
                            data-invalid={errorFor("email") ? "true" : undefined}
                          >
                            <span>Email</span>
                            <input
                              type="email"
                              value={checkoutDetails.email}
                              onChange={(event) => updateCheckoutField("email", event.target.value)}
                            />
                            {errorFor("email") ? (
                              <p className={capTheme.checkoutError}>{errorFor("email")}</p>
                            ) : null}
                          </label>
                          <label className={capTheme.storeField}>
                            <span>Phone (optional)</span>
                            <input
                              type="tel"
                              value={checkoutDetails.phone}
                              onChange={(event) => updateCheckoutField("phone", event.target.value)}
                            />
                          </label>
                        </div>

                        <div className={capTheme.checkoutGroup}>
                          <div className={capTheme.checkoutGroupHeader}>
                            <MapPin size={16} weight="bold" />
                            <div>
                              <h4>Shipping</h4>
                              <p>Address for delivery.</p>
                            </div>
                          </div>
                          {shippingRequired ? (
                            <>
                              <label
                                className={capTheme.storeField}
                                data-invalid={errorFor("fullName") ? "true" : undefined}
                              >
                                <span>Full name</span>
                                <input
                                  type="text"
                                  value={checkoutDetails.fullName}
                                  onChange={(event) => updateCheckoutField("fullName", event.target.value)}
                                />
                                {errorFor("fullName") ? (
                                  <p className={capTheme.checkoutError}>{errorFor("fullName")}</p>
                                ) : null}
                              </label>
                              <label
                                className={capTheme.storeField}
                                data-invalid={errorFor("address1") ? "true" : undefined}
                              >
                                <span>Address line 1</span>
                                <input
                                  type="text"
                                  value={checkoutDetails.address1}
                                  onChange={(event) => updateCheckoutField("address1", event.target.value)}
                                />
                                {errorFor("address1") ? (
                                  <p className={capTheme.checkoutError}>{errorFor("address1")}</p>
                                ) : null}
                              </label>
                              <label className={capTheme.storeField}>
                                <span>Address line 2</span>
                                <input
                                  type="text"
                                  value={checkoutDetails.address2}
                                  onChange={(event) => updateCheckoutField("address2", event.target.value)}
                                />
                              </label>
                              <div className={capTheme.checkoutFieldRow}>
                                <label
                                  className={capTheme.storeField}
                                  data-invalid={errorFor("city") ? "true" : undefined}
                                >
                                  <span>City</span>
                                  <input
                                    type="text"
                                    value={checkoutDetails.city}
                                    onChange={(event) => updateCheckoutField("city", event.target.value)}
                                  />
                                  {errorFor("city") ? (
                                    <p className={capTheme.checkoutError}>{errorFor("city")}</p>
                                  ) : null}
                                </label>
                                <label
                                  className={capTheme.storeField}
                                  data-invalid={errorFor("region") ? "true" : undefined}
                                >
                                  <span>State / Region</span>
                                  <input
                                    type="text"
                                    value={checkoutDetails.region}
                                    onChange={(event) => updateCheckoutField("region", event.target.value)}
                                  />
                                  {errorFor("region") ? (
                                    <p className={capTheme.checkoutError}>{errorFor("region")}</p>
                                  ) : null}
                                </label>
                              </div>
                              <div className={capTheme.checkoutFieldRow}>
                                <label
                                  className={capTheme.storeField}
                                  data-invalid={errorFor("postal") ? "true" : undefined}
                                >
                                  <span>Postal code</span>
                                  <input
                                    type="text"
                                    value={checkoutDetails.postal}
                                    onChange={(event) => updateCheckoutField("postal", event.target.value)}
                                  />
                                  {errorFor("postal") ? (
                                    <p className={capTheme.checkoutError}>{errorFor("postal")}</p>
                                  ) : null}
                                </label>
                                <label
                                  className={capTheme.storeField}
                                  data-invalid={errorFor("country") ? "true" : undefined}
                                >
                                  <span>Country</span>
                                  <input
                                    type="text"
                                    value={checkoutDetails.country}
                                    onChange={(event) => updateCheckoutField("country", event.target.value)}
                                  />
                                  {errorFor("country") ? (
                                    <p className={capTheme.checkoutError}>{errorFor("country")}</p>
                                  ) : null}
                                </label>
                              </div>

                              <div
                                className={capTheme.checkoutOptions}
                                data-invalid={errorFor("shippingOption") ? "true" : undefined}
                              >
                                {shippingOptions.map((option) => (
                                  <label key={option.id} className={capTheme.checkoutOptionCard}>
                                    <input
                                      type="radio"
                                      name="shipping-option"
                                      value={option.id}
                                      checked={checkoutDetails.shippingOption === option.id}
                                      onChange={(event) => updateCheckoutField("shippingOption", event.target.value)}
                                    />
                                    <div>
                                      <div className={capTheme.checkoutOptionTop}>
                                        <strong>{option.label}</strong>
                                        <span>
                                          {option.price === 0 ? "Free" : storeCurrencyFormatter.format(option.price)}
                                        </span>
                                      </div>
                                      <p>{option.detail}</p>
                                    </div>
                                  </label>
                                ))}
                              </div>
                              {errorFor("shippingOption") ? (
                                <p className={capTheme.checkoutError}>{errorFor("shippingOption")}</p>
                              ) : null}
                            </>
                          ) : (
                            <p className={capTheme.checkoutEyebrow}>No shipping required for this order.</p>
                          )}
                        </div>
                      </>
                    ) : null}

                    {checkoutStep === "billing" ? (
                      <>
                        <div className={capTheme.checkoutGroup}>
                          <div className={capTheme.checkoutGroupHeader}>
                            <CreditCard size={16} weight="bold" />
                            <div>
                              <h4>Payment</h4>
                              <p>Select your payment method.</p>
                            </div>
                          </div>
                          <div className={capTheme.checkoutOptions}>
                            {paymentOptions.map((option) => (
                              <label key={option.id} className={capTheme.checkoutOptionCard}>
                                <input
                                  type="radio"
                                  name="payment-option"
                                  value={option.id}
                                  checked={checkoutDetails.paymentMethod === option.id}
                                  onChange={(event) => updateCheckoutField("paymentMethod", event.target.value)}
                                />
                                <div className={capTheme.checkoutOptionTop}>
                                  <strong>{option.label}</strong>
                                  <span>{option.detail}</span>
                                </div>
                              </label>
                            ))}
                          </div>
                          <label
                            className={capTheme.storeField}
                            data-invalid={errorFor("cardName") ? "true" : undefined}
                          >
                            <span>Name on card</span>
                            <input
                              type="text"
                              value={checkoutDetails.cardName}
                              onChange={(event) => updateCheckoutField("cardName", event.target.value)}
                            />
                            {errorFor("cardName") ? (
                              <p className={capTheme.checkoutError}>{errorFor("cardName")}</p>
                            ) : null}
                          </label>
                          <div className={capTheme.checkoutFieldRow}>
                            <label
                              className={capTheme.storeField}
                              data-invalid={errorFor("cardNumber") ? "true" : undefined}
                            >
                              <span>Card number</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={checkoutDetails.cardNumber}
                                onChange={(event) => updateCheckoutField("cardNumber", event.target.value)}
                                placeholder="4242 4242 4242 4242"
                              />
                              {errorFor("cardNumber") ? (
                                <p className={capTheme.checkoutError}>{errorFor("cardNumber")}</p>
                              ) : null}
                            </label>
                            <label
                              className={capTheme.storeField}
                              data-invalid={errorFor("cardExpiry") ? "true" : undefined}
                            >
                              <span>Expiry</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={checkoutDetails.cardExpiry}
                                onChange={(event) => updateCheckoutField("cardExpiry", event.target.value)}
                                placeholder="MM/YY"
                              />
                              {errorFor("cardExpiry") ? (
                                <p className={capTheme.checkoutError}>{errorFor("cardExpiry")}</p>
                              ) : null}
                            </label>
                            <label
                              className={capTheme.storeField}
                              data-invalid={errorFor("cardCvc") ? "true" : undefined}
                            >
                              <span>CVC</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={checkoutDetails.cardCvc}
                                onChange={(event) => updateCheckoutField("cardCvc", event.target.value)}
                                placeholder="123"
                              />
                              {errorFor("cardCvc") ? (
                                <p className={capTheme.checkoutError}>{errorFor("cardCvc")}</p>
                              ) : null}
                            </label>
                          </div>
                          <label className={capTheme.storeField}>
                            <span>Order notes (optional)</span>
                            <textarea
                              rows={3}
                              value={checkoutDetails.notes}
                              onChange={(event) => updateCheckoutField("notes", event.target.value)}
                            />
                          </label>
                        </div>

                        <div className={capTheme.checkoutGroup}>
                          <div className={capTheme.checkoutGroupHeader}>
                            <MapPin size={16} weight="bold" />
                            <div>
                              <h4>Billing address</h4>
                              <p>For receipts and verification.</p>
                            </div>
                          </div>
                          {shippingRequired ? (
                            <label className={capTheme.checkoutToggle}>
                              <input
                                type="checkbox"
                                checked={checkoutDetails.billingSameAsShipping}
                                onChange={(event) => updateCheckoutField("billingSameAsShipping", event.target.checked)}
                              />
                              <span>Use shipping address for billing</span>
                            </label>
                          ) : (
                            <p className={capTheme.checkoutHint}>
                              Billing details are required for digital items.
                            </p>
                          )}
                          {needsBillingAddress ? (
                            <>
                              <label
                                className={capTheme.storeField}
                                data-invalid={errorFor("billingName") ? "true" : undefined}
                              >
                                <span>Billing name</span>
                                <input
                                  type="text"
                                  value={checkoutDetails.billingName}
                                  onChange={(event) => updateCheckoutField("billingName", event.target.value)}
                                />
                                {errorFor("billingName") ? (
                                  <p className={capTheme.checkoutError}>{errorFor("billingName")}</p>
                                ) : null}
                              </label>
                              <label
                                className={capTheme.storeField}
                                data-invalid={errorFor("billingAddress1") ? "true" : undefined}
                              >
                                <span>Billing address</span>
                                <input
                                  type="text"
                                  value={checkoutDetails.billingAddress1}
                                  onChange={(event) => updateCheckoutField("billingAddress1", event.target.value)}
                                />
                                {errorFor("billingAddress1") ? (
                                  <p className={capTheme.checkoutError}>{errorFor("billingAddress1")}</p>
                                ) : null}
                              </label>
                              <label className={capTheme.storeField}>
                                <span>Address line 2</span>
                                <input
                                  type="text"
                                  value={checkoutDetails.billingAddress2}
                                  onChange={(event) => updateCheckoutField("billingAddress2", event.target.value)}
                                />
                              </label>
                              <div className={capTheme.checkoutFieldRow}>
                                <label
                                  className={capTheme.storeField}
                                  data-invalid={errorFor("billingCity") ? "true" : undefined}
                                >
                                  <span>City</span>
                                  <input
                                    type="text"
                                    value={checkoutDetails.billingCity}
                                    onChange={(event) => updateCheckoutField("billingCity", event.target.value)}
                                  />
                                  {errorFor("billingCity") ? (
                                    <p className={capTheme.checkoutError}>{errorFor("billingCity")}</p>
                                  ) : null}
                                </label>
                                <label
                                  className={capTheme.storeField}
                                  data-invalid={errorFor("billingRegion") ? "true" : undefined}
                                >
                                  <span>State / Region</span>
                                  <input
                                    type="text"
                                    value={checkoutDetails.billingRegion}
                                    onChange={(event) => updateCheckoutField("billingRegion", event.target.value)}
                                  />
                                  {errorFor("billingRegion") ? (
                                    <p className={capTheme.checkoutError}>{errorFor("billingRegion")}</p>
                                  ) : null}
                                </label>
                              </div>
                              <div className={capTheme.checkoutFieldRow}>
                                <label
                                  className={capTheme.storeField}
                                  data-invalid={errorFor("billingPostal") ? "true" : undefined}
                                >
                                  <span>Postal code</span>
                                  <input
                                    type="text"
                                    value={checkoutDetails.billingPostal}
                                    onChange={(event) => updateCheckoutField("billingPostal", event.target.value)}
                                  />
                                  {errorFor("billingPostal") ? (
                                    <p className={capTheme.checkoutError}>{errorFor("billingPostal")}</p>
                                  ) : null}
                                </label>
                                <label
                                  className={capTheme.storeField}
                                  data-invalid={errorFor("billingCountry") ? "true" : undefined}
                                >
                                  <span>Country</span>
                                  <input
                                    type="text"
                                    value={checkoutDetails.billingCountry}
                                    onChange={(event) => updateCheckoutField("billingCountry", event.target.value)}
                                  />
                                  {errorFor("billingCountry") ? (
                                    <p className={capTheme.checkoutError}>{errorFor("billingCountry")}</p>
                                  ) : null}
                                </label>
                              </div>
                            </>
                          ) : (
                            <p className={capTheme.checkoutEyebrow}>
                              Billing address will match your shipping details.
                            </p>
                          )}
                        </div>
                      </>
                    ) : null}

                    {checkoutStep === "review" ? (
                      <div className={capTheme.checkoutReviewGrid}>
                        <div className={capTheme.checkoutReviewCard}>
                          <div className={capTheme.checkoutReviewHeader}>
                            <EnvelopeSimple size={16} weight="bold" />
                            <div>
                              <strong>Contact</strong>
                              <p>Receipts and updates</p>
                            </div>
                          </div>
                          <p className={capTheme.checkoutReviewValue}>{checkoutDetails.email || "Add an email"}</p>
                          {checkoutDetails.phone ? (
                            <p className={capTheme.checkoutReviewValue}>{checkoutDetails.phone}</p>
                          ) : (
                            <p className={capTheme.checkoutHint}>Phone is optional.</p>
                          )}
                          <button
                            type="button"
                            className={capTheme.storeGhostButton}
                            onClick={() => setCheckoutStep("shipping")}
                          >
                            Edit contact
                          </button>
                        </div>

                        <div className={capTheme.checkoutReviewCard}>
                          <div className={capTheme.checkoutReviewHeader}>
                            <MapPin size={16} weight="bold" />
                            <div>
                              <strong>Shipping</strong>
                              <p>Where it&apos;s headed</p>
                            </div>
                          </div>
                          {shippingRequired ? (
                            <>
                              <p className={capTheme.checkoutReviewValue}>{checkoutDetails.fullName}</p>
                              <p className={capTheme.checkoutReviewValue}>{checkoutDetails.address1}</p>
                              {checkoutDetails.address2 ? (
                                <p className={capTheme.checkoutReviewValue}>{checkoutDetails.address2}</p>
                              ) : null}
                              <p className={capTheme.checkoutReviewValue}>
                                {[checkoutDetails.city, checkoutDetails.region, checkoutDetails.postal]
                                  .filter(Boolean)
                                  .join(", ")}
                              </p>
                              <p className={capTheme.checkoutReviewValue}>{checkoutDetails.country}</p>
                              <p className={capTheme.checkoutHint}>
                                {selectedShipping
                                  ? `${selectedShipping.label} (${storeCurrencyFormatter.format(selectedShipping.price)})`
                                  : "Select a shipping option"}
                              </p>
                            </>
                          ) : (
                            <p className={capTheme.checkoutHint}>Digital delivery — no shipping needed.</p>
                          )}
                          <button
                            type="button"
                            className={capTheme.storeGhostButton}
                            onClick={() => setCheckoutStep("shipping")}
                          >
                            Edit shipping
                          </button>
                        </div>

                        <div className={capTheme.checkoutReviewCard}>
                          <div className={capTheme.checkoutReviewHeader}>
                            <CreditCard size={16} weight="bold" />
                            <div>
                              <strong>Billing & payment</strong>
                              <p>How you&apos;re paying</p>
                            </div>
                          </div>
                          <p className={capTheme.checkoutReviewValue}>{selectedPaymentOption.label}</p>
                          <p className={capTheme.checkoutReviewValue}>
                            {maskedCardSummary} - {checkoutDetails.cardExpiry || "MM/YY"}
                          </p>
                          <p className={capTheme.checkoutReviewValue}>
                            {billingSnapshot.name}
                            <br />
                            {billingSnapshot.address1}
                            {billingSnapshot.address2 ? (
                              <>
                                <br />
                                {billingSnapshot.address2}
                              </>
                            ) : null}
                            <br />
                            {[billingSnapshot.city, billingSnapshot.region, billingSnapshot.postal]
                              .filter(Boolean)
                              .join(", ")}
                            <br />
                            {billingSnapshot.country}
                          </p>
                          <button
                            type="button"
                            className={capTheme.storeGhostButton}
                            onClick={() => setCheckoutStep("billing")}
                          >
                            Edit billing
                          </button>
                        </div>

                        {checkoutDetails.notes ? (
                          <div className={capTheme.checkoutReviewCard}>
                            <div className={capTheme.checkoutReviewHeader}>
                              <PencilSimple size={16} weight="bold" />
                              <div>
                                <strong>Order notes</strong>
                                <p>Special instructions</p>
                              </div>
                            </div>
                            <p className={capTheme.checkoutReviewValue}>{checkoutDetails.notes}</p>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {checkoutStep === "confirmation" ? (
                      <div className={capTheme.checkoutConfirmation}>
                        <div className={capTheme.checkoutConfirmationIcon}>
                          <CheckCircle size={32} weight="duotone" />
                        </div>
                        <h4>Order submitted</h4>
                        <p className={capTheme.checkoutReviewValue}>
                          Reference {orderReference ?? "pending reference"}.
                        </p>
                        <p className={capTheme.checkoutHint}>
                          We&apos;ll email {checkoutDetails.email || "your inbox"} as fulfillment begins.
                        </p>
                      </div>
                    ) : null}
                </form>

                <aside className={capTheme.checkoutSummary}>
                  <div className={capTheme.checkoutSummaryHeader}>
                    <h4>Order summary</h4>
                    <span>
                      {cartItems.length} item{cartItems.length === 1 ? "" : "s"} - Step{" "}
                      {Math.min(currentStepIndex + 1, checkoutSteps.length)} of {checkoutSteps.length}
                    </span>
                  </div>
                  {errorFor("cart") ? (
                    <p className={capTheme.checkoutError}>{errorFor("cart")}</p>
                  ) : null}
                  <ul className={capTheme.checkoutList}>
                    {cartItems.map(({ key: cartKey, product, variant, quantity, unitPrice }) => (
                      <li key={cartKey} className={capTheme.checkoutLineItem}>
                        <div>
                          <strong>{product.title}</strong>
                          {variant ? <p>{variant.label}</p> : null}
                          <p>{product.description}</p>
                          <div className={capTheme.storeCartControls}>
                            <button
                              type="button"
                              className={capTheme.storeGhostButton}
                              onClick={() => decrement(cartKey)}
                              aria-label={`Decrease quantity of ${product.title}`}
                            >
                              -
                            </button>
                            <span className={capTheme.storeQuantity}>{quantity}</span>
                            <button
                              type="button"
                              className={capTheme.storeGhostButton}
                              onClick={() => increment(cartKey)}
                              aria-label={`Increase quantity of ${product.title}`}
                            >
                              +
                            </button>
                            <button
                              type="button"
                              className={capTheme.storeGhostButton}
                              onClick={() => removeFromCart(cartKey)}
                              aria-label={`Remove ${product.title}`}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                        <div className={capTheme.checkoutPrice}>
                          <span>{storeCurrencyFormatter.format(unitPrice * quantity)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className={capTheme.checkoutPromo}>
                    <label className={capTheme.storeField}>
                      <span>
                        <SealPercent size={14} weight="bold" /> Promo code
                      </span>
                      <div className={capTheme.checkoutPromoRow}>
                        <input
                          type="text"
                          value={checkoutDetails.promoCode}
                          onChange={(event) => updateCheckoutField("promoCode", event.target.value)}
                          placeholder="SUMMER25"
                        />
                        <button type="button" className={capTheme.storeActionButton}>
                          Apply
                        </button>
                      </div>
                    </label>
                  </div>

                  <div className={capTheme.checkoutTotals}>
                    <div>
                      <span>Subtotal</span>
                      <strong>{storeCurrencyFormatter.format(subtotal)}</strong>
                    </div>
                    <div>
                      <span>Shipping</span>
                      <strong>{storeCurrencyFormatter.format(shippingCost)}</strong>
                    </div>
                    <div>
                      <span>Tax (est.)</span>
                      <strong>{storeCurrencyFormatter.format(taxEstimate)}</strong>
                    </div>
                    <div className={capTheme.checkoutTotalRow}>
                      <span>Total</span>
                      <strong>{storeCurrencyFormatter.format(orderTotal)}</strong>
                    </div>
                  </div>

                  {checkoutStep === "review" ? (
                    <div className={capTheme.checkoutFooter}>
                      <label
                        className={capTheme.checkoutTerms}
                        data-invalid={errorFor("terms") ? "true" : undefined}
                      >
                        <input
                          type="checkbox"
                          checked={checkoutDetails.termsAccepted}
                          onChange={(event) => updateCheckoutField("termsAccepted", event.target.checked)}
                        />
                        <span>I agree to the store terms and refund policy.</span>
                      </label>
                      {errorFor("terms") ? (
                        <p className={capTheme.checkoutError}>{errorFor("terms")}</p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className={capTheme.checkoutActions}>
                    <button
                      type="button"
                      className={capTheme.storeGhostButton}
                      onClick={handleBackStep}
                    >
                      {checkoutStep === "shipping" ? "Back to cart" : "Back"}
                    </button>
                    {checkoutStep === "confirmation" ? (
                      <button
                        type="button"
                        className={capTheme.storePrimaryButton}
                        onClick={() => setCheckoutOpen(false)}
                      >
                        Close
                      </button>
                    ) : checkoutStep === "review" ? (
                      <button
                        type="button"
                        className={capTheme.storePrimaryButton}
                        disabled={!canPlaceOrder}
                        aria-disabled={!canPlaceOrder}
                        onClick={placeOrder}
                      >
                        Place order
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={capTheme.storePrimaryButton}
                        onClick={handleNextStep}
                      >
                        {checkoutStep === "shipping" ? "Next: Billing" : "Next: Review"}
                      </button>
                    )}
                  </div>
                </aside>
              </div>
            </div>
          </div>
        ) : null}
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
