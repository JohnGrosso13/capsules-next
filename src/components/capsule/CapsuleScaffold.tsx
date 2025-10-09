"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Broadcast,
  MagnifyingGlass,
  MagicWand,
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
  const [bannerUrlOverride, setBannerUrlOverride] = React.useState<string | null>(null);
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
    setMemberRole,
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
  const canCustomize = Boolean(viewer?.isOwner);
  const isAuthenticated = Boolean(user);
  const pendingCount = viewer?.isOwner ? membership?.counts.pendingRequests ?? 0 : 0;
  const handleSignIn = React.useCallback(() => {
    if (typeof window === "undefined") return;
    const redirectUrl = `${window.location.pathname}${window.location.search}` || "/capsule";
    router.push(`/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`);
  }, [router]);
  const showMembers = React.useCallback(() => {
    setMembersOpen(true);
  }, []);
  const showFeatured = React.useCallback(() => {
    setMembersOpen(false);
  }, []);
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
  const capsuleBannerUrl = bannerUrlOverride ?? (membership?.capsule ? membership.capsule.bannerUrl : null);

  React.useEffect(() => {
    if (!canCustomize && bannerCustomizerOpen) {
      setBannerCustomizerOpen(false);
    }
  }, [bannerCustomizerOpen, canCustomize]);

  React.useEffect(() => {
    setBannerUrlOverride(membership?.capsule?.bannerUrl ?? null);
  }, [membership?.capsule?.bannerUrl]);

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
            bannerUrl={capsuleBannerUrl}
            canCustomize={canCustomize}
            {...(canCustomize ? { onCustomize: () => setBannerCustomizerOpen(true) } : {})}
            primaryAction={heroPrimary}
            membersOpen={membersOpen}
            showMembersBadge={showMembersBadge}
            pendingCount={pendingCount}
            onSelectMembers={showMembers}
            onSelectFeatured={showFeatured}
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
              <div
                className={`${capTheme.liveCanvas} ${capTheme.feedCanvas}`}
                aria-label="Capsule feed"
                data-capsule-id={capsuleId ?? undefined}
              >
                <CapsuleFeed capsuleId={capsuleId} capsuleName={normalizedCapsuleName} />
              </div>
            </>
          )}
        </>
      ) : tab === "live" ? (
        <div className={capTheme.liveCanvas} aria-label="Live stream area">
          <LiveStreamCanvas />
        </div>
      ) : (
        <CapsuleStorePlaceholder capsuleName={normalizedCapsuleName} prompter={prompter} />
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
            setBannerUrlOverride(result.bannerUrl ?? null);
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
  primaryAction: {
    label: string;
    disabled: boolean;
    onClick: (() => void) | null;
  };
  membersOpen: boolean;
  showMembersBadge: boolean;
  pendingCount: number;
  onSelectMembers: () => void;
  onSelectFeatured: () => void;
  errorMessage?: string | null;
};

