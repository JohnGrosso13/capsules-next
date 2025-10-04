"use client";

import * as React from "react";

export function CapsuleSignedIn() {
  return (
    <div
      style={{
        padding: "24px",
        borderRadius: "16px",
        border: "1px solid var(--card-border)",
        background: "linear-gradient(180deg, var(--card-bg-1), var(--card-bg-2))",
        boxShadow: "var(--card-shadow)",
      }}
    >
      <h2 style={{ fontSize: "1.4rem", fontWeight: 800, marginBottom: "8px" }}>Capsule space</h2>
      <p style={{ color: "var(--text-2)" }}>
        This area will soon host your Capsule timeline, media, and automations.
      </p>
    </div>
  );
}

