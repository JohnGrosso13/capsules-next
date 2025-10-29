"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import capTheme from "@/app/(authenticated)/capsule/capsule.module.css";
import type { CapsuleSummary } from "@/server/capsules/service";
import { LadderBuilder } from "../ladders/LadderBuilder";
import { TournamentBuilder } from "../tournaments/TournamentBuilder";
import styles from "./CompetitiveStudioLayout.module.css";

type TabId = "ladders" | "tournaments";

const TAB_ITEMS: Array<{ id: TabId; label: string; description: string }> = [
  {
    id: "ladders",
    label: "Ladders",
    description: "Season-style competitive ladders with Capsule AI running standings and content.",
  },
  {
    id: "tournaments",
    label: "Tournaments",
    description: "Bracketed events with AI-crafted updates, hype scripts, and seed management.",
  },
];

type CompetitiveStudioLayoutProps = {
  capsules: CapsuleSummary[];
  initialCapsuleId?: string | null;
  initialTab?: TabId;
};

export function CompetitiveStudioLayout({
  capsules,
  initialCapsuleId = null,
  initialTab = "ladders",
}: CompetitiveStudioLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = React.useState<TabId>(() => initialTab);

  const updateUrl = React.useCallback(
    (nextTab: TabId) => {
      if (!searchParams || !pathname) return;
      const params = new URLSearchParams(searchParams.toString());
      if (nextTab === "ladders") {
        params.delete("variant");
      } else {
        params.set("variant", nextTab);
      }
      const queryString = params.toString();
      router.replace(queryString.length ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  const handleTabChange = React.useCallback(
    (next: TabId) => {
      setActiveTab(next);
      updateUrl(next);
    },
    [updateUrl],
  );

  return (
    <div className={`${capTheme.theme} ${styles.shellWrap}`}>
      <header className={styles.navBar}>
        <div className={styles.navTabs} role="tablist" aria-label="Competitive events builder">
          {TAB_ITEMS.map((tab) => {
            const isActive = activeTab === tab.id;
            const baseClass = `${styles.navButton}`;
            const btnClass = isActive ? `${baseClass} ${styles.navButtonActive}` : baseClass;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={btnClass}
                onClick={() => handleTabChange(tab.id)}
              >
                <span className={styles.navButtonLabel}>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </header>
      <main className={styles.contentArea}>
        {activeTab === "ladders" ? (
          <LadderBuilder capsules={capsules} initialCapsuleId={initialCapsuleId} />
        ) : (
          <TournamentBuilder capsules={capsules} initialCapsuleId={initialCapsuleId} />
        )}
      </main>
    </div>
  );
}
