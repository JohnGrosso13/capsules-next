"use client";

import * as React from "react";
import Link from "next/link";
import useEmblaCarousel from "embla-carousel-react";

import { Button, ButtonLink } from "@/components/ui/button";
import { CapsuleContent } from "@/components/capsule/CapsuleScaffold";
import type { CapsuleSummary } from "@/server/capsules/service";

import styles from "@/app/(authenticated)/capsule/capsule.module.css";

type CapsuleGateProps = {
  capsules: CapsuleSummary[];
  defaultCapsuleId?: string | null;
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

function getInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : "C";
}

function formatRole(summary: CapsuleSummary): string {
  if (summary.ownership === "owner") return "You are the owner";
  if (summary.role) return `Role: ${summary.role}`;
  return "Member";
}

export function CapsuleGate({ capsules, defaultCapsuleId = null }: CapsuleGateProps) {
  const resolvedDefaultId = React.useMemo(() => {
    if (defaultCapsuleId) return defaultCapsuleId;
    if (capsules.length === 1) return capsules[0]?.id ?? null;
    return null;
  }, [capsules, defaultCapsuleId]);

  const [activeId, setActiveId] = React.useState<string | null>(resolvedDefaultId);

  React.useEffect(() => {
    setActiveId(resolvedDefaultId);
  }, [resolvedDefaultId]);

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
        <div className={styles.selectorActiveBar}>
          <div>
            <span className={styles.selectorActiveLabel}>Viewing capsule</span>
            <h2 className={styles.selectorActiveName}>{activeCapsule.name}</h2>
          </div>
          {capsules.length > 1 ? (
            <Button
              variant="ghost"
              size="sm"
              className={styles.selectorSwitchBtn}
              onClick={() => setActiveId(null)}
            >
              Switch capsule
            </Button>
          ) : null}
        </div>
        <CapsuleContent capsuleId={activeCapsule.id} />
      </div>
    );
  }

  return (
    <div className={styles.selectorWrap}>
      <div className={styles.selectorHeader}>
        <h2 className={styles.selectorTitle}>Choose a Capsule</h2>
        <p className={styles.selectorSubtitle}>Pick a space to open and jump back into the action.</p>
      </div>
      <div className={styles.selectorGrid}>
        {capsules.map((capsule) => (
          <button
            key={capsule.id}
            type="button"
            className={styles.selectorCard}
            onClick={() => setActiveId(capsule.id)}
          >
            <div className={styles.selectorCardHeader}>
              <div className={styles.selectorLogo} aria-hidden>
                {capsule.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={capsule.logoUrl} alt="" />
                ) : (
                  <span>{getInitial(capsule.name)}</span>
                )}
              </div>
              <div className={styles.selectorCardMeta}>
                <span className={styles.selectorName}>{capsule.name}</span>
                <span className={styles.selectorRole}>{formatRole(capsule)}</span>
              </div>
            </div>
            {capsule.slug ? (
              <span className={styles.selectorSlug}>@{capsule.slug}</span>
            ) : null}
            <span className={styles.selectorAction}>Open Capsule</span>
          </button>
        ))}
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
