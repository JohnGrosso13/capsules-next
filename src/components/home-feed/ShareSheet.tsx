"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  CopySimple,
  LinkSimple,
  ShareNetwork,
  XLogo,
  LinkedinLogo,
  RedditLogo,
  WhatsappLogo,
  YoutubeLogo,
  DiscordLogo,
  FacebookLogo,
  MessengerLogo,
  GoogleLogo,
  X,
} from "@phosphor-icons/react/dist/ssr";

import styles from "@/components/home-feed.module.css";

type ShareSheetProps = {
  open: boolean;
  url: string | null;
  title: string;
  text: string;
  onClose(): void;
  onNativeShare?: () => void;
  canNativeShare?: boolean;
};

type ShareOption = {
  key: string;
  label: string;
  href: string;
  icon: React.ReactNode;
};

export function ShareSheet({ open, url, title, text, onClose, onNativeShare, canNativeShare }: ShareSheetProps) {
  const [mounted, setMounted] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open || !mounted || !url) return null;

  const normalizedUrl = url;
  const encodedUrl = encodeURIComponent(normalizedUrl);
  const encodedTitle = encodeURIComponent(title);
  const encodedText = encodeURIComponent(text);

  const options: ShareOption[] = [
    {
      key: "whatsapp",
      label: "Send via WhatsApp",
      href: `https://api.whatsapp.com/send?text=${encodedText}%20${encodedUrl}`,
      icon: <WhatsappLogo weight="duotone" />,
    },
    {
      key: "facebook",
      label: "Share on Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      icon: <FacebookLogo weight="duotone" />,
    },
    {
      key: "messenger",
      label: "Send via Messenger",
      href: `https://www.messenger.com/t/?link=${encodedUrl}`,
      icon: <MessengerLogo weight="duotone" />,
    },
    {
      key: "x",
      label: "Share on X",
      href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`,
      icon: <XLogo weight="duotone" />,
    },
    {
      key: "reddit",
      label: "Share on Reddit",
      href: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`,
      icon: <RedditLogo weight="duotone" />,
    },
    {
      key: "youtube",
      label: "Share to YouTube",
      href: `https://www.youtube.com/redirect?q=${encodedUrl}`,
      icon: <YoutubeLogo weight="duotone" />,
    },
    {
      key: "discord",
      label: "Send to Discord",
      href: `https://discord.com/channels/@me?url=${encodedUrl}`,
      icon: <DiscordLogo weight="duotone" />,
    },
    {
      key: "gmail",
      label: "Send via Gmail",
      href: `https://mail.google.com/mail/?view=cm&fs=1&su=${encodedTitle}&body=${encodedText}%0A%0A${encodedUrl}`,
      icon: <GoogleLogo weight="duotone" />,
    },
    {
      key: "linkedin",
      label: "Share on LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      icon: <LinkedinLogo weight="duotone" />,
    },
  ];

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(normalizedUrl);
      } else {
        const fallback = document.createElement("textarea");
        fallback.value = normalizedUrl;
        fallback.style.position = "fixed";
        fallback.style.top = "-9999px";
        document.body.appendChild(fallback);
        fallback.select();
        document.execCommand("copy");
        document.body.removeChild(fallback);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      console.warn("Copy share link failed", error);
    }
  };

  const content = (
    <div
      className={styles.shareSheetOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Share post"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.shareSheet}>
        <header className={styles.shareSheetHeader}>
          <div className={styles.shareSheetTitleRow}>
            <ShareNetwork size={18} weight="duotone" aria-hidden />
            <span className={styles.shareSheetTitle}>Share this post</span>
          </div>
          <button type="button" className={styles.shareSheetClose} onClick={onClose} aria-label="Close share">
            <X weight="bold" />
          </button>
        </header>
        <div className={styles.shareSheetBody}>
          <p className={styles.shareSheetUrl} title={normalizedUrl}>
            {normalizedUrl}
          </p>
          <div className={styles.shareSheetActions}>
            <button type="button" className={styles.shareSheetAction} onClick={handleCopy}>
              <span className={styles.shareSheetIcon}>
                <CopySimple weight="duotone" />
              </span>
              <span className={styles.shareSheetLabel}>{copied ? "Link copied" : "Copy link"}</span>
            </button>
            {canNativeShare ? (
              <button type="button" className={styles.shareSheetAction} onClick={onNativeShare}>
                <span className={styles.shareSheetIcon}>
                  <LinkSimple weight="duotone" />
                </span>
                <span className={styles.shareSheetLabel}>Share with device</span>
              </button>
            ) : null}
          </div>
          <div className={styles.shareOptionGrid}>
            {options.map((option) => (
              <a
                key={option.key}
                className={styles.shareOption}
                href={option.href}
                target="_blank"
                rel="noreferrer"
              >
                <span className={styles.shareSheetIcon}>{option.icon}</span>
                <span className={styles.shareSheetLabel}>{option.label}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

export default ShareSheet;
