"use client";

import * as React from "react";
import { YoutubeLogo } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  type AlertTone,
} from "@/components/ui/alert";
import { buildMemoryEnvelope } from "@/lib/memory/envelope";
import { useCurrentUser } from "@/services/auth/client";

import cards from "@/components/cards.module.css";

import layout from "./settings.module.css";
import styles from "./connections-section.module.css";

type ProviderKey = "youtube";

type LinkedAccount = {
  provider: ProviderKey;
  connected: boolean;
  remoteUserId: string | null;
  remoteUsername: string | null;
  connectedAt: string | null;
  updatedAt: string | null;
};

type BannerState = {
  tone: AlertTone;
  title: string;
  description?: string | null;
};

type ProviderConfig = {
  key: ProviderKey;
  title: string;
  summary: string;
  icon: React.ReactNode;
};

const PROVIDERS: ProviderConfig[] = [
  {
    key: "youtube",
    title: "YouTube",
    summary:
      "Link your channel so Capsules can publish shorts, VODs, and live recaps directly to YouTube.",
    icon: <YoutubeLogo size={26} weight="fill" />,
  },
];

function normalizeAccount(raw: unknown): LinkedAccount | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const provider = typeof record.provider === "string" ? record.provider.toLowerCase() : "";
  if (provider !== "youtube") return null;
  const remoteUserId =
    typeof record.remote_user_id === "string" ? record.remote_user_id : null;
  const remoteUsername =
    typeof record.remote_username === "string" ? record.remote_username : null;
  const connectedAt =
    typeof record.connected_at === "string" ? record.connected_at : null;
  const updatedAt = typeof record.updated_at === "string" ? record.updated_at : null;
  return {
    provider: "youtube",
    connected: true,
    remoteUserId,
    remoteUsername,
    connectedAt,
    updatedAt,
  };
}

function formatRelativeTimestamp(timestamp: string | null): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resolveRedirectTarget(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "connections");
    url.searchParams.delete("connected");
    url.searchParams.delete("provider");
    url.searchParams.delete("reason");
    if (url.hash === "#linked") {
      url.hash = "";
    }
    return url.toString();
  } catch (error) {
    console.error("settings connections resolve redirect failed", error);
    return null;
  }
}

const FAILURE_REASONS: Record<string, string> = {
  state: "The sign-in attempt expired. Start the link again.",
  token: "We could not verify YouTube tokens. Please retry.",
  callback: "We ran into an unexpected YouTube error. Try again shortly.",
  code: "YouTube did not provide an authorization code. Retry the link process.",
};

