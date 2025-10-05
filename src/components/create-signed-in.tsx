"use client";

import * as React from "react";

import { ComposerWorkspace } from "@/components/composer/workspace";

const RECENT_STUBS = [
  { id: "draft-hero", title: "Spring Launch Hero", meta: "Draft · 2d ago" },
  { id: "newsletter", title: "Weekly Capsule Digest", meta: "Template" },
  { id: "event-kit", title: "Creator Event Runbook", meta: "Draft · 5d ago" },
];

const REFERENCE_STUBS = [
  { id: "asset-hero", title: "Launch hero render", meta: "Media · 4K" },
  { id: "asset-style", title: "Brand palette v2", meta: "Style guide" },
];

const SUGGESTION_STUBS = [
  "Draft a welcome storyline",
  "Inject testimonials into highlights",
  "Prep follow-up email",
];

export function CreateSignedIn() {
  return (
    <ComposerWorkspace
      artifact={null}
      recents={RECENT_STUBS}
      references={REFERENCE_STUBS}
      suggestions={SUGGESTION_STUBS}
      onSendMessage={async () => {
        return Promise.resolve();
      }}
    />
  );
}
