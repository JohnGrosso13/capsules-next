"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Broadcast,
  CaretDown,
  MagnifyingGlass,
  MagicWand,
  ImageSquare,
  Newspaper,
  PencilSimple,
  PlusCircle,
  ShoppingCartSimple,
  SquaresFour,
  Storefront,
  ShareFat,
  TShirt,
  UsersThree,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import { AiPrompterStage, type PrompterAction } from "@/components/ai-prompter-stage";
import { CapsuleMembersPanel } from "@/components/capsule/CapsuleMembersPanel";
import { CapsuleEventsSection } from "@/components/capsule/CapsuleEventsSection";
import { Button } from "@/components/ui/button";
import { useComposer } from "@/components/composer/ComposerProvider";
import { HomeFeedList } from "@/components/home-feed-list";
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
import { formatRelativeTime } from "@/lib/composer/sidebar-types";

type CapsuleTab = "live" | "feed" | "store";
type FeedTargetDetail = { scope?: string | null; capsuleId?: string | null };
const FEED_TARGET_EVENT = "composer:feed-target";
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
  const composer = useComposer();
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
  const canCustomize = Boolean(viewer?.isOwner);
  const isAuthenticated = Boolean(user);
  const pendingCount = viewer?.isOwner ? (membership?.counts.pendingRequests ?? 0) : 0;
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
  const showMembersBadge = Boolean(viewer?.isOwner && pendingCount > 0);
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
            membersOpen={membersOpen}
            showMembersBadge={showMembersBadge}
            pendingCount={pendingCount}
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
            />
          ) : (
            <>
              <div className={capTheme.prompterTop}>{prompter}</div>
              {heroSection === "events" ? (
                <CapsuleEventsSection
                  capsuleId={capsuleId ?? null}
                  ladders={capsuleLadders}
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
          <LiveStreamCanvas />
        </div>
      ) : (
        <CapsuleStorePlaceholder
          storeBannerUrl={capsuleStoreBannerUrl}
          canCustomize={canCustomize}
          onCustomizeStoreBanner={() => setStoreCustomizerOpen(true)}
          onPrompterAction={composer.handlePrompterAction}
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
  membersOpen: boolean;
  showMembersBadge: boolean;
  pendingCount: number;
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
  membersOpen,
  showMembersBadge,
  pendingCount,
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
      </div>
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
    <section className={`${feedStyles.feed} ${capTheme.feedWrap}`.trim()}>
      <div className={capTheme.libraryState}>
        <p>{message}</p>
        {onRetry ? (
          <button type="button" className={capTheme.heroAction} onClick={onRetry}>
            Try again
          </button>
        ) : null}
      </div>
    </section>
  );
}

function CapsuleMediaSection({ items, loading, error, onRetry }: CapsuleLibrarySectionProps) {
  if (loading) return <CapsuleLibraryState message="Loading media..." />;
  if (error) return <CapsuleLibraryState message={error} onRetry={onRetry} />;
  if (!items.length) return <CapsuleLibraryState message="No media shared yet." />;

  return (
    <section className={`${feedStyles.feed} ${capTheme.feedWrap}`.trim()}>
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
    </section>
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
    <section className={`${feedStyles.feed} ${capTheme.feedWrap}`.trim()}>
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
    </section>
  );
}

function CapsuleHistorySection({
  capsuleId,
  capsuleName,
}: {
  capsuleId: string | null;
  capsuleName: string | null;
}) {
  const { sections, generatedAt, loading, error, refresh } = useCapsuleHistory(capsuleId);

  const handleRefresh = React.useCallback(() => {
    void refresh(true);
  }, [refresh]);

  const handleRetry = React.useCallback(() => {
    void refresh(true);
  }, [refresh]);

  if (!capsuleId) {
    return <CapsuleLibraryState message="Select a capsule to see its history." />;
  }

  if (loading && !sections.length) {
    return <CapsuleLibraryState message="Building capsule history..." />;
  }

  if (error) {
    return <CapsuleLibraryState message={error} onRetry={handleRetry} />;
  }

  if (!sections.length) {
    return (
      <CapsuleLibraryState message="No activity yet. Post updates to start your capsule wiki." />
    );
  }

  const subtitle = capsuleName
    ? `Automations keep ${capsuleName} updated with weekly and monthly recaps.`
    : "Automations keep this capsule updated with weekly and monthly recaps.";

  const relativeUpdate =
    generatedAt && formatRelativeTime(generatedAt)
      ? `Updated ${formatRelativeTime(generatedAt)}`
      : "Automation ready";

  return (
    <section className={`${feedStyles.feed} ${capTheme.feedWrap}`.trim()}>
      <div className={capTheme.historyWrap}>
        <header className={capTheme.historyHeader}>
          <div className={capTheme.historyTitleGroup}>
            <h3 className={capTheme.historyTitle}>Capsule History</h3>
            <p className={capTheme.historySubtitle}>{subtitle}</p>
          </div>
          <div className={capTheme.historyActions}>
            <span className={capTheme.historyMeta}>{relativeUpdate}</span>
            <Button type="button" size="sm" variant="outline" disabled={loading} onClick={handleRefresh}>
              Refresh summary
            </Button>
          </div>
        </header>
        <div className={capTheme.historyGrid}>
          {sections.map((section) => (
            <article key={section.period} className={capTheme.historyCard}>
              <header className={capTheme.historyCardHeader}>
                <div>
                  <span className={capTheme.historyBadge}>{section.title}</span>
                  <span className={capTheme.historyRange}>
                    {formatHistoryRange(section.timeframe.start, section.timeframe.end)}
                  </span>
                </div>
                <span className={capTheme.historyCount}>
                  {section.postCount} {section.postCount === 1 ? "post" : "posts"}
                </span>
              </header>
              <p className={capTheme.historySummary}>{section.summary}</p>
              {section.highlights.length ? (
                <div className={capTheme.historyBlock}>
                  <h4 className={capTheme.historyBlockTitle}>Highlights</h4>
                  <ul className={capTheme.historyList}>
                    {section.highlights.map((item, index) => (
                      <li key={`${section.period}-highlight-${index}`} className={capTheme.historyListItem}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {section.timeline.length ? (
                <div className={capTheme.historyBlock}>
                  <h4 className={capTheme.historyBlockTitle}>Timeline</h4>
                  <ol className={capTheme.historyTimeline}>
                    {section.timeline.map((item, index) => (
                      <li key={`${section.period}-timeline-${index}`} className={capTheme.historyTimelineItem}>
                        <div className={capTheme.historyTimelineLabel}>
                          <span>{item.label}</span>
                          {formatTimelineDate(item.timestamp) ? (
                            <span className={capTheme.historyTimelineDate}>
                              {formatTimelineDate(item.timestamp)}
                            </span>
                          ) : null}
                        </div>
                        <p className={capTheme.historyTimelineDetail}>{item.detail}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
              {section.nextFocus.length ? (
                <div className={capTheme.historyBlock}>
                  <h4 className={capTheme.historyBlockTitle}>Suggested next focus</h4>
                  <ul className={capTheme.historyList}>
                    {section.nextFocus.map((item, index) => (
                      <li key={`${section.period}-next-${index}`} className={capTheme.historyListItem}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {section.isEmpty ? (
                <p className={capTheme.historyEmpty}>
                  Automation didn&apos;t find new activity for this period yet.
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function formatHistoryRange(start: string | null, end: string | null): string {
  if (!start && !end) return "All time";
  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const normalize = (date: Date | null) =>
    date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined, options) : null;
  const startText = normalize(startDate);
  const endText = normalize(endDate);
  if (startText && endText) {
    if (startText === endText) return startText;
    return `${startText} — ${endText}`;
  }
  if (startText) return `Since ${startText}`;
  if (endText) return `Through ${endText}`;
  return "All time";
}

function formatTimelineDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
            Start streaming from your encoder or studio. Once the signal arrives, your show will
            appear here.
          </p>
        </div>
      </div>
    </div>
  );
}

type CapsuleStorePlaceholderProps = {
  storeBannerUrl: string | null;
  canCustomize: boolean;
  onCustomizeStoreBanner: () => void;
  onPrompterAction: (action: PrompterAction) => void;
};

function CapsuleStorePlaceholder({
  storeBannerUrl,
  canCustomize,
  onCustomizeStoreBanner,
  onPrompterAction,
}: CapsuleStorePlaceholderProps) {
  const storeBannerStyle = storeBannerUrl
    ? ({
        ["--store-banner-image" as string]: `url("${storeBannerUrl}")`,
      } as React.CSSProperties)
    : undefined;
  const storeSearchId = React.useId();
  const productSpots = [
    {
      id: "feature",
      label: "Hero drop",
      title: "Signature Hoodie",
      description: "Tell Capsule AI what artwork to mock up and the margin you want.",
      price: "$45.00",
      accent: capTheme.storeMediaBlue,
      icon: <TShirt size={36} weight="duotone" />,
      action: "Ask AI to design it",
    },
    {
      id: "collectible",
      label: "Sticker pack",
      title: "Die-cut Sticker Set",
      description: "Upload a logo or ask Capsule to remix one for your community.",
      price: "$5.00",
      accent: capTheme.storeMediaPurple,
      icon: <SquaresFour size={36} weight="duotone" />,
      action: "Reserve this slot",
    },
    {
      id: "bundle",
      label: "Bundle idea",
      title: "Creator Essentials Kit",
      description: "Bundle tees, hoodies, or digital perks. ChatGPT will stitch the story.",
      price: "$75.00",
      accent: capTheme.storeMediaAmber,
      icon: <PlusCircle size={36} weight="duotone" />,
      action: "Draft bundle with AI",
    },
    {
      id: "digital",
      label: "Digital add-on",
      title: "Exclusive Stream Overlay",
      description: "Describe the vibe and let Capsule generate assets for your fans.",
      price: "$18.00",
      accent: capTheme.storeMediaTeal,
      icon: <MagicWand size={36} weight="duotone" />,
      action: "Generate overlay concept",
    },
  ];

  const prompterChips = [
    "Draft product copy",
    "Generate pricing ideas",
    "Plan bundle drop",
    "Suggest store layout",
    "Create launch checklist",
  ];

  const cartDraft = [
    { id: "cart-hoodie", name: "Signature Hoodie", price: "$45.00", note: "Awaiting artwork" },
    { id: "cart-tee", name: "Launch Jersey Tee", price: "$28.00", note: "Sizing chart needed" },
    { id: "cart-sticker", name: "Die-cut Sticker", price: "$5.00", note: "Set of 3" },
  ];

  const quickSorts = [
    {
      id: "sort-featured",
      title: "Legendary Guild Tee",
      detail: "$22.00 • Featured drop",
      accent: capTheme.storeMediaBlue,
      icon: <TShirt size={28} weight="duotone" />,
    },
    {
      id: "sort-spotlight",
      title: "Cavern Mouse Pad",
      detail: "$18.00 • Spotlight",
      accent: capTheme.storeMediaPurple,
      icon: <ImageSquare size={28} weight="duotone" />,
    },
    {
      id: "sort-limited",
      title: "Epic Sword Sticker",
      detail: "$3.00 • Limited run",
      accent: capTheme.storeMediaAmber,
      icon: <MagicWand size={28} weight="duotone" />,
    },
  ];

  const filterSections = [
    {
      id: "category",
      label: "Category",
      options: [
        { id: "category-apparel", label: "Apparel", count: 12, active: true },
        { id: "category-accessories", label: "Accessories", count: 6, active: false },
        { id: "category-stickers", label: "Stickers", count: 9, active: false },
        { id: "category-digital", label: "Digital drops", count: 4, active: false },
      ],
    },
    {
      id: "stage",
      label: "Stage",
      options: [
        { id: "stage-draft", label: "In draft", count: 8, active: true },
        { id: "stage-review", label: "Needs review", count: 3, active: false },
        { id: "stage-live", label: "Live now", count: 2, active: false },
      ],
    },
  ];

  const filterToggles = [
    { id: "toggle-ready", label: "Show only launch-ready listings", active: false },
    { id: "toggle-collabs", label: "Include collaborator submissions", active: true },
    { id: "toggle-limited", label: "Highlight limited drops", active: true },
  ];

  const setupSteps = [
    { id: "step-assets", label: "Upload assets or describe them for AI mockups" },
    { id: "step-pricing", label: "Lock in pricing & margins for each listing" },
    { id: "step-launch", label: "Preview the storefront & schedule your launch" },
  ];
  return (
    <div
      className={`${capTheme.liveCanvas} ${capTheme.storeCanvas}`}
      aria-label="Capsule store planning"
    >
      <div className={capTheme.storeContent}>
        <section className={capTheme.storeHero}>
          <div className={capTheme.storeBannerFrame}>
            <div
              className={capTheme.storeBannerSurface}
              role="presentation"
              data-has-banner={storeBannerUrl ? "true" : undefined}
              style={storeBannerStyle}
            />
            <div className={capTheme.storeBannerActions}>
              {canCustomize ? (
                <button
                  type="button"
                  className={capTheme.storeGhostButton}
                  onClick={onCustomizeStoreBanner}
                >
                  <MagicWand size={16} weight="bold" />
                  Customize store banner
                </button>
              ) : null}
              <button type="button" className={capTheme.storeGhostButton}>
                <ShareFat size={16} weight="bold" />
                Share preview
              </button>
              <button type="button" className={capTheme.storeGhostButton}>
                <UsersThree size={16} weight="bold" />
                Invite collaborators
              </button>
            </div>
          </div>
        </section>

        <div className={`${capTheme.storePrompterWrap} ${capTheme.prompterTop}`}>
          <AiPrompterStage chips={prompterChips} onAction={onPrompterAction} />
        </div>

        <div className={capTheme.storeGrid}>
          <aside className={capTheme.storeFilters}>
            <header className={capTheme.storeFiltersHeader}>
              <div>
                <h2>Filters</h2>
                <p>Fine-tune how drops appear before launch.</p>
              </div>
              <button
                type="button"
                className={capTheme.storeClearButton}
                disabled
                aria-disabled="true"
              >
                Clear all
              </button>
            </header>

            <form
              className={capTheme.storeFiltersForm}
              aria-label="Filter storefront"
              onSubmit={(event) => event.preventDefault()}
            >
              <label className={capTheme.storeSearch} htmlFor={storeSearchId}>
                <MagnifyingGlass size={18} weight="bold" />
                <input
                  id={storeSearchId}
                  type="search"
                  placeholder="Search products, prompts, or saved concepts..."
                  disabled
                  aria-disabled="true"
                />
              </label>

              <div className={capTheme.storeFilterSections}>
                {filterSections.map((section) => (
                  <fieldset key={section.id} className={capTheme.storeFilterSection}>
                    <legend>{section.label}</legend>
                    <ul className={capTheme.storeFilterList}>
                      {section.options.map((option) => (
                        <li key={option.id}>
                          <label
                            className={capTheme.storeFilterOption}
                            data-active={option.active ? "true" : undefined}
                          >
                            <input
                              type="checkbox"
                              defaultChecked={option.active}
                              disabled
                              aria-disabled="true"
                            />
                            <span className={capTheme.storeFilterLabelText}>{option.label}</span>
                            {typeof option.count === "number" ? (
                              <span className={capTheme.storeFilterBadge}>{option.count}</span>
                            ) : null}
                          </label>
                        </li>
                      ))}
                    </ul>
                  </fieldset>
                ))}
              </div>

              <div className={capTheme.storeFilterDivider} />

              <section className={capTheme.storeSortSection} aria-label="Sort options">
                <div className={capTheme.storeSortRow}>
                  <span className={capTheme.storeSortLabel}>Sort by</span>
                  <button
                    type="button"
                    className={capTheme.storeSortButton}
                    disabled
                    aria-disabled="true"
                  >
                    <span>Relevance</span>
                    <CaretDown size={12} weight="bold" />
                  </button>
                </div>
                <div className={capTheme.storeQuickSorts}>
                  {quickSorts.map((sort) => (
                    <article key={sort.id} className={capTheme.storeQuickSortCard}>
                      <div className={`${capTheme.storeQuickSortPreview} ${sort.accent}`}>
                        {sort.icon}
                      </div>
                      <div className={capTheme.storeQuickSortMeta}>
                        <span>{sort.title}</span>
                        <strong>{sort.detail}</strong>
                      </div>
                      <button
                        type="button"
                        className={capTheme.storeQuickSortAction}
                        disabled
                        aria-disabled="true"
                      >
                        Use
                      </button>
                    </article>
                  ))}
                </div>
              </section>

              <div className={capTheme.storeFilterDivider} />

              <div className={capTheme.storeFilterToggles}>
                {filterToggles.map((toggle) => (
                  <label key={toggle.id} className={capTheme.storeToggle}>
                    <input
                      type="checkbox"
                      defaultChecked={toggle.active}
                      disabled
                      aria-disabled="true"
                    />
                    <span>{toggle.label}</span>
                  </label>
                ))}
              </div>
            </form>
          </aside>

          <section className={capTheme.storeMainColumn}>
            <header className={capTheme.storeControlsBar}>
              <div>
                <h3 className={capTheme.storeColumnTitle}>Draft listings</h3>
                <p className={capTheme.storeColumnSubtitle}>
                  Arrange tiles, then ask Capsule or ChatGPT to finalise copy, imagery, and pricing.
                </p>
              </div>
              <div className={capTheme.storeControlButtons}>
                <button
                  type="button"
                  className={capTheme.storeControlButton}
                  disabled
                  aria-disabled="true"
                >
                  <span>Sort by</span>
                  <strong>Latest edits</strong>
                </button>
                <button
                  type="button"
                  className={`${capTheme.storeControlButton} ${capTheme.storeControlIcon}`}
                  aria-label="Change layout density"
                  disabled
                  aria-disabled="true"
                >
                  <SquaresFour size={16} weight="bold" />
                </button>
              </div>
            </header>

            <div className={capTheme.storeProducts}>
              {productSpots.map((product) => (
                <article key={product.id} className={capTheme.storeProductCard}>
                  <div className={`${capTheme.storeProductMedia} ${product.accent}`}>
                    {product.icon}
                  </div>
                  <div className={capTheme.storeProductMeta}>
                    <span className={capTheme.storeProductLabel}>{product.label}</span>
                    <h4 className={capTheme.storeProductTitle}>{product.title}</h4>
                    <p className={capTheme.storeProductDescription}>{product.description}</p>
                  </div>
                  <div className={capTheme.storeProductFooter}>
                    <span className={capTheme.storeProductPrice}>{product.price}</span>
                    <button type="button" className={capTheme.storeActionButton}>
                      {product.action}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <aside className={capTheme.storeCartColumn}>
            <section className={`${capTheme.storePanel} ${capTheme.storePanelHighlight}`}>
              <header className={capTheme.storePanelHeader}>
                <ShoppingCartSimple size={18} weight="bold" />
                <div>
                  <h3>Cart</h3>
                  <p>Listings move here once you approve them for launch.</p>
                </div>
              </header>
              <ul className={capTheme.storeCartList}>
                {cartDraft.map((item) => (
                  <li key={item.id}>
                    <div>
                      <span>{item.name}</span>
                      <p>{item.note}</p>
                    </div>
                    <strong>{item.price}</strong>
                  </li>
                ))}
              </ul>
              <button type="button" className={capTheme.storePrimaryButton}>
                Review checkout
              </button>
            </section>

            <section className={capTheme.storePanel}>
              <header className={capTheme.storePanelHeader}>
                <ShareFat size={18} weight="bold" />
                <div>
                  <h3>Launch roadmap</h3>
                  <p>Follow these steps before you open the doors.</p>
                </div>
              </header>
              <ol className={capTheme.storeSteps}>
                {setupSteps.map((step, index) => (
                  <li key={step.id}>
                    <span className={capTheme.storeStepIndex}>{index + 1}</span>
                    <span>{step.label}</span>
                  </li>
                ))}
              </ol>
            </section>
          </aside>
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
    <section className={`${feedStyles.feed} ${capTheme.feedWrap}`.trim()}>
      {friendMessage && hasFetched ? (
        <div className={feedStyles.postFriendNotice}>{friendMessage}</div>
      ) : null}
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






