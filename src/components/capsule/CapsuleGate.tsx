"use client";

import * as React from "react";
import Link from "next/link";
import useEmblaCarousel from "embla-carousel-react";

import { Button, ButtonLink } from "@/components/ui/button";
import { CapsuleContent } from "@/components/capsule/CapsuleScaffold";
import { CapsulePromoTile } from "@/components/capsule/CapsulePromoTile";
import type { CapsuleSummary } from "@/server/capsules/service";

import styles from "@/app/(authenticated)/capsule/capsule.module.css";

type CapsuleGateProps = {
  capsules: CapsuleSummary[];
  defaultCapsuleId?: string | null;
  forceSelector?: boolean;
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

function PromoCarouselRow({
  items,
  rowLabel,
}: {
  items: PlaceholderCapsule[];
  rowLabel: string;
}) {
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
        <div className={styles.carouselContainer}>
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
  if (summary.role) return `Role: ${summary.role}`;
  return "Member";
}

function CapsuleSelectorTile({
  capsule,
  onSelect,
}: {
  capsule: CapsuleSummary;
  onSelect: (capsuleId: string) => void;
}) {
  const badgeLabel = capsule.ownership === "owner" ? "Owner" : "Member";
  const description = formatRole(capsule);
  const bannerUrl = capsule.promoTileUrl ?? capsule.bannerUrl ?? null;
  const logoUrl = capsule.logoUrl ?? null;
  const tileClass = styles.selectorTile ?? "";
  return (
    <button
      type="button"
      className={styles.selectorTileButton}
      onClick={() => onSelect(capsule.id)}
      aria-label={`Open ${capsule.name}`}
    >
      <CapsulePromoTile
        name={capsule.name}
        slug={capsule.slug}
        bannerUrl={bannerUrl}
        logoUrl={logoUrl}
        badgeLabel={badgeLabel}
        description={description}
        actionLabel="Open Capsule"
        className={tileClass}
      />
    </button>
  );
}

export function CapsuleGate({ capsules, defaultCapsuleId = null, forceSelector = false }: CapsuleGateProps) {
  const ownedCapsules = React.useMemo(
    () => capsules.filter((capsule) => capsule.ownership === "owner"),
    [capsules],
  );
  const memberCapsules = React.useMemo(
    () => capsules.filter((capsule) => capsule.ownership !== "owner"),
    [capsules],
  );
  const hasOwnedCapsule = ownedCapsules.length > 0;
  const hasMemberCapsules = memberCapsules.length > 0;
  const knownCapsuleIds = React.useMemo(() => new Set(capsules.map((capsule) => capsule.id)), [capsules]);
  const startInSelector = forceSelector || !hasOwnedCapsule;
  const resolvedDefaultId = React.useMemo(() => {
    if (!capsules.length) return null;
    if (defaultCapsuleId && knownCapsuleIds.has(defaultCapsuleId)) return defaultCapsuleId;
    if (hasOwnedCapsule) return ownedCapsules[0]?.id ?? null;
    return capsules[0]?.id ?? null;
  }, [capsules, defaultCapsuleId, hasOwnedCapsule, knownCapsuleIds, ownedCapsules]);
  const [activeId, setActiveId] = React.useState<string | null>(() => (startInSelector ? null : resolvedDefaultId));
  const canSwitchCapsules = startInSelector || capsules.length > 1;

  React.useEffect(() => {
    if (startInSelector) {
      setActiveId(null);
      return;
    }
    setActiveId((previous) => {
      if (previous && capsules.some((capsule) => capsule.id === previous)) {
        return previous;
      }
      return resolvedDefaultId;
    });
  }, [capsules, resolvedDefaultId, startInSelector]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!canSwitchCapsules) return;
    const handleSwitch = (event: Event) => {
      const detail = (event as CustomEvent<{ focus?: boolean }>).detail;
      setActiveId(null);
      if (detail?.focus) {
        const selectorRoot = document.querySelector<HTMLElement>(`.${styles.selectorWrap}`);
        selectorRoot?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    window.addEventListener("capsule:switch", handleSwitch);
    return () => {
      window.removeEventListener("capsule:switch", handleSwitch);
    };
  }, [canSwitchCapsules]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    let changed = false;
    if (activeId) {
      if (url.searchParams.get("capsuleId") !== activeId) {
        url.searchParams.set("capsuleId", activeId);
        changed = true;
      }
      if (url.searchParams.has("switch")) {
        url.searchParams.delete("switch");
        changed = true;
      }
    } else if (canSwitchCapsules) {
      if (url.searchParams.get("switch") !== "1") {
        url.searchParams.set("switch", "1");
        changed = true;
      }
      if (url.searchParams.has("capsuleId")) {
        url.searchParams.delete("capsuleId");
        changed = true;
      }
    }
    if (changed) {
      const nextUrl = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState(null, document.title, nextUrl);
    }
  }, [activeId, canSwitchCapsules]);

  const activeCapsule = React.useMemo(() => {
    if (!activeId) return null;
    return capsules.find((capsule) => capsule.id === activeId) ?? null;
  }, [activeId, capsules]);

  React.useEffect(() => {
    const detail = {
      capsuleId: activeCapsule?.id ?? null,
      capsuleName: activeCapsule?.name ?? null,
      status: "waiting" as const,
    };
    window.dispatchEvent(new CustomEvent("capsule:live-chat", { detail }));
  }, [activeCapsule?.id, activeCapsule?.name]);

  if (!capsules.length) {
    return (
      <div className={styles.gateWrap}>
        <div className={styles.gateCard}>
          <h2 className={styles.gateTitle}>Create a New Capsule!</h2>
          <p className={styles.gateSubtitle}>
            Your Capsule is your space for live sessions, posts, and community. Create one to get
            started.
          </p>
          <ButtonLink href="/capsule/onboarding" variant="gradient" size="lg" className={styles.gateCta}>
            Create a Capsule
          </ButtonLink>
        </div>

        <section className={styles.recommendSection} aria-label="Recommended Capsules">
          <header className={styles.recommendHeader}>
            <h3 className={styles.recommendTitle}>Recommended Capsules</h3>
          </header>
          <div className={styles.carouselGroup}>
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
      <div className={styles.gateActive}>
        <CapsuleContent capsuleId={activeCapsule.id} capsuleName={activeCapsule.name} />
      </div>
    );
  }

  return (
    <div className={styles.selectorWrap}>
      {!hasOwnedCapsule ? (
        <div className={styles.selectorCreateCard}>
          <div className={styles.selectorCreateBody}>
            <h2 className={styles.selectorCreateTitle}>Launch your own Capsule</h2>
            <p className={styles.selectorCreateSubtitle}>
              Explore spaces you&rsquo;re a member of below, or start your own to unlock full customization.
            </p>
          </div>
          <ButtonLink href="/capsule/onboarding" variant="gradient" size="sm" className={styles.selectorCreateAction}>
            Create a Capsule
          </ButtonLink>
        </div>
      ) : null}
      <div className={styles.selectorHeader}>
        <h2 className={styles.selectorTitle}>Choose a Capsule</h2>
        <p className={styles.selectorSubtitle}>Pick a space to open and jump back into the action.</p>
      </div>
      <div className={styles.selectorSections}>
        <section className={styles.selectorSection} aria-label="User Created Capsules">
          <header className={styles.selectorSectionHeader}>
            <h3 className={styles.selectorSectionTitle}>Your Capsules</h3>
            <span className={styles.selectorSectionBadge}>{ownedCapsules.length}</span>
          </header>
          {hasOwnedCapsule ? (
            <div className={styles.selectorGrid}>
              {ownedCapsules.map((capsule) => (
                <CapsuleSelectorTile key={capsule.id} capsule={capsule} onSelect={setActiveId} />
              ))}
            </div>
          ) : (
            <p className={styles.selectorSectionEmpty}>
              You haven&apos;t created a capsule yet. Spin one up to unlock full customization.
            </p>
          )}
        </section>
        <section className={styles.selectorSection} aria-label="Memberships">
          <header className={styles.selectorSectionHeader}>
            <h3 className={styles.selectorSectionTitle}>Memberships</h3>
            <span className={styles.selectorSectionBadge}>{memberCapsules.length}</span>
          </header>
          {hasMemberCapsules ? (
            <div className={styles.selectorGrid}>
              {memberCapsules.map((capsule) => (
                <CapsuleSelectorTile key={capsule.id} capsule={capsule} onSelect={setActiveId} />
              ))}
            </div>
          ) : (
            <p className={styles.selectorSectionEmpty}>
              You&apos;re not a member of any capsules yet. Accept an invite or request to join to see them here.
            </p>
          )}
        </section>
      </div>
      <div className={styles.selectorFooter}>
        <span className={styles.selectorFooterText}>Need another space?</span>
        <Button variant="outline" size="sm" asChild>
          <Link href="/create">Create a new Capsule</Link>
        </Button>
      </div>
    </div>
  );
}

