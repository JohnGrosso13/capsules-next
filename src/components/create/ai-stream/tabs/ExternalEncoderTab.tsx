"use client";

import * as React from "react";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import type { StreamOverview, StreamPreferences, StreamSession } from "@/types/ai-stream";
import { cn } from "@/lib/cn";
import {
  ArrowSquareOut,
  CheckCircle,
  CopySimple,
  DownloadSimple,
  Eye,
  EyeSlash,
  GithubLogo,
  Globe,
  Lightning,
  ListChecks,
  PaperPlaneTilt,
  Plus,
  Prohibit,
  QrCode,
  ShieldCheck,
  Trash,
  TwitchLogo,
  Warning,
  WarningCircle,
  YoutubeLogo,
} from "@phosphor-icons/react/dist/ssr";

import layoutStyles from "@/app/(authenticated)/create/ai-stream/ai-stream.page.module.css";
import { formatDuration, formatTimestamp } from "../formatUtils";
import styles from "./EncoderTab.module.css";

export type DestinationDraft = {
  label: string;
  provider: string;
  url: string;
  streamKey: string;
};

export type WebhookDraft = {
  label: string;
  url: string;
  secret: string;
  events: string[];
};

type DestinationOption = {
  value: string;
  label: string;
};

type WebhookOption = {
  value: string;
  label: string;
};

type WebhookTestStatus = "idle" | "pending" | "success" | "error";

type ExternalEncoderTabProps = {
  capsuleName: string;
  activeSession: StreamSession | null;
  streamOverview: StreamOverview | null;
  streamPreferences: StreamPreferences;
  overviewLoading: boolean;
  overviewError: string | null;
  actionBusy: "ensure" | "rotate" | null;
  onEnsureStream: () => void;
  onLatencyChange: (event: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => void;
  onRotateStreamKey: () => void;
  onDownloadObsProfile: () => void | Promise<void>;
  onCopy: (label: string, value: string | null | undefined) => void;
  copiedField: string | null;
  maskSecret: (value: string | null | undefined) => string;
  showPrimaryKey: boolean;
  onTogglePrimaryKey: () => void;
  showBackupKey: boolean;
  onToggleBackupKey: () => void;
  downloadBusy: boolean;
  qrGenerating: boolean;
  qrError: string | null;
  qrImageDataUrl: string | null;
  mobileIngestPayload: string | null;
  simulcastDraft: DestinationDraft;
  onSimulcastDraftChange: (field: keyof DestinationDraft, value: string) => void;
  simulcastOptions: DestinationOption[];
  addingDestination: boolean;
  onStartAddDestination: () => void;
  onAddSimulcastDestination: (event?: React.FormEvent<HTMLFormElement>) => void;
  onCancelAddDestination: () => void;
  destinationError: string | null;
  onToggleDestination: (id: string) => void;
  onRemoveDestination: (id: string) => void;
  resolveProviderLabel: (value: string) => string;
  webhookDraft: WebhookDraft;
  onWebhookFieldChange: (field: "label" | "url" | "secret", value: string) => void;
  onWebhookEventToggle: (eventValue: string) => void;
  webhookOptions: WebhookOption[];
  addingWebhook: boolean;
  onStartAddWebhook: () => void;
  onAddWebhookEndpoint: (event?: React.FormEvent<HTMLFormElement>) => void;
  onCancelAddWebhook: () => void;
  webhookError: string | null;
  onToggleWebhook: (id: string) => void;
  onRemoveWebhook: (id: string) => void;
  playbackUrl: string | null;
  embedCodeSnippet: string | null;
  onUpdatePreferences: (updates: Partial<StreamPreferences>) => void;
  defaultPrimaryIngestUrl: string;
  webhookTestStatus?: Record<string, WebhookTestStatus>;
  onSendWebhookTest?: (endpointId: string) => void;
};

function providerIcon(provider: string): React.ReactNode {
  const normalized = provider.toLowerCase();
  if (normalized === "twitch") return <TwitchLogo size={18} weight="duotone" />;
  if (normalized === "youtube") return <YoutubeLogo size={18} weight="duotone" />;
  if (normalized === "facebook") return <Globe size={18} weight="duotone" />;
  if (normalized === "github") return <GithubLogo size={18} weight="duotone" />;
  if (normalized === "kick") return <Lightning size={18} weight="duotone" />;
  return <Globe size={18} weight="duotone" />;
}

function providerIconClass(provider: string): string {
  const normalized = provider.toLowerCase();
  if (normalized === "twitch") return cn(styles.destinationIcon, styles.destinationIconTwitch);
  if (normalized === "youtube") return cn(styles.destinationIcon, styles.destinationIconYoutube);
  if (normalized === "facebook") return cn(styles.destinationIcon, styles.destinationIconFacebook);
  if (normalized === "kick") return cn(styles.destinationIcon, styles.destinationIconKick);
  return cn(styles.destinationIcon, styles.destinationIconCustom);
}

function destinationStatusLabel(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "live") return "Live";
  if (normalized === "connected") return "Connected";
  if (normalized === "error" || normalized === "errored") return "Error";
  return "Idle";
}

