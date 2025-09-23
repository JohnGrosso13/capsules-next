"use client";

import React from "react";
import styles from "./create.module.css";

export function ComposeForm() {
  const [content, setContent] = React.useState("");
  const [mediaUrl, setMediaUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post: { kind: mediaUrl ? "image" : "text", content, mediaUrl } }),
      });
      if (!res.ok) throw new Error(await res.text());
      setContent("");
      setMediaUrl("");
      setNote("Saved! View it in your capsule.");
    } catch (error) {
      setNote("Failed to save. Please sign in and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label>
        Post content
        <textarea className={styles.textarea} value={content} onChange={(e) => setContent(e.target.value)} placeholder="What's on your mind?" />
      </label>
      <label>
        Image URL (optional)
        <input className={styles.input} type="url" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://..." />
      </label>
      <button className={styles.submit} type="submit" disabled={busy}>{busy ? "Saving..." : "Create Post"}</button>
      {note && <div className={styles.notice}>{note}</div>}
    </form>
  );
}