function CapsuleHero({
  capsuleName,
  bannerUrl,
  canCustomize,
  onCustomize,
  primaryAction,
  membersOpen,
  showMembersBadge,
  pendingCount,
  onSelectMembers,
  onSelectFeatured,
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
            const isFeaturedLink = label === "Featured";
            const isActive = isMembersLink ? membersOpen : !membersOpen && index === 0;
            const className = isActive
              ? `${capTheme.heroTab} ${capTheme.heroTabActive}`
              : capTheme.heroTab;
            const handleClick = () => {
              if (isMembersLink) {
                onSelectMembers();
              } else if (isFeaturedLink) {
                onSelectFeatured();
              }
            };
            return (
              <button
                key={label}
                type="button"
                className={className}
                onClick={isMembersLink || isFeaturedLink ? handleClick : undefined}
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

type CapsuleStorePlaceholderProps = {
  capsuleName: string | null;
  prompter: React.ReactNode;
};

function CapsuleStorePlaceholder({ capsuleName, prompter }: CapsuleStorePlaceholderProps) {
  const displayName = capsuleName ?? "your capsule";
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

  const assistantPrompts = [
    `"Design a premium ${displayName} hoodie with night-sky gradients for $45."`,
    `"Write product copy for a supporter-only enamel pin at a 25% margin."`,
    `"Create a bundle that pairs merch with a digital collectible unlock."`,
  ];

  const cartDraft = [
    { id: "cart-hoodie", name: "Signature Hoodie", price: "$45.00", note: "Awaiting artwork" },
    { id: "cart-tee", name: "Launch Jersey Tee", price: "$28.00", note: "Sizing chart needed" },
    { id: "cart-sticker", name: "Die-cut Sticker", price: "$5.00", note: "Set of 3" },
  ];

  const setupSteps = [
    { id: "step-assets", label: "Upload assets or describe them for AI mockups" },
    { id: "step-pricing", label: "Lock in pricing & margins for each listing" },
    { id: "step-launch", label: "Preview the storefront & schedule your launch" },
  ];

  return (
    <div className={`${capTheme.liveCanvas} ${capTheme.storeCanvas}`} aria-label="Capsule store planning">
      <div className={capTheme.storeContent}>
        <header className={capTheme.storeHeader}>
          <div className={capTheme.storeHeading}>
            <span className={capTheme.storeBadge}>Store draft</span>
            <h2 className={capTheme.storeTitle}>{displayName} storefront</h2>
            <p className={capTheme.storeSubtitle}>
              Curate your capsule shop with AI-assisted listings. Reserve spaces for merch, drops, and digital perks—then
              ask Capsule to fill in the details when you&apos;re ready.
            </p>
          </div>
          <div className={capTheme.storeActions}>
            <button type="button" className={capTheme.storeGhostButton}>
              <ShareFat size={16} weight="bold" />
              Share preview
            </button>
            <button type="button" className={capTheme.storeGhostButton}>
              <UsersThree size={16} weight="bold" />
              Invite collaborators
            </button>
          </div>
        </header>

        <section className={capTheme.storePrompter}>
          <div className={capTheme.storePrompterHeader}>
            <MagicWand size={18} weight="bold" />
            <div>
              <h3>Ask Capsule AI to craft your next listing</h3>
              <p>Use natural language to brief pricing, designs, bundles, or launch timing.</p>
            </div>
          </div>
          <div className={capTheme.storePrompterStage}>{prompter}</div>
        </section>

        <div className={capTheme.storeBody}>
          <div className={capTheme.storeMain}>
            <div className={capTheme.storeControls}>
              <form className={capTheme.storeSearch} role="search" aria-label="Search storefront">
                <MagnifyingGlass size={18} weight="bold" />
                <input
                  type="search"
                  placeholder="Search products, prompts, or saved concepts…"
                  disabled
                  aria-disabled="true"
                />
              </form>
              <div className={capTheme.storeControlButtons}>
                <button type="button" className={capTheme.storeGhostButton}>
                  <SquaresFour size={16} weight="bold" />
                  Layout presets
                </button>
                <button type="button" className={capTheme.storeGhostButton}>
                  <PlusCircle size={16} weight="bold" />
                  New slot
                </button>
                <button type="button" className={capTheme.storeGhostButton}>
                  <WarningCircle size={16} weight="bold" />
                  Launch checklist
                </button>
              </div>
            </div>

            <div className={capTheme.storeProducts}>
              {productSpots.map((product) => (
                <article key={product.id} className={capTheme.storeProductCard}>
                  <div className={`${capTheme.storeProductMedia} ${product.accent}`}>{product.icon}</div>
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
          </div>

          <aside className={capTheme.storeSidebar}>
            <section className={`${capTheme.storePanel} ${capTheme.storePanelHighlight}`}>
              <header className={capTheme.storePanelHeader}>
                <MagicWand size={18} weight="bold" />
                <div>
                  <h3>Try these prompts</h3>
                  <p>Drop them into the assistant or tweak for your voice.</p>
                </div>
              </header>
              <ul className={capTheme.storeAssistantList}>
                {assistantPrompts.map((prompt) => (
                  <li key={prompt}>
                    <span aria-hidden="true">•</span>
                    {prompt}
                  </li>
                ))}
              </ul>
            </section>

            <section className={capTheme.storePanel}>
              <header className={capTheme.storePanelHeader}>
                <ShoppingCartSimple size={18} weight="bold" />
                <div>
                  <h3>Cart preview</h3>
                  <p>Items populate as you confirm listings.</p>
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
                Preview checkout
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
