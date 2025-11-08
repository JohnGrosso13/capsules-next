"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useEmblaCarousel from "embla-carousel-react";

import { Button, ButtonLink } from "@/components/ui/button";
import { CapsuleContent } from "@/components/capsule/CapsuleScaffold";
import { CapsulePromoTile } from "@/components/capsule/CapsulePromoTile";
import capsuleTileHostStyles from "@/components/capsule/capsule-tile-host.module.css";
import { resolveCapsuleTileMedia } from "@/lib/capsules/promo-tile";
import type { CapsuleSummary } from "@/server/capsules/service";
import { DotsThree } from "@phosphor-icons/react/dist/ssr";
import contextMenuStyles from "@/components/ui/context-menu.module.css";

import styles from "./CapsuleGate.module.css";

type CapsuleGateProps = {
  capsules: CapsuleSummary[];
  defaultCapsuleId?: string | null;
  forceSelector?: boolean;
  onCapsuleChosen?: (capsule: CapsuleSummary | null) => void;
  autoActivate?: boolean;
  selectorTitle?: React.ReactNode;
  selectorSubtitle?: React.ReactNode;
};

type PlaceholderCapsule = {
  name: string;
  desc: string;
};

const PLACEHOLDER_ROWS: PlaceholderCapsule[][] = [
  [
    { name: "Creator Studio", desc: "Design + prompts" },
    { name: "AI Photography", desc: "SDXL tips" },
    { name: "Music Makers", desc: "DAW workflows" },
    { name: "Streaming 101", desc: "OBS scenes" },
    { name: "Launch Lab", desc: "Product sprints" },
  ],
  [
    { name: "Prompt Jam", desc: "Weekly challenge" },
    { name: "Dev Playground", desc: "Tools + snippets" },
    { name: "Study Hall", desc: "Focus sessions" },
    { name: "Creator Circle", desc: "Collaboration hub" },
    { name: "Daily Flow", desc: "Wellness routines" },
  ],
];

