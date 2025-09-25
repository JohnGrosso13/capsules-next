"use client";

import * as React from "react";

export function CapsuleSignedIn() {
  return (
    <div
      style={{
        padding: "24px",
        borderRadius: "16px",
        border: "1px solid rgba(255,255,255,0.12)",
        background: "linear-gradient(180deg, rgba(12,16,38,0.95), rgba(10,14,34,0.82))",
      }}
    >
      <h2 style={{ fontSize: "1.4rem", fontWeight: 800, marginBottom: "8px" }}>Capsule space</h2>
      <p style={{ color: "rgba(255,255,255,0.75)" }}>
        This area will soon host your Capsule timeline, media, and automations.
      </p>
    </div>
  );
}
