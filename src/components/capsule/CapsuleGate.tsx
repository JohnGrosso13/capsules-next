"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { CapsuleContent } from "@/components/capsule/CapsuleScaffold";
import type { CapsuleSummary } from "@/server/capsules/service";

import styles from "@/app/(authenticated)/capsule/capsule.module.css";

type CapsuleGateProps = {
  capsules: CapsuleSummary[];
  defaultCapsuleId?: string | null;
};

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
          <p className={styles.gateSubtitle}>Your Capsule is your space for live sessions, posts, and community. Create one to get started.</p>
          <Button variant="gradient" size="lg" className={styles.gateCta} asChild>
            <Link href="/capsule/onboarding">Create a Capsule</Link>
          </Button>
        </div>
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