function PromoCarouselRow({ items, rowLabel }: { items: PlaceholderCapsule[]; rowLabel: string }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "start",
    dragFree: true,
    containScroll: "trimSnaps",
  });

  const [canPrev, setCanPrev] = React.useState(false);
  const [canNext, setCanNext] = React.useState(false);

  const updateControls = React.useCallback(() => {
    if (!emblaApi) return;
    setCanPrev(emblaApi.canScrollPrev());
    setCanNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  React.useEffect(() => {
    if (!emblaApi) return;
    updateControls();
    emblaApi.on("select", updateControls);
    emblaApi.on("reInit", updateControls);
    return () => {
      emblaApi.off("select", updateControls);
      emblaApi.off("reInit", updateControls);
    };
  }, [emblaApi, updateControls]);

  const handlePrev = React.useCallback(() => {
    emblaApi?.scrollPrev();
  }, [emblaApi]);

  const handleNext = React.useCallback(() => {
    emblaApi?.scrollNext();
  }, [emblaApi]);

  return (
    <div className={styles.carouselRow}>
      <div className={styles.carouselViewport} ref={emblaRef}>
        <div className={styles.carouselTrack}>
          {items.map((item) => (
            <div key={item.name} className={styles.carouselSlide}>
              <div className={`tile-neu ${styles.promoTile}`} aria-label={item.name}>
                <div className={styles.promoOverlay}>
                  <span className={styles.promoLogo} aria-hidden />
                  <div className={styles.promoMeta}>
                    <span className={styles.promoName}>{item.name}</span>
                    <span className={styles.promoDesc}>{item.desc}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.carouselControls}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handlePrev}
          disabled={!canPrev}
          aria-label={`Previous recommended capsule in ${rowLabel}`}
        >
          ‹
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleNext}
          disabled={!canNext}
          aria-label={`Next recommended capsule in ${rowLabel}`}
        >
          ›
        </Button>
      </div>
    </div>
  );
}

function formatRole(summary: CapsuleSummary): string {
  if (summary.ownership === "owner") return "You are the owner";
  if (summary.ownership === "follower") return "You follow this capsule";
  if (summary.role) return `Role: ${summary.role}`;
  return "Member";
}

function CapsuleSelectorTile({
  capsule,
  onSelect,
  onLeave,
}: {
  capsule: CapsuleSummary;
  onSelect: (capsuleId: string) => void;
  onLeave?: (capsuleId: string) => void;
}) {
  const badgeLabel =
    capsule.ownership === "owner"
      ? "Owner"
      : capsule.ownership === "member"
        ? "Member"
        : "Follower";
  const roleDescription = formatRole(capsule);
  const { bannerUrl, logoUrl } = resolveCapsuleTileMedia({
    promoTileUrl: capsule.promoTileUrl,
    bannerUrl: capsule.bannerUrl,
    logoUrl: capsule.logoUrl,
  });
  const tileClass = `${capsuleTileHostStyles.tileHost} ${styles.tile ?? ""}`.trim();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [menuOpen]);

  const handleSelectTile = React.useCallback(() => {
    setMenuOpen(false);
    onSelect(capsule.id);
  }, [capsule.id, onSelect]);

  const handleReport = React.useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      setMenuOpen(false);
      console.info("Report capsule", capsule.id);
    },
    [capsule.id],
  );

  const handleLeave = React.useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      setMenuOpen(false);
      onLeave?.(capsule.id);
    },
    [capsule.id, onLeave],
  );

  return (
    <div className={styles.tileShell}>
      <button
        type="button"
        className={styles.tileButton}
        onClick={handleSelectTile}
        aria-label={`Open ${capsule.name}`}
      >
        <CapsulePromoTile
          name={capsule.name}
          bannerUrl={bannerUrl}
          logoUrl={logoUrl}
          className={tileClass}
          showSlug={false}
        />
        <div className={styles.tileMeta}>
          <span className={styles.tileBadge}>{badgeLabel}</span>
          <span className={styles.tileRole}>{roleDescription}</span>
        </div>
      </button>
      {capsule.ownership !== "owner" ? (
        <>
          <button
            type="button"
            className={styles.tileMenuButton}
            aria-label={`More options for ${capsule.name}`}
            aria-haspopup="true"
            aria-expanded={menuOpen}
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen((prev) => !prev);
            }}
          >
            <DotsThree size={18} weight="bold" />
          </button>
          {menuOpen ? (
            <div
              ref={menuRef}
              className={`${contextMenuStyles.menu} ${styles.tileMenu}`.trim()}
              onClick={(event) => event.stopPropagation()}
            >
              <button type="button" className={contextMenuStyles.item} onClick={handleReport}>
                Report capsule
              </button>
              {capsule.ownership === "member" ? (
                <>
                  <div className={contextMenuStyles.separator} />
                  <button
                    type="button"
                    className={`${contextMenuStyles.item} ${contextMenuStyles.danger}`.trim()}
                    onClick={handleLeave}
                  >
                    Leave capsule
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function CapsuleGate({
  capsules,
  defaultCapsuleId = null,
  forceSelector = false,
  onCapsuleChosen,
  autoActivate = true,
  selectorTitle = "Choose a Capsule",
  selectorSubtitle = "Pick a space to open and jump back into the action.",
}: CapsuleGateProps) {
  const [capsuleList, setCapsuleList] = React.useState<CapsuleSummary[]>(() => capsules);

  React.useEffect(() => {
    setCapsuleList(capsules);
  }, [capsules]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const handleBannerUpdate = (rawEvent: Event) => {
      const event = rawEvent as CustomEvent<{ capsuleId?: string | null; bannerUrl?: string | null }>;
      const capsuleId = event.detail?.capsuleId;
      if (!capsuleId) return;
      const nextBannerUrl = event.detail?.bannerUrl ?? null;
      setCapsuleList((previous) => {
        let changed = false;
        const nextList = previous.map((capsule) => {
          if (capsule.id !== capsuleId) return capsule;
          if (capsule.bannerUrl === nextBannerUrl) return capsule;
          changed = true;
          return { ...capsule, bannerUrl: nextBannerUrl };
        });
        return changed ? nextList : previous;
      });
    };

    window.addEventListener("capsule:banner-updated", handleBannerUpdate);
    return () => {
      window.removeEventListener("capsule:banner-updated", handleBannerUpdate);
    };
  }, []);

  const ownedCapsules = React.useMemo(
    () => capsuleList.filter((capsule) => capsule.ownership === "owner"),
    [capsuleList],
  );
  const memberCapsules = React.useMemo(
    () => capsuleList.filter((capsule) => capsule.ownership === "member"),
    [capsuleList],
  );
  const followedCapsules = React.useMemo(
    () => capsuleList.filter((capsule) => capsule.ownership === "follower"),
    [capsuleList],
  );
  const hasOwnedCapsule = ownedCapsules.length > 0;
  const hasMemberCapsules = memberCapsules.length > 0;
  const hasFollowedCapsules = followedCapsules.length > 0;
  const knownCapsuleIds = React.useMemo(
    () => new Set(capsuleList.map((capsule) => capsule.id)),
    [capsuleList],
  );
  const startInSelector = forceSelector || !hasOwnedCapsule;
  const resolvedDefaultId = React.useMemo(() => {
    if (!capsuleList.length) return null;
    if (defaultCapsuleId && knownCapsuleIds.has(defaultCapsuleId)) return defaultCapsuleId;
    if (hasOwnedCapsule) return ownedCapsules[0]?.id ?? null;
    return capsuleList[0]?.id ?? null;
  }, [capsuleList, defaultCapsuleId, hasOwnedCapsule, knownCapsuleIds, ownedCapsules]);
  const [activeId, setActiveId] = React.useState<string | null>(() =>
    startInSelector ? null : resolvedDefaultId,
  );
  const canSwitchCapsules = startInSelector || capsuleList.length > 1;
  const shouldAutoActivate = autoActivate !== false;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? "";

  const handleSelect = React.useCallback(
    (capsuleId: string) => {
      const capsule = capsuleList.find((entry) => entry.id === capsuleId) ?? null;
      onCapsuleChosen?.(capsule);
      if (shouldAutoActivate) {
        setActiveId(capsuleId);
      }
    },
    [capsuleList, onCapsuleChosen, shouldAutoActivate, setActiveId],
  );

  const handleLeaveCapsule = React.useCallback(
    async (capsuleId: string) => {
      try {
        const response = await fetch(`/api/capsules/${capsuleId}/membership`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "leave" }),
        });
        if (!response.ok) {
          throw new Error("Failed to leave capsule");
        }
        setCapsuleList((previous) => previous.filter((capsule) => capsule.id !== capsuleId));
      } catch (error) {
        console.error("capsule.leave", error);
      }
    },
    [],
  );

  const syncUrl = React.useCallback(
    (nextActiveId: string | null, allowSwitch: boolean) => {
      if (!pathname) return;

      const params = new URLSearchParams(searchParamsString);
      let mutated = false;

      if (nextActiveId) {
        if (params.get("capsuleId") !== nextActiveId) {
          params.set("capsuleId", nextActiveId);
          mutated = true;
        }
        if (params.has("switch")) {
          params.delete("switch");
          mutated = true;
        }
      } else if (allowSwitch) {
        if (params.get("switch") !== "1") {
          params.set("switch", "1");
          mutated = true;
        }
        if (params.has("capsuleId")) {
          params.delete("capsuleId");
          mutated = true;
        }
      } else {
        if (params.has("switch")) {
          params.delete("switch");
          mutated = true;
        }
        if (params.has("capsuleId")) {
          params.delete("capsuleId");
          mutated = true;
        }
      }

      if (!mutated) return;

      const query = params.toString();
      const nextHref = query.length ? `${pathname}?${query}` : pathname;

      router.replace(nextHref, { scroll: false });
    },
    [pathname, router, searchParamsString],
  );

  React.useEffect(() => {
    setActiveId((previous) => {
      const hasPrevious = Boolean(previous);
      const isValidPrevious =
        hasPrevious && capsuleList.some((capsule) => capsule.id === previous);
      if (startInSelector) {
        return isValidPrevious ? previous : null;
      }
      if (isValidPrevious) {
        return previous;
      }
      return resolvedDefaultId;
    });
  }, [capsuleList, resolvedDefaultId, startInSelector]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!shouldAutoActivate) return;
    if (!canSwitchCapsules) return;
    const handleSwitch = (event: Event) => {
      const detail = (event as CustomEvent<{ focus?: boolean }>).detail;
      setActiveId(null);
      if (detail?.focus) {
        const selectorRoot = document.querySelector<HTMLElement>(`.${styles.selector}`);
        selectorRoot?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    window.addEventListener("capsule:switch", handleSwitch);
    return () => {
      window.removeEventListener("capsule:switch", handleSwitch);
    };
  }, [canSwitchCapsules, shouldAutoActivate]);

  React.useEffect(() => {
    if (!shouldAutoActivate) return;
    if (typeof window === "undefined") return;
    syncUrl(activeId, canSwitchCapsules);
  }, [activeId, canSwitchCapsules, shouldAutoActivate, syncUrl]);

  const activeCapsule = React.useMemo(() => {
    if (!activeId) return null;
    return capsuleList.find((capsule) => capsule.id === activeId) ?? null;
  }, [activeId, capsuleList]);

  React.useEffect(() => {
    if (!shouldAutoActivate) return;
    const detail = {
      capsuleId: activeCapsule?.id ?? null,
      capsuleName: activeCapsule?.name ?? null,
      status: "waiting" as const,
    };
    window.dispatchEvent(new CustomEvent("capsule:live-chat", { detail }));
  }, [activeCapsule?.id, activeCapsule?.name, shouldAutoActivate]);
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (activeCapsule?.id) {
      root.dataset.activeCapsuleId = activeCapsule.id;
      if (activeCapsule.name) {
        root.dataset.activeCapsuleName = activeCapsule.name;
      } else {
        delete root.dataset.activeCapsuleName;
      }
    } else {
      delete root.dataset.activeCapsuleId;
      delete root.dataset.activeCapsuleName;
    }
  }, [activeCapsule?.id, activeCapsule?.name]);

  if (!capsuleList.length) {
    return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Create a New Capsule!</h2>
        <p className={styles.cardSubtitle}>
          Your Capsule is your space for live sessions, posts, and community. Create one to get
          started.
        </p>
        <ButtonLink
          href="/capsule/onboarding"
          variant="gradient"
          size="lg"
          className={styles.cta}
        >
          Create a Capsule
        </ButtonLink>
      </div>

      <section className={styles.recommended} aria-label="Recommended Capsules">
        <header className={styles.recommendedHeader}>
          <h3 className={styles.recommendedTitle}>Recommended Capsules</h3>
        </header>
        <div className={styles.carousel}>
          {PLACEHOLDER_ROWS.map((row, index) => (
            <PromoCarouselRow key={index} items={row} rowLabel={`row ${index + 1}`} />
          ))}
        </div>
      </section>
      </div>
    );
  }

  if (activeCapsule) {
    return (
      <div className={styles.active}>
        <CapsuleContent capsuleId={activeCapsule.id} capsuleName={activeCapsule.name} />
      </div>
    );
  }

  return (
    <div className={styles.selector}>
      {!hasOwnedCapsule ? (
        <div className={styles.createCard}>
          <div className={styles.createCardBody}>
            <h2 className={styles.createCardTitle}>Launch your own Capsule</h2>
            <p className={styles.createCardSubtitle}>
              Explore spaces you&rsquo;re a member of below, or start your own to unlock full
              customization.
            </p>
          </div>
          <ButtonLink
            href="/capsule/onboarding"
            variant="gradient"
            size="sm"
            className={styles.createCardAction}
          >
            Create a Capsule
          </ButtonLink>
        </div>
      ) : null}
      <div className={styles.selectorHeader}>
        <h2 className={styles.selectorTitle}>{selectorTitle}</h2>
        {selectorSubtitle ? (
          <p className={styles.selectorSubtitle}>{selectorSubtitle}</p>
        ) : null}
      </div>
      <div className={styles.sections}>
        <section className={styles.section} aria-label="User Created Capsules">
          <header className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>Your Capsules</h3>
            <span className={styles.sectionBadge}>{ownedCapsules.length}</span>
          </header>
          {hasOwnedCapsule ? (
            <div className={styles.grid}>
              {ownedCapsules.map((capsule) => (
                <CapsuleSelectorTile
                  key={capsule.id}
                  capsule={capsule}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          ) : (
            <p className={styles.sectionMessage}>
              You haven&apos;t created a capsule yet. Spin one up to unlock full customization.
            </p>
          )}
        </section>
        <section className={styles.section} aria-label="Memberships">
          <header className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>Memberships</h3>
            <span className={styles.sectionBadge}>{memberCapsules.length}</span>
          </header>
          {hasMemberCapsules ? (
            <div className={styles.grid}>
              {memberCapsules.map((capsule) => (
                <CapsuleSelectorTile
                  key={capsule.id}
                  capsule={capsule}
                  onSelect={handleSelect}
                  onLeave={handleLeaveCapsule}
                />
              ))}
            </div>
          ) : (
            <p className={styles.sectionMessage}>
              You&apos;re not a member of any capsules yet. Accept an invite or request to join to
              see them here.
            </p>
          )}
        </section>
        <section className={styles.section} aria-label="Followed Capsules">
          <header className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>Followed Capsules</h3>
            <span className={styles.sectionBadge}>{followedCapsules.length}</span>
          </header>
          {hasFollowedCapsules ? (
            <div className={styles.grid}>
              {followedCapsules.map((capsule) => (
                <CapsuleSelectorTile
                  key={capsule.id}
                  capsule={capsule}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          ) : (
            <p className={styles.sectionMessage}>
              Follow capsules you care about to access them quickly.
            </p>
          )}
        </section>
      </div>
      <div className={styles.footer}>
        <span className={styles.footerText}>Need another space?</span>
        <Button variant="outline" size="sm" asChild>
          <Link href="/create">Create a new Capsule</Link>
        </Button>
      </div>
    </div>
  );
}