function destinationStatusClass(status: string, enabled: boolean): string {
  const normalized = status.toLowerCase();
  const base = styles.encoderDestinationStatus;
  if (normalized === "live" || normalized === "connected") {
    return cn(base, styles.encoderDestinationStatusLive, !enabled && styles.encoderDestinationStatusDisabled);
  }
  if (normalized === "error" || normalized === "errored") {
    return cn(base, styles.encoderDestinationStatusError, !enabled && styles.encoderDestinationStatusDisabled);
  }
  return cn(base, !enabled && styles.encoderDestinationStatusDisabled);
}

function webhookStatusClass(enabled: boolean): string {
  return enabled
    ? cn(styles.encoderWebhookStatus, styles.encoderWebhookStatusEnabled)
    : cn(styles.encoderWebhookStatus, styles.encoderWebhookStatusDisabled);
}

function checklistIcon(done: boolean): React.ReactNode {
  return done ? <CheckCircle size={18} weight="duotone" /> : <Warning size={18} weight="duotone" />;
}

export function ExternalEncoderTab({
  capsuleName,
  activeSession,
  streamOverview,
  streamPreferences,
  overviewLoading,
  overviewError,
  actionBusy,
  onEnsureStream,
  onLatencyChange,
  onRotateStreamKey,
  onDownloadObsProfile,
  onCopy,
  copiedField,
  maskSecret,
  showPrimaryKey,
  onTogglePrimaryKey,
  showBackupKey,
  onToggleBackupKey,
  downloadBusy,
  qrGenerating,
  qrError,
  qrImageDataUrl,
  mobileIngestPayload,
  simulcastDraft,
  onSimulcastDraftChange,
  simulcastOptions,
  addingDestination,
  onStartAddDestination,
  onAddSimulcastDestination,
  onCancelAddDestination,
  destinationError,
  onToggleDestination,
  onRemoveDestination,
  resolveProviderLabel,
  webhookDraft,
  onWebhookFieldChange,
  onWebhookEventToggle,
  webhookOptions,
  addingWebhook,
  onStartAddWebhook,
  onAddWebhookEndpoint,
  onCancelAddWebhook,
  webhookError,
  onToggleWebhook,
  onRemoveWebhook,
  playbackUrl,
  embedCodeSnippet,
  onUpdatePreferences,
  defaultPrimaryIngestUrl,
  webhookTestStatus,
  onSendWebhookTest,
}: ExternalEncoderTabProps) {
  const ingestPrimary = streamOverview?.ingest.primary ?? defaultPrimaryIngestUrl;
  const ingestBackup = streamOverview?.ingest.backup ?? null;
  const primaryStreamKey = streamOverview?.ingest.streamKey ?? streamOverview?.liveStream.streamKey ?? "";
  const backupStreamKey =
    streamOverview?.ingest.backupStreamKey ?? streamOverview?.liveStream.streamKeyBackup ?? "";
  const hasActiveSession =
    activeSession?.status === "active" || activeSession?.status === "connected";
  const activeDestinationCount = streamPreferences.simulcastDestinations.filter(
    (destination) => destination.enabled,
  ).length;
  const hasDestinations = streamPreferences.simulcastDestinations.length > 0;
  const hasWebhooks = streamPreferences.webhookEndpoints.length > 0;
  const errorDestinations = streamPreferences.simulcastDestinations.filter(
    (destination) => destination.enabled && destination.status === "error",
  );
  const latestSessionDuration = formatDuration(activeSession?.durationSeconds ?? null);
  const healthStatus = streamOverview?.health.status ?? "unknown";
  const healthLatency = streamOverview?.health.latencyMode ?? streamOverview?.liveStream.latencyMode;

  const checklist = [
    {
      id: "mux-stream",
      label: "Mux live stream ready",
      detail: streamOverview ? "Provisioned" : "Create a live stream to unlock credentials",
      done: Boolean(streamOverview),
    },
    {
      id: "destinations",
      label: "Simulcast destinations configured",
      detail: hasDestinations
        ? `${activeDestinationCount} destination${activeDestinationCount === 1 ? "" : "s"} ready`
        : "Add optional restream targets",
      done: hasDestinations && activeDestinationCount > 0,
    },
    {
      id: "webhooks",
      label: "Webhooks connected",
      detail: hasWebhooks ? "Streaming notifications configured" : "Optional automation hooks",
      done: hasWebhooks,
    },
    {
      id: "preview",
      label: "Encoder streaming",
      detail: hasActiveSession
        ? `Mux sees live input${latestSessionDuration !== "--" ? ` • ${latestSessionDuration}` : ""}`
        : "Start streaming from OBS to go live",
      done: hasActiveSession,
    },
  ];

  const healthTone: "success" | "warning" | "danger" | "info" = (() => {
    const normalized = healthStatus.toLowerCase();
    if (normalized === "active" || normalized === "connected") return "success";
    if (normalized === "idle" || normalized === "disabled") return "info";
    if (normalized === "errored" || normalized === "error") return "danger";
    return "warning";
  })();

  return (
    <div className={styles.encoderLayout}>
      <section className={styles.encoderSection}>
        <div className={styles.cardHeader}>
          <div className={styles.cardHeaderTop}>
            <div>
              <div className={styles.encoderSectionTitle}>External encoder setup</div>
              <p className={styles.encoderSectionSubtitle}>
                Provision RTMP credentials, simulcast destinations, and automation webhooks for{" "}
                <strong>{capsuleName}</strong>.
              </p>
            </div>
            {streamOverview ? (
              <Badge tone={healthTone} variant="soft" size="sm" className={layoutStyles.shellBadge}>
                {`Mux status: ${healthStatus}`}
              </Badge>
            ) : (
              <Badge tone="warning" variant="soft" size="sm" className={layoutStyles.shellBadge}>
                Stream not yet provisioned
              </Badge>
            )}
          </div>
          <ul className={styles.setupChecklist}>
            {checklist.map((item) => (
              <li key={item.id} className={styles.setupItem}>
                <span className={styles.setupLabel}>
                  {checklistIcon(item.done)}
                  {item.label}
                </span>
                <span className={styles.encoderHint}>{item.detail}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.latencyControls}>
          <div className={styles.latencySelectWrapper}>
            <span>Latency profile</span>
            <select
              value={streamPreferences.latencyMode}
              onChange={onLatencyChange}
              className={styles.latencySelect}
            >
              <option value="low">Ultra-low (~2s)</option>
              <option value="reduced">Reduced (~5s)</option>
              <option value="standard">Standard (~12s)</option>
            </select>
          </div>
          <div className={styles.inlineActions}>
            <Button
              variant="gradient"
              size="sm"
              onClick={onEnsureStream}
              loading={actionBusy === "ensure"}
              disabled={overviewLoading}
              leftIcon={<ShieldCheck size={18} weight="duotone" />}
            >
              {streamOverview ? "Rebuild stream" : "Create live stream"}
            </Button>
            {streamOverview ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onRotateStreamKey}
                loading={actionBusy === "rotate"}
                leftIcon={<Prohibit size={16} weight="duotone" />}
              >
                Rotate stream key
              </Button>
            ) : null}
          </div>
        </div>
      </section>
      {overviewError ? (
        <Alert tone="danger" className={styles.encoderSection}>
          <div className={styles.cardHeaderTop}>
            <AlertTitle>Streaming requires attention</AlertTitle>
          </div>
          <AlertDescription>{overviewError}</AlertDescription>
        </Alert>
      ) : null}
      <div className={styles.encoderColumns}>
        <div className={styles.encoderPrimaryColumn}>
          <section className={styles.encoderSection}>
            <div className={styles.cardSectionHeader}>
              <h3 className={styles.cardSectionTitle}>RTMP credentials</h3>
              {streamOverview ? (
                <Badge variant="soft" tone="brand" size="sm" className={layoutStyles.shellBadge}>
                  Managed by Mux
                </Badge>
              ) : (
                <Badge variant="soft" tone="warning" size="sm" className={layoutStyles.shellBadge}>
                  Provision stream first
                </Badge>
              )}
            </div>
            <ul className={styles.encoderList}>
              <li className={styles.encoderRow}>
                <div>
                  <div className={styles.encoderLabel}>Primary ingest URL</div>
                  <div className={styles.encoderValue}>{ingestPrimary}</div>
                </div>
                <div className={styles.encoderRowActions}>
                  <Button
                    variant="ghost"
                    size="xs"
                    leftIcon={<CopySimple size={16} weight="bold" />}
                    onClick={() => onCopy("Primary ingest URL", ingestPrimary)}
                  >
                    {copiedField === "Primary ingest URL" ? "Copied" : "Copy"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    asChild
                  >
                    <a
                      href="https://docs.mux.com/guides/video/live-stream-playback"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Docs
                    </a>
                  </Button>
                </div>
              </li>
              {ingestBackup ? (
                <li className={styles.encoderRow}>
                  <div>
                    <div className={styles.encoderLabel}>Backup ingest URL</div>
                    <div className={styles.encoderValue}>{ingestBackup}</div>
                  </div>
                  <div className={styles.encoderRowActions}>
                    <Button
                      variant="ghost"
                      size="xs"
                      leftIcon={<CopySimple size={16} weight="bold" />}
                      onClick={() => onCopy("Backup ingest URL", ingestBackup)}
                    >
                      {copiedField === "Backup ingest URL" ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </li>
              ) : null}
              <li className={styles.encoderRow}>
                <div>
                  <div className={styles.encoderLabel}>Primary stream key</div>
                  <div className={styles.encoderValue}>
                    {showPrimaryKey ? primaryStreamKey : maskSecret(primaryStreamKey)}
                  </div>
                  <div className={styles.encoderHint}>
                    Keep stream keys secret—rotate immediately if exposed.
                  </div>
                </div>
                <div className={styles.encoderRowActions}>
                  <Button
                    variant="ghost"
                    size="xs"
                    leftIcon={showPrimaryKey ? <EyeSlash size={16} /> : <Eye size={16} />}
                    onClick={onTogglePrimaryKey}
                  >
                    {showPrimaryKey ? "Hide" : "Reveal"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    leftIcon={<CopySimple size={16} weight="bold" />}
                    onClick={() => onCopy("Primary stream key", primaryStreamKey)}
                  >
                    {copiedField === "Primary stream key" ? "Copied" : "Copy"}
                  </Button>
                </div>
              </li>
              {backupStreamKey ? (
                <li className={styles.encoderRow}>
                  <div>
                    <div className={styles.encoderLabel}>Backup stream key</div>
                    <div className={styles.encoderValue}>
                      {showBackupKey ? backupStreamKey : maskSecret(backupStreamKey)}
                    </div>
                  </div>
                  <div className={styles.encoderRowActions}>
                    <Button
                      variant="ghost"
                      size="xs"
                      leftIcon={showBackupKey ? <EyeSlash size={16} /> : <Eye size={16} />}
                      onClick={onToggleBackupKey}
                    >
                      {showBackupKey ? "Hide" : "Reveal"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      leftIcon={<CopySimple size={16} weight="bold" />}
                      onClick={() => onCopy("Backup stream key", backupStreamKey)}
                    >
                      {copiedField === "Backup stream key" ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </li>
              ) : null}
            </ul>
          </section>
          <section className={styles.encoderSection}>
            <div className={styles.cardSectionHeader}>
              <h3 className={styles.cardSectionTitle}>Encoder tools</h3>
              {hasActiveSession ? (
                <Badge variant="soft" tone="success" size="sm">
                  Live heartbeat
                </Badge>
              ) : (
                <Badge variant="soft" tone="neutral" size="sm">
                  Awaiting signal
                </Badge>
              )}
            </div>
            <div className={styles.encoderToolStatus}>
              <div className={styles.encoderToolStatusMeta}>
                <span>Stream health</span>
                <span className={styles.encoderToolStatusMetaLight}>
                  {healthStatus} •{" "}
                  {healthLatency ? `${healthLatency} latency` : "Latency not reported"}
                </span>
              </div>
              {streamOverview?.health.lastSeenAt ? (
                <span className={styles.encoderHint}>
                  Last seen {formatTimestamp(streamOverview.health.lastSeenAt)}
                </span>
              ) : null}
            </div>
            <div className={styles.inlineActions}>
              <Button
                variant="outline"
                size="sm"
                onClick={onDownloadObsProfile}
                loading={downloadBusy}
                disabled={!streamOverview}
                leftIcon={<DownloadSimple size={18} weight="duotone" />}
              >
                Download OBS profile
              </Button>
              {playbackUrl ? (
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<ArrowSquareOut size={18} weight="duotone" />}
                  onClick={() => window.open(playbackUrl, "_blank")}
                >
                  Open preview
                </Button>
              ) : (
                <Button variant="ghost" size="sm" disabled leftIcon={<ArrowSquareOut size={18} />}>
                  Preview unavailable
                </Button>
              )}
              {embedCodeSnippet ? (
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<CopySimple size={16} weight="bold" />}
                  onClick={() => onCopy("Embed code", embedCodeSnippet)}
                >
                  {copiedField === "Embed code" ? "Copied" : "Copy embed"}
                </Button>
              ) : null}
            </div>
            <div className={styles.cardSplit}>
              <div>
                <div className={styles.encoderLabel}>Playback embed</div>
                <div className={styles.encoderValue} style={{ wordBreak: "break-all" }}>
                  {embedCodeSnippet ?? "<mux-player stream-type=\"live\"></mux-player>"}
                </div>
              </div>
              <div>
                <div className={styles.encoderLabel}>Mobile ingest QR</div>
                <div className={styles.encoderQr}>
                  {qrGenerating ? (
                    <div className={styles.encoderQrPlaceholder}>Generating QR code...</div>
                  ) : qrError ? (
                    <div className={styles.encoderQrError}>{qrError}</div>
                  ) : qrImageDataUrl ? (
                    <Image
                      src={qrImageDataUrl}
                      alt="OBS mobile ingest QR code"
                      width={200}
                      height={200}
                    />
                  ) : (
                    <div className={styles.encoderQrPlaceholder}>
                      Start streaming to generate a mobile ingest QR.
                    </div>
                  )}
                </div>
                <div className={styles.inlineActions} style={{ marginTop: 12 }}>
                  <Button
                    variant="ghost"
                    size="xs"
                    leftIcon={<QrCode size={16} weight="duotone" />}
                    onClick={() => onCopy("Mobile ingest payload", mobileIngestPayload)}
                    disabled={!mobileIngestPayload}
                  >
                    {copiedField === "Mobile ingest payload" ? "Copied" : "Copy payload"}
                  </Button>
                </div>
              </div>
            </div>
          </section>
          <section className={styles.encoderSection}>
            <div className={styles.cardSectionHeader}>
              <h3 className={styles.cardSectionTitle}>Simulcast manager</h3>
              <div className={styles.inlineActions}>
                <Badge variant="soft" tone={hasDestinations ? "brand" : "neutral"} size="sm">
                  {hasDestinations
                    ? `${activeDestinationCount} enabled`
                    : "No destinations yet"}
                </Badge>
                <Button
                  variant="outline"
                  size="xs"
                  leftIcon={<Plus size={14} weight="bold" />}
                  onClick={onStartAddDestination}
                >
                  Add destination
                </Button>
              </div>
            </div>
            {errorDestinations.length ? (
              <div className={styles.encoderDestinationAlert}>
                <WarningCircle size={18} weight="bold" />
                <span>
                  {errorDestinations.length} destination
                  {errorDestinations.length === 1 ? "" : "s"} require attention before going live.
                </span>
              </div>
            ) : null}
            {streamPreferences.simulcastDestinations.length ? (
              <ul className={styles.encoderDestinationList}>
                {streamPreferences.simulcastDestinations.map((destination) => {
                  const providerLabel = resolveProviderLabel(destination.provider);
                  return (
                    <li key={destination.id} className={styles.encoderDestinationItem}>
                      <header className={styles.encoderDestinationHeader}>
                        <div className={styles.encoderDestinationHeading}>
                          <span className={providerIconClass(destination.provider)}>
                            {providerIcon(destination.provider)}
                          </span>
                          <div>
                            <div className={styles.encoderDestinationLabel}>{destination.label}</div>
                            <div className={styles.encoderDestinationProvider}>{providerLabel}</div>
                          </div>
                        </div>
                        <span className={destinationStatusClass(destination.status, destination.enabled)}>
                          <ListChecks size={14} weight="bold" />
                          {destinationStatusLabel(destination.status)}
                        </span>
                      </header>
                      <div className={styles.encoderDestinationMeta}>
                        <span className={styles.encoderDestinationUrl}>{destination.url}</span>
                        {destination.lastSyncedAt ? (
                          <span>Last updated {formatTimestamp(destination.lastSyncedAt)}</span>
                        ) : (
                          <span>Never synced</span>
                        )}
                      </div>
                      <div className={styles.encoderDestinationActions}>
                        <Button
                          variant="ghost"
                          size="xs"
                          leftIcon={
                            destination.enabled ? (
                              <Prohibit size={14} weight="bold" />
                            ) : (
                              <ShieldCheck size={14} weight="bold" />
                            )
                          }
                          onClick={() => onToggleDestination(destination.id)}
                          disabled={!destination.streamKey && destination.provider === "custom"}
                        >
                          {destination.enabled ? "Disable" : "Enable"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          leftIcon={<Trash size={14} weight="bold" />}
                          onClick={() => onRemoveDestination(destination.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className={styles.encoderEmptyState}>
                Route your broadcast to Twitch, YouTube, Kick or any custom RTMP target.
              </div>
            )}
            {addingDestination ? (
              <form className={styles.encoderForm} onSubmit={onAddSimulcastDestination}>
                <div className={styles.encoderFormRow}>
                  <label className={styles.encoderFormGroup}>
                    <span className={styles.encoderLabel}>Provider</span>
                    <select
                      className={styles.encoderSelect}
                      value={simulcastDraft.provider}
                      onChange={(event) =>
                        onSimulcastDraftChange("provider", event.target.value)
                      }
                    >
                      {simulcastOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.encoderFormGroup}>
                    <span className={styles.encoderLabel}>Label</span>
                    <Input
                      placeholder="Community streaming"
                      value={simulcastDraft.label}
                      onChange={(event) => onSimulcastDraftChange("label", event.target.value)}
                    />
                  </label>
                </div>
                <label className={styles.encoderFormGroup}>
                  <span className={styles.encoderLabel}>Ingest URL</span>
                  <Input
                    placeholder="rtmps://..."
                    required
                    value={simulcastDraft.url}
                    onChange={(event) => onSimulcastDraftChange("url", event.target.value)}
                  />
                </label>
                <label className={styles.encoderFormGroup}>
                  <span className={styles.encoderLabel}>Stream key</span>
                  <Input
                    placeholder="optional"
                    value={simulcastDraft.streamKey}
                    onChange={(event) => onSimulcastDraftChange("streamKey", event.target.value)}
                  />
                </label>
                {destinationError ? (
                  <div className={styles.encoderFormError}>{destinationError}</div>
                ) : null}
                <div className={styles.encoderFormActions}>
                  <Button variant="gradient" size="sm" type="submit">
                    Save destination
                  </Button>
                  <Button variant="ghost" size="sm" type="button" onClick={onCancelAddDestination}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : null}
          </section>
        </div>
        <div className={styles.encoderSecondaryColumn}>
          <section className={styles.encoderSection}>
            <div className={styles.cardSectionHeader}>
              <h3 className={styles.cardSectionTitle}>Webhook delivery</h3>
              <div className={styles.inlineActions}>
                <Badge variant="soft" tone={hasWebhooks ? "brand" : "neutral"} size="sm">
                  {hasWebhooks ? `${streamPreferences.webhookEndpoints.length} configured` : "Optional"}
                </Badge>
                <Button
                  variant="outline"
                  size="xs"
                  leftIcon={<Plus size={14} weight="bold" />}
                  onClick={onStartAddWebhook}
                >
                  Add webhook
                </Button>
              </div>
            </div>
            {streamPreferences.webhookEndpoints.length ? (
              <ul className={styles.encoderWebhookList}>
                {streamPreferences.webhookEndpoints.map((endpoint) => {
                  const testStatus = webhookTestStatus?.[endpoint.id] ?? "idle";
                  return (
                    <li key={endpoint.id} className={styles.encoderWebhookItem}>
                      <header className={styles.encoderWebhookHeader}>
                        <div className={styles.encoderWebhookHeading}>
                          <div className={styles.encoderWebhookLabel}>{endpoint.label}</div>
                          <div className={styles.encoderWebhookUrl}>{endpoint.url}</div>
                        </div>
                        <span className={webhookStatusClass(endpoint.enabled)}>
                          {endpoint.enabled ? "Enabled" : "Disabled"}
                        </span>
                      </header>
                      <div className={styles.encoderWebhookMeta}>
                        {endpoint.events.length ? (
                          endpoint.events.map((event) => <span key={event}>{event}</span>)
                        ) : (
                          <span>No events selected</span>
                        )}
                        {endpoint.lastDeliveredAt ? (
                          <span>Last delivered {formatTimestamp(endpoint.lastDeliveredAt)}</span>
                        ) : (
                          <span>Never delivered</span>
                        )}
                      </div>
                      <div className={styles.encoderWebhookActions}>
                        <Button
                          variant="ghost"
                          size="xs"
                          leftIcon={<PaperPlaneTilt size={14} weight="bold" />}
                          onClick={() => onSendWebhookTest?.(endpoint.id)}
                          disabled={!onSendWebhookTest || testStatus === "pending"}
                        >
                          {testStatus === "pending" ? "Sending..." : "Send test"}
                        </Button>
                        {testStatus === "success" ? (
                          <span className={styles.encoderWebhookTestSuccess}>Delivered</span>
                        ) : null}
                        {testStatus === "error" ? (
                          <span className={styles.encoderWebhookTestError}>Failed</span>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="xs"
                          leftIcon={
                            endpoint.enabled ? (
                              <Prohibit size={14} weight="bold" />
                            ) : (
                              <ShieldCheck size={14} weight="bold" />
                            )
                          }
                          onClick={() => onToggleWebhook(endpoint.id)}
                        >
                          {endpoint.enabled ? "Disable" : "Enable"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          leftIcon={<Trash size={14} weight="bold" />}
                          onClick={() => onRemoveWebhook(endpoint.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className={styles.encoderEmptyState}>
                Receive streaming lifecycle updates to trigger automations or Slack alerts.
              </div>
            )}
            {addingWebhook ? (
              <form className={styles.encoderForm} onSubmit={onAddWebhookEndpoint}>
                <label className={styles.encoderFormGroup}>
                  <span className={styles.encoderLabel}>Label</span>
                  <Input
                    placeholder="Production webhook"
                    value={webhookDraft.label}
                    onChange={(event) => onWebhookFieldChange("label", event.target.value)}
                  />
                </label>
                <label className={styles.encoderFormGroup}>
                  <span className={styles.encoderLabel}>Delivery URL</span>
                  <Input
                    placeholder="https://example.com/webhooks/mux"
                    required
                    type="url"
                    value={webhookDraft.url}
                    onChange={(event) => onWebhookFieldChange("url", event.target.value)}
                  />
                </label>
                <label className={styles.encoderFormGroup}>
                  <span className={styles.encoderLabel}>Signing secret</span>
                  <Input
                    placeholder="Optional secret"
                    value={webhookDraft.secret}
                    onChange={(event) => onWebhookFieldChange("secret", event.target.value)}
                  />
                </label>
                <div className={styles.encoderWebhookEvents}>
                  <span className={styles.encoderLabel}>Events</span>
                  <div className={styles.encoderEventGrid}>
                    {webhookOptions.map((option) => {
                      const checked = webhookDraft.events.includes(option.value);
                      return (
                        <label key={option.value} className={styles.encoderEventOption}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onWebhookEventToggle(option.value)}
                          />
                          {option.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
                {webhookError ? (
                  <div className={styles.encoderFormError}>{webhookError}</div>
                ) : null}
                <div className={styles.encoderFormActions}>
                  <Button variant="gradient" size="sm" type="submit">
                    Save webhook
                  </Button>
                  <Button variant="ghost" size="sm" type="button" onClick={onCancelAddWebhook}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : null}
          </section>
          <section className={styles.encoderSection}>
            <div className={styles.cardSectionHeader}>
              <h3 className={styles.cardSectionTitle}>Stream preferences</h3>
              <Badge variant="soft" tone="neutral" size="sm">
                Auto-saves instantly
              </Badge>
            </div>
            <div className={styles.prefsGrid}>
              <label className={styles.switchRow}>
                <div>
                  <div className={styles.encoderLabel}>Disconnect protection</div>
                  <div className={styles.encoderHint}>
                    Keep the live stream online for two minutes if the encoder disconnects.
                  </div>
                </div>
                <input
                  className={styles.switch}
                  type="checkbox"
                  checked={streamPreferences.disconnectProtection}
                  onChange={(event) =>
                    onUpdatePreferences({ disconnectProtection: event.target.checked })
                  }
                />
              </label>
              <label className={styles.switchRow}>
                <div>
                  <div className={styles.encoderLabel}>Audio warnings</div>
                  <div className={styles.encoderHint}>
                    Surface alerts when Mux flags clipping, silence or low levels.
                  </div>
                </div>
                <input
                  className={styles.switch}
                  type="checkbox"
                  checked={streamPreferences.audioWarnings}
                  onChange={(event) => onUpdatePreferences({ audioWarnings: event.target.checked })}
                />
              </label>
              <label className={styles.switchRow}>
                <div>
                  <div className={styles.encoderLabel}>Store past broadcasts</div>
                  <div className={styles.encoderHint}>
                    Automatically archive completed sessions as Mux assets.
                  </div>
                </div>
                <input
                  className={styles.switch}
                  type="checkbox"
                  checked={streamPreferences.storePastBroadcasts}
                  onChange={(event) =>
                    onUpdatePreferences({ storePastBroadcasts: event.target.checked })
                  }
                />
              </label>
              <label className={styles.switchRow}>
                <div>
                  <div className={styles.encoderLabel}>Always publish VODs</div>
                  <div className={styles.encoderHint}>
                    Automatically publish recordings to the Capsule content library.
                  </div>
                </div>
                <input
                  className={styles.switch}
                  type="checkbox"
                  checked={streamPreferences.alwaysPublishVods}
                  onChange={(event) =>
                    onUpdatePreferences({ alwaysPublishVods: event.target.checked })
                  }
                />
              </label>
              <label className={styles.switchRow}>
                <div>
                  <div className={styles.encoderLabel}>Auto-generate clips</div>
                  <div className={styles.encoderHint}>
                    Let Live Studio cut highlights using the Clips automation pipeline.
                  </div>
                </div>
                <input
                  className={styles.switch}
                  type="checkbox"
                  checked={streamPreferences.autoClips}
                  onChange={(event) => onUpdatePreferences({ autoClips: event.target.checked })}
                />
              </label>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
