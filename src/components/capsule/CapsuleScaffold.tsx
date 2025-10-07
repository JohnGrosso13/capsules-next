"use client";

import * as React from "react";
import { AiPrompterStage } from "@/components/ai-prompter-stage";
import { useComposer } from "@/components/composer/ComposerProvider";
import { HomeFeedList } from "@/components/home-feed-list";
import { useHomeFeed } from "@/hooks/useHomeFeed";
import homeStyles from "@/components/home.module.css";
import {
  Plus,
  PencilSimple,
  Trash,
  Check,
  Broadcast,
  Newspaper,
  Storefront,
} from "@phosphor-icons/react/dist/ssr";
import capTheme from "@/app/(authenticated)/capsule/capsule.module.css";

type CapsuleTab = "live" | "feed" | "store";
type FeedTargetDetail = { scope?: string | null; capsuleId?: string | null };
const FEED_TARGET_EVENT = "composer:feed-target";

export type CapsuleContentProps = {
  capsuleId?: string | null;
};

// The banner now provides only the visual header. Tabs were moved below it.
export function CapsuleContent({ capsuleId: capsuleIdProp }: CapsuleContentProps = {}) {
  const composer = useComposer();
  const [tab, setTab] = React.useState<CapsuleTab>("feed");
  const [capsuleId, setCapsuleId] = React.useState<string | null>(() => capsuleIdProp ?? null);

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
          onClick={() => handleSelect("feed")}
        >
          <Newspaper size={18} weight="bold" className={capTheme.tabIcon} />
          Feed
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

      {/* Middle: canvas that grows, then prompter */}
      {tab === "feed" ? (
        <>
          <div className={capTheme.prompterTop}>{prompter}</div>
          <div
            className={`${capTheme.liveCanvas} ${capTheme.feedCanvas}`}
            aria-label="Capsule feed"
            data-capsule-id={capsuleId ?? undefined}
          >
            <CapsuleFeed />
          </div>
        </>
      ) : (
        <>
          {tab === "live" ? (
            <div className={capTheme.liveCanvas} aria-label="Live stream area" />
          ) : (
            <StorePlaceholder />
          )}
          <div className={capTheme.prompterBelow}>{prompter}</div>
        </>
      )}
    </div>
  );

  return (
    <>
      {LiveArea}
      {/* Below the live area: banner and customizable sections */}
      <div className={capTheme.bannerBottom} />
      <CapsuleSections />
    </>
  );
}

function CapsuleFeed() {
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
  } = useHomeFeed();

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
      />
    </section>
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

type Section = { id: string; title: string };

function CapsuleSections() {
  const [sections, setSections] = React.useState<Section[]>([
    { id: "about", title: "About" },
    { id: "schedule", title: "Schedule" },
    { id: "sponsors", title: "Sponsors" },
  ]);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draftTitle, setDraftTitle] = React.useState<string>("");

  const startEdit = (id: string, current: string) => {
    setEditingId(id);
    setDraftTitle(current);
  };
  const confirmEdit = () => {
    if (!editingId) return;
    setSections((prev) => prev.map((s) => (s.id === editingId ? { ...s, title: draftTitle.trim() || s.title } : s)));
    setEditingId(null);
    setDraftTitle("");
  };
  const remove = (id: string) => setSections((prev) => prev.filter((s) => s.id !== id));
  const add = () => {
    const id = `section_${Math.random().toString(36).slice(2, 8)}`;
    const title = "New Section";
    setSections((prev) => [...prev, { id, title }]);
    setEditingId(id);
    setDraftTitle(title);
  };

  return (
    <div className={capTheme.sectionsGrid}>
      {sections.map((s) => (
        <div key={s.id} className={capTheme.sectionTile}>
          <div className={capTheme.sectionTileHeader}>
            {editingId === s.id ? (
              <input
                className={capTheme.sectionTitleInput}
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmEdit();
                }}
                autoFocus
              />
            ) : (
              <h4 className={capTheme.sectionTileTitle}>{s.title}</h4>
            )}
            <div className={capTheme.sectionTileActions}>
              {editingId === s.id ? (
                <button className={capTheme.iconBtn} onClick={confirmEdit} aria-label="Save section title">
                  <Check size={16} weight="bold" />
                </button>
              ) : (
                <button
                  className={capTheme.iconBtn}
                  onClick={() => startEdit(s.id, s.title)}
                  aria-label="Rename section"
                >
                  <PencilSimple size={16} weight="bold" />
                </button>
              )}
              <button className={capTheme.iconBtn} onClick={() => remove(s.id)} aria-label="Delete section">
                <Trash size={16} weight="bold" />
              </button>
            </div>
          </div>
          <div className={capTheme.sectionTileBody}>Customize this area…</div>
        </div>
      ))}
      <button className={capTheme.sectionAdd} type="button" onClick={add} aria-label="Add section">
        <Plus size={18} weight="bold" />
        Add section
      </button>
    </div>
  );
}
