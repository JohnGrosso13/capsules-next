import * as React from "react";

import { Input } from "@/components/ui/input";
import type { UserSearchResult, CapsuleSearchResult } from "@/types/search";

import { MIN_NAME_QUERY, SUGGESTION_LIMIT } from "../constants";
import styles from "../../ladders/LadderBuilder.module.css";
import type { ParticipantFormState, ParticipantSuggestion } from "../types";

type NameFieldProps = {
  index: number;
  participant: ParticipantFormState;
  onChangeName: (value: string) => void;
  onSelectSuggestion: (suggestion: ParticipantSuggestion) => void;
};

export const NameField = ({ index, participant, onChangeName, onSelectSuggestion }: NameFieldProps) => {
  const [query, setQuery] = React.useState(participant.displayName);
  const [open, setOpen] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<ParticipantSuggestion[]>([]);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    setQuery(participant.displayName);
  }, [participant.displayName]);

  React.useEffect(() => {
    const term = query.trim();
    if (term.length < MIN_NAME_QUERY) {
      abortRef.current?.abort();
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: term, limit: SUGGESTION_LIMIT }),
          signal: controller.signal,
        });
        if (!response.ok) {
          setSuggestions([]);
          return;
        }
        const data = (await response.json().catch(() => null)) as
          | { sections?: Array<{ type: string; items?: Array<UserSearchResult | CapsuleSearchResult> }> }
          | null;
        const sections = Array.isArray(data?.sections) ? data?.sections : [];
        const users = sections.find((section) => section.type === "users");
        const capsules = sections.find((section) => section.type === "capsules");
        const userSuggestions =
          Array.isArray(users?.items) && users.items.length
            ? (users.items as UserSearchResult[]).slice(0, SUGGESTION_LIMIT).map((user) => ({
                kind: "user" as const,
                id: user.id,
                name: user.name,
                subtitle: user.subtitle,
              }))
            : [];
        const capsuleSuggestions =
          Array.isArray(capsules?.items) && capsules.items.length
            ? (capsules.items as CapsuleSearchResult[]).slice(0, SUGGESTION_LIMIT).map((capsule) => ({
                kind: "capsule" as const,
                id: capsule.id,
                name: capsule.name,
                subtitle: capsule.subtitle,
              }))
            : [];
        setSuggestions([...userSuggestions, ...capsuleSuggestions].slice(0, SUGGESTION_LIMIT));
      } catch {
        setSuggestions([]);
      }
    }, 140);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const handleSelect = (suggestion: ParticipantSuggestion) => {
    setQuery(suggestion.name);
    onSelectSuggestion(suggestion);
    setOpen(false);
  };

  return (
    <div className={styles.memberField}>
      <div className={styles.memberSuggestWrap}>
        <Input
          id={`participant-name-${index}`}
          value={query}
          name={`participant-search-${index}`}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          inputMode="search"
          onFocus={() => {
            setOpen(true);
            setSuggestions([]);
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            onChangeName(value);
          }}
          placeholder="Search users or capsules"
        />
        {open && suggestions.length > 0 ? (
          <div className={styles.memberSuggestList} role="listbox" aria-label="Suggested entrants">
            {suggestions.map((suggestion) => (
              <button
                key={`${suggestion.kind}-${suggestion.id}`}
                type="button"
                className={styles.memberSuggestItem}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(suggestion)}
              >
                <span className={styles.memberSuggestName}>{suggestion.name}</span>
                <span className={styles.memberSuggestMeta}>
                  {suggestion.kind === "user" ? "User" : "Capsule"}
                  {suggestion.subtitle ? `  ${suggestion.subtitle}` : ""}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};