export function ConnectionsSettingsSection(): React.JSX.Element {
  const { user, isLoaded } = useCurrentUser();
  const envelope = React.useMemo(() => (user ? buildMemoryEnvelope(user) : null), [user]);

  const [accounts, setAccounts] = React.useState<Record<ProviderKey, LinkedAccount>>({
    youtube: {
      provider: "youtube",
      connected: false,
      remoteUserId: null,
      remoteUsername: null,
      connectedAt: null,
      updatedAt: null,
    },
  });
  const [loading, setLoading] = React.useState<boolean>(false);
  const [loadedOnce, setLoadedOnce] = React.useState<boolean>(false);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [banner, setBanner] = React.useState<BannerState | null>(null);
  const [action, setAction] = React.useState<{
    provider: ProviderKey;
    mode: "connect" | "disconnect";
  } | null>(null);

  const fetchAccounts = React.useCallback(async () => {
    if (!envelope) return;
    setLoading(true);
    setFetchError(null);
    try {
      const response = await fetch("/api/linked-accounts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: envelope }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { accounts?: unknown }
        | null;
      if (!response.ok || !payload || !Array.isArray(payload.accounts)) {
        throw new Error(
          (payload && (payload as Record<string, unknown>).error as string) ||
            `Linked accounts fetch failed (${response.status})`,
        );
      }
      const nextAccounts: Record<ProviderKey, LinkedAccount> = {
        youtube: {
          provider: "youtube",
          connected: false,
          remoteUserId: null,
          remoteUsername: null,
          connectedAt: null,
          updatedAt: null,
        },
      };
      for (const entry of payload.accounts) {
        const normalized = normalizeAccount(entry);
        if (normalized) {
          nextAccounts[normalized.provider] = normalized;
        }
      }
      setAccounts(nextAccounts);
    } catch (error) {
      console.error("settings connections fetch error", error);
      setFetchError(
        error instanceof Error && error.message
          ? error.message
          : "Unable to load linked accounts. Please try again.",
      );
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }, [envelope]);

  React.useEffect(() => {
    if (!isLoaded || !envelope) return;
    void fetchAccounts();
  }, [isLoaded, envelope, fetchAccounts]);

  React.useEffect(() => {
    if (!banner) return;
    if (typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      setBanner(null);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [banner]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      const connected = url.searchParams.get("connected");
      const provider = (url.searchParams.get("provider") || "").toLowerCase();
      const reason = url.searchParams.get("reason") || "";
      if (!connected && !provider && !reason) return;

      const isYouTube = provider === "youtube" || !provider;
      if (connected === "1" && isYouTube) {
        setBanner({
          tone: "success",
          title: "YouTube connected",
          description: "Your YouTube account is ready for Capsules automations.",
        });
        void fetchAccounts();
      } else if (connected === "0" && isYouTube) {
        setBanner({
          tone: "danger",
          title: "YouTube connection failed",
          description: FAILURE_REASONS[reason] ?? "Please try again.",
        });
      }

      url.searchParams.delete("connected");
      url.searchParams.delete("provider");
      url.searchParams.delete("reason");
      if (url.hash === "#linked") {
        url.hash = "";
      }
      window.history.replaceState(window.history.state, "", url.toString());
    } catch (error) {
      console.error("settings connections banner parse error", error);
    }
  }, [fetchAccounts]);

  const handleConnect = React.useCallback(async () => {
    if (!envelope) {
      setBanner({
        tone: "danger",
        title: "Sign in required",
        description: "Sign in to your Capsules account before linking YouTube.",
      });
      return;
    }
    const redirectTarget = resolveRedirectTarget();
    setAction({ provider: "youtube", mode: "connect" });
    try {
      const response = await fetch("/api/oauth/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "youtube",
          redirect: redirectTarget ?? undefined,
          user: envelope,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { url?: string; error?: string }
        | null;
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error ?? `YouTube OAuth start failed (${response.status})`);
      }
      if (typeof window !== "undefined") {
        window.location.assign(payload.url);
      }
    } catch (error) {
      console.error("settings connections connect error", error);
      setAction(null);
      setBanner({
        tone: "danger",
        title: "Unable to connect YouTube",
        description:
          error instanceof Error && error.message
            ? error.message
            : "Please try again shortly.",
      });
    }
  }, [envelope]);

  const handleDisconnect = React.useCallback(async () => {
    if (!envelope) {
      setBanner({
        tone: "danger",
        title: "Sign in required",
        description: "Sign in to your Capsules account before unlinking YouTube.",
      });
      return;
    }
    setAction({ provider: "youtube", mode: "disconnect" });
    try {
      const response = await fetch("/api/oauth/disconnect", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "youtube", user: envelope }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; error?: string }
        | null;
      if (!response.ok || payload?.error) {
        throw new Error(payload?.error ?? `YouTube disconnect failed (${response.status})`);
      }
      setBanner({
        tone: "success",
        title: "YouTube disconnected",
        description: "Capsules will stop posting to YouTube until you reconnect.",
      });
      await fetchAccounts();
    } catch (error) {
      console.error("settings connections disconnect error", error);
      setBanner({
        tone: "danger",
        title: "Unable to disconnect YouTube",
        description:
          error instanceof Error && error.message
            ? error.message
            : "Please try again shortly.",
      });
    } finally {
      setAction(null);
    }
  }, [envelope, fetchAccounts]);

  if (!isLoaded) {
    return (
      <article className={`${cards.card} ${layout.card}`}>
        <header className={cards.cardHead}>
          <h3 className={layout.sectionTitle}>Connections</h3>
        </header>
        <div className={`${cards.cardBody} ${styles.sectionBody}`}>
          <p className={styles.loadingNote}>Loading your account details...</p>
        </div>
      </article>
    );
  }

  if (!envelope) {
    return (
      <article className={`${cards.card} ${layout.card}`}>
        <header className={cards.cardHead}>
          <h3 className={layout.sectionTitle}>Connections</h3>
        </header>
        <div className={`${cards.cardBody} ${styles.sectionBody}`}>
          <p className={styles.emptyState}>
            Sign in with your Capsules account to manage social connections.
          </p>
        </div>
      </article>
    );
  }

  const youtubeAccount = accounts.youtube;
  const youtubeConnected = youtubeAccount?.connected ?? false;
  const youtubeName = youtubeAccount?.remoteUsername ?? youtubeAccount?.remoteUserId ?? null;
  const youtubeConnectedTimestamp =
    formatRelativeTimestamp(youtubeAccount?.updatedAt ?? youtubeAccount?.connectedAt ?? null) ??
    null;

  const showInitialLoading = loading && !loadedOnce;
  const showRefreshing = loading && loadedOnce;
  const connectPending =
    action?.provider === "youtube" && action.mode === "connect";
  const disconnectPending =
    action?.provider === "youtube" && action.mode === "disconnect";

  return (
    <article className={`${cards.card} ${layout.card}`}>
      <header className={cards.cardHead}>
        <h3 className={layout.sectionTitle}>Connections</h3>
      </header>
      <div className={`${cards.cardBody} ${styles.sectionBody}`}>
        <p className={styles.intro}>
          Connect Capsules to your social channels. Once linked, automations like clip uploads and
          schedule assistants can post on your behalf.
        </p>

        {banner ? (
          <Alert tone={banner.tone} className={styles.alert}>
            <AlertTitle>{banner.title}</AlertTitle>
            {banner.description ? (
              <AlertDescription>{banner.description}</AlertDescription>
            ) : null}
          </Alert>
        ) : null}

        {fetchError ? (
          <div className={styles.errorRow}>
            <p>{fetchError}</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                void fetchAccounts();
              }}
              loading={loading}
            >
              Retry
            </Button>
          </div>
        ) : null}

        {showInitialLoading ? (
          <p className={styles.loadingNote}>Loading your connections...</p>
        ) : null}

        {showRefreshing ? (
          <p className={styles.loadingNote}>Refreshing connection status...</p>
        ) : null}

        <div className={styles.providers}>
          {PROVIDERS.map((provider) => {
            if (provider.key === "youtube") {
              return (
                <article key={provider.key} className={styles.providerCard}>
                  <div className={styles.providerHeader}>
                    <span className={styles.providerIcon} aria-hidden>
                      {provider.icon}
                    </span>
                    <div className={styles.providerHeading}>
                      <h4 className={styles.providerTitle}>{provider.title}</h4>
                      <p className={styles.providerSummary}>{provider.summary}</p>
                    </div>
                  </div>
                  <div className={styles.providerStatusRow}>
                    <div>
                      <p
                        className={styles.providerStatus}
                        data-state={youtubeConnected ? "connected" : "disconnected"}
                      >
                        {youtubeConnected
                          ? youtubeName
                            ? `Connected as ${youtubeName}`
                            : "Connected"
                          : "Not connected"}
                      </p>
                      {youtubeConnectedTimestamp ? (
                        <p className={styles.providerMeta}>
                          Last updated {youtubeConnectedTimestamp}
                        </p>
                      ) : null}
                    </div>
                    <div className={styles.providerActions}>
                      {youtubeConnected ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            void handleDisconnect();
                          }}
                          loading={disconnectPending}
                        >
                          Disconnect
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant={youtubeConnected ? "ghost" : "primary"}
                        size="sm"
                        onClick={() => {
                          void handleConnect();
                        }}
                        loading={connectPending}
                      >
                        {youtubeConnected ? "Reconnect" : "Connect"}
                      </Button>
                    </div>
                  </div>
                </article>
              );
            }
            return null;
          })}
        </div>
      </div>
    </article>
  );
}
