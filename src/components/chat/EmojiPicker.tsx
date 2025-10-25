import * as React from "react";

import styles from "./chat.module.css";
import type { EmojiEntry } from "./emoji-data";
import { EMOJI_DATA, POPULAR_REACTIONS } from "./emoji-data";

type EmojiPickerProps = {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  anchorLabel?: string;
};

type EmojiGridEntry = EmojiEntry & { index: number };

const MAX_RESULTS = 200;

function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .normalize("NFKD");
}

export function EmojiPicker({ onSelect, onClose, anchorLabel }: EmojiPickerProps) {
  const [query, setQuery] = React.useState("");
  const [highlightIndex, setHighlightIndex] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const filteredEmojis = React.useMemo<EmojiGridEntry[]>(() => {
    const normalizedQuery = normalizeSearch(query);
    if (!normalizedQuery) {
      return EMOJI_DATA.slice(0, MAX_RESULTS).map((entry, index) => ({ ...entry, index }));
    }
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    const results: EmojiGridEntry[] = [];
    for (let idx = 0; idx < EMOJI_DATA.length; idx += 1) {
      const entry = EMOJI_DATA[idx]!;
      const haystack = [entry.name, ...entry.keywords].map(normalizeSearch).join(" ");
      const matches = tokens.every((token) => haystack.includes(token));
      if (matches) {
        results.push({ ...entry, index: idx });
        if (results.length >= MAX_RESULTS) break;
      }
    }
    return results;
  }, [query]);

  React.useEffect(() => {
    setHighlightIndex((current) => {
      if (!filteredEmojis.length) return 0;
      const bounded = Math.max(0, Math.min(filteredEmojis.length - 1, current));
      return bounded;
    });
  }, [filteredEmojis.length]);

  const handleSelect = React.useCallback(
    (emoji: string) => {
      onSelect(emoji);
      onClose();
    },
    [onClose, onSelect],
  );

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (!filteredEmojis.length) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightIndex((current) => {
          const next = current + 6;
          return next >= filteredEmojis.length ? current : next;
        });
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightIndex((current) => {
          const next = current - 6;
          return next < 0 ? 0 : next;
        });
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setHighlightIndex((current) => Math.min(filteredEmojis.length - 1, current + 1));
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setHighlightIndex((current) => Math.max(0, current - 1));
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const emoji = filteredEmojis[highlightIndex]?.emoji;
        if (emoji) handleSelect(emoji);
      }
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [filteredEmojis, highlightIndex, handleSelect, onClose]);

  React.useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (containerRef.current && containerRef.current.contains(target)) return;
      onClose();
    };
    window.addEventListener("mousedown", onPointerDown, { capture: true } as AddEventListenerOptions);
    return () => window.removeEventListener("mousedown", onPointerDown, { capture: true } as AddEventListenerOptions);
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      className={styles.emojiPicker}
      role="dialog"
      aria-label={anchorLabel ? `Choose reaction for ${anchorLabel}` : "Choose reaction"}
    >
      <input
        ref={inputRef}
        className={styles.emojiSearchInput}
        type="search"
        placeholder="Search emoji"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Search emoji"
      />
      {!query ? (
        <div className={styles.emojiPopularRow}>
          {POPULAR_REACTIONS.map((emoji) => (
            <button
              key={`popular-${emoji}`}
              type="button"
              className={styles.emojiPopularButton}
              onClick={() => handleSelect(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}
      <div className={styles.emojiGrid} role="listbox" aria-label="Emoji results">
        {filteredEmojis.length ? (
          filteredEmojis.map((entry, index) => {
            const isActive = index === highlightIndex;
            return (
              <button
                key={`${entry.emoji}-${entry.index}`}
                type="button"
                className={`${styles.emojiGridButton} ${isActive ? styles.emojiGridButtonActive : ""}`.trim()}
                onMouseEnter={() => setHighlightIndex(index)}
                onClick={() => handleSelect(entry.emoji)}
                role="option"
                aria-selected={isActive}
                title={entry.name}
              >
                <span className={styles.emojiGlyph}>{entry.emoji}</span>
              </button>
            );
          })
        ) : (
          <p className={styles.emojiEmpty}>No emoji found</p>
        )}
      </div>
    </div>
  );
}
