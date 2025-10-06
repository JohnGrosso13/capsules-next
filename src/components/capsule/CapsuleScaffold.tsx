"use client";

import * as React from "react";
import { AiPrompterStage } from "@/components/ai-prompter-stage";
import capTheme from "@/app/(authenticated)/capsule/capsule.module.css";

type CapsuleTab = "live" | "feed" | "store";

export function CapsuleBanner() {
  const [active, setActive] = React.useState<CapsuleTab>("live");
  React.useEffect(() => {
    const ev = new CustomEvent("capsule:tab", { detail: { tab: active } });
    window.dispatchEvent(ev);
  }, [active]);
  return (
    <div className={capTheme.banner}>
      <div className={capTheme.tabList} role="tablist" aria-label="Capsule sections">
        <button
          className={active === "live" ? `${capTheme.tab} ${capTheme.tabActive}` : capTheme.tab}
          role="tab"
          aria-selected={active === "live"}
          onClick={() => setActive("live")}
        >
          Live
        </button>
        <button
          className={active === "feed" ? `${capTheme.tab} ${capTheme.tabActive}` : capTheme.tab}
          role="tab"
          aria-selected={active === "feed"}
          onClick={() => setActive("feed")}
        >
          Feed
        </button>
        <button
          className={active === "store" ? `${capTheme.tab} ${capTheme.tabActive}` : capTheme.tab}
          role="tab"
          aria-selected={active === "store"}
          onClick={() => setActive("store")}
        >
          Store
        </button>
      </div>
    </div>
  );
}

export function CapsuleContent() {
  const [tab, setTab] = React.useState<CapsuleTab>("live");
  React.useEffect(() => {
    const onTab = (e: Event) => {
      const ce = e as CustomEvent<{ tab?: CapsuleTab }>;
      if (ce.detail?.tab) setTab(ce.detail.tab);
    };
    window.addEventListener("capsule:tab", onTab as EventListener);
    return () => window.removeEventListener("capsule:tab", onTab as EventListener);
  }, []);

  if (tab === "feed") return <FeedPlaceholder />;
  if (tab === "store") return <StorePlaceholder />;
  return <LivePlaceholder />;
}

function LivePlaceholder() {
  return (
    <div className={capTheme.liveWrap}>
      <div className={capTheme.liveCanvas} aria-label="Live stream area" />
      <div className={capTheme.prompterBelow}>
        <AiPrompterStage />
      </div>
    </div>
  );
}

function FeedPlaceholder() {
  return (
    <div className={capTheme.placeholderCard}>
      <h3 className={capTheme.placeholderTitle}>Capsule Feed</h3>
      <p className={capTheme.placeholderText}>Your posts and activity will appear here.</p>
    </div>
  );
}

function StorePlaceholder() {
  return (
    <div className={capTheme.placeholderCard}>
      <h3 className={capTheme.placeholderTitle}>Capsule Store</h3>
      <p className={capTheme.placeholderText}>Products and offers will appear here.</p>
    </div>
  );
}

