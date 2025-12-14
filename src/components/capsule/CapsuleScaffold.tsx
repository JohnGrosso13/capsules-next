"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Broadcast, Newspaper, Storefront } from "@phosphor-icons/react/dist/ssr";
import { AiPrompterStage, type PrompterChip } from "@/components/ai-prompter-stage";
import { CapsuleMembersPanel } from "@/components/capsule/CapsuleMembersPanel";
import { CapsuleEventsSection } from "@/components/capsule/CapsuleEventsSection";
import { useComposerActions } from "@/components/composer/ComposerProvider";
import { buildPrompterAttachment, type DocumentCardData } from "@/components/documents/document-card";
import { formatFeedCount } from "@/hooks/useHomeFeed";
import { useCapsuleLadders } from "@/hooks/useCapsuleLadders";
import { useCapsuleMembership } from "@/hooks/useCapsuleMembership";
import { useCurrentUser } from "@/services/auth/client";
import capTheme from "@/app/(authenticated)/capsule/capsule.module.css";
import {
  CapsuleBannerCustomizer,
  CapsuleLogoCustomizer,
  CapsuleStoreBannerCustomizer,
  CapsuleTileCustomizer,
} from "./CapsuleCustomizer";
import { useCapsuleLibrary } from "@/hooks/useCapsuleLibrary";
import { CapsuleStoreView } from "./CapsuleStoreView";
import { CapsuleHero, type CapsuleHeroSection } from "./CapsuleHero";
import { CapsuleMediaSection, CapsuleFilesSection } from "./CapsuleLibrarySections";
import { CapsuleHistorySection } from "./CapsuleHistorySection";
import { LiveStreamCanvas } from "./LiveStreamCanvas";
import { CapsuleFeed } from "./CapsuleFeed";
import ShareSheet from "@/components/home-feed/ShareSheet";

type CapsuleTab = "live" | "feed" | "store";
type FeedTargetDetail = { scope?: string | null; capsuleId?: string | null };
const FEED_TARGET_EVENT = "composer:feed-target";
export type CapsuleContentProps = {
  capsuleId?: string | null;
  capsuleName?: string | null;
};

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
  const [sharePayload, setSharePayload] = React.useState<{ url: string; title: string; text: string } | null>(
    null,
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

  const capsuleShareUrl = React.useMemo(() => {
    if (!capsuleId) return null;
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? null;
    if (!origin) return null;
    return `${origin}/capsule?capsuleId=${encodeURIComponent(capsuleId)}`;
  }, [capsuleId]);

  const handleShareCapsule = React.useCallback(() => {
    if (!capsuleShareUrl) return;
    const title = capsuleName ? `${capsuleName} on Capsules` : "Check out this Capsule";
    const text = capsuleName ? `Join ${capsuleName} on Capsules.` : "Join this Capsule on Capsules.";
    setSharePayload({ url: capsuleShareUrl, title, text });
  }, [capsuleName, capsuleShareUrl]);

  const closeShareSheet = React.useCallback(() => setSharePayload(null), []);

  const canNativeShare = React.useMemo(() => {
    if (!sharePayload?.url) return false;
    return typeof navigator !== "undefined" && typeof navigator.share === "function";
  }, [sharePayload?.url]);

  const handleNativeShare = React.useCallback(() => {
    if (!sharePayload?.url || typeof navigator === "undefined" || typeof navigator.share !== "function") return;
    void navigator
      .share({
        url: sharePayload.url,
        title: sharePayload.title,
        text: sharePayload.text,
      })
      .catch((error) => {
        if (error && (error as { name?: string }).name !== "AbortError") {
          console.warn("capsule.share.native_failed", error);
        }
      });
  }, [sharePayload]);

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
            onShare={capsuleShareUrl ? handleShareCapsule : null}
            shareDisabled={!capsuleShareUrl}
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
          capsuleId={capsuleId}
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
      <ShareSheet
        open={Boolean(sharePayload)}
        url={sharePayload?.url ?? null}
        title={sharePayload?.title ?? ""}
        text={sharePayload?.text ?? ""}
        onClose={closeShareSheet}
        canNativeShare={canNativeShare}
        onNativeShare={handleNativeShare}
      />
    </>
  );
}

