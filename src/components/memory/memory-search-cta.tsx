"use client";

import { useCallback } from "react";
import { Brain, ClockClockwise, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";

import type { SearchOpenDetail } from "@/types/search";

import styles from "./memory-search-cta.module.css";

const SEARCH_EVENT_NAME = "capsules:search:open";

export function MemorySearchCta() {
  const openSearch = useCallback((detail: Partial<SearchOpenDetail>) => {
    if (typeof window === "undefined") return;
    const payload: SearchOpenDetail = { ...detail };
    window.dispatchEvent(new CustomEvent<SearchOpenDetail>(SEARCH_EVENT_NAME, { detail: payload }));
  }, []);

  const handlePersonalClick = useCallback(() => {
    openSearch({
      initialQuery: "",
      placeholder: "Search personal memories...",
      scope: "memories",
    });
  }, [openSearch]);

  const handleCapsuleClick = useCallback(() => {
    openSearch({
      initialQuery: "",
      placeholder: "Search Capsule recaps...",
      scope: "capsule_records",
    });
  }, [openSearch]);

  return (
    <div className={styles.searchGrid}>
      <article className={`${styles.searchCard} ${styles.personalCard}`}>
        <div className={styles.cardContent}>
          <div className={styles.copy}>
            <h2 className={styles.title}>Personal Memory</h2>
            <p className={styles.subtitle}>Search your saved content and past activity.</p>
          </div>
          <div className={styles.illustration} aria-hidden="true">
            <Brain weight="fill" size={44} />
          </div>
        </div>
        <button type="button" className={styles.searchBar} onClick={handlePersonalClick}>
          <MagnifyingGlass size={18} weight="bold" />
          <span>Search personal memories...</span>
        </button>
      </article>
      <article className={`${styles.searchCard} ${styles.capsuleCard}`}>
        <div className={styles.cardContent}>
          <div className={styles.copy}>
            <h2 className={styles.title}>Capsule History</h2>
            <p className={styles.subtitle}>Search recaps and history from your Capsules.</p>
          </div>
          <div className={styles.illustration} aria-hidden="true">
            <ClockClockwise weight="fill" size={44} />
          </div>
        </div>
        <button type="button" className={styles.searchBar} onClick={handleCapsuleClick}>
          <MagnifyingGlass size={18} weight="bold" />
          <span>Search Capsule recaps...</span>
        </button>
      </article>
    </div>
  );
}
