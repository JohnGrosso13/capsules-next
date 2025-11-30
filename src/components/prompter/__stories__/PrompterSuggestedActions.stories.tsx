"use client";

import * as React from "react";

import { PrompterSuggestedActions } from "@/components/prompter/PrompterSuggestedActions";

const meta = {
  title: "Prompter/PrompterSuggestedActions",
  component: PrompterSuggestedActions,
};

export default meta;

export function Default() {
  const [lastAction, setLastAction] = React.useState<string | null>(null);
  const actions = ["Post an update", "Share a photo", "Summarize my feed", "Style my capsule"].map((label, index) => ({ id: `story-chip-${index}`, label, value: label }));
  return (
    <div style={{ maxWidth: 520 }}>
      <PrompterSuggestedActions actions={actions} onSelect={(action) => setLastAction(action.label)} />
      {lastAction ? (
        <p style={{ marginTop: "1rem" }}>
          Last selected:
          <span style={{ fontWeight: 600, marginLeft: 4 }}>{lastAction}</span>
        </p>
      ) : null}
    </div>
  );
}

