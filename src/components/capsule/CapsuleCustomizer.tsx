"use client";

import * as React from "react";
import {
  X,
  ArrowsClockwise,
  TrashSimple,
  Brain,
  List,
  SidebarSimple,
  MagnifyingGlass,
  ChatsTeardrop,
  FileText,
  FolderSimple,
  Check,
} from "@phosphor-icons/react/dist/ssr";
import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
  type ImperativePanelHandle,
  type ImperativePanelGroupHandle,
} from "react-resizable-panels";

import styles from "./CapsuleCustomizer.module.css";
import { AiPrompterStage } from "@/components/ai-prompter-stage";
import { Button } from "@/components/ui/button";
import {
  useCapsuleCustomizerState,
  type CapsuleCustomizerMode,
  type CapsuleCustomizerSaveResult,
  type ChatMessage,
  type ChatBannerOption,
  type CapsuleVariant,
} from "./hooks/useCapsuleCustomizerState";
import {
  CapsuleCustomizerProvider,
  useCapsuleCustomizerActions,
  useCapsuleCustomizerChat,
  useCapsuleCustomizerMemory,
  useCapsuleCustomizerMeta,
  useCapsuleCustomizerPreview,
  useCapsuleCustomizerSave,
  useCapsuleCustomizerVariants,
  useCapsuleCustomizerPersonas,
  useCapsuleCustomizerAdvancedOptions,
} from "./hooks/capsuleCustomizerContext";
import { CapsuleBannerPreview } from "./CapsuleBannerPreview";
import { CapsuleAssetActions } from "./CapsuleAssetActions";
import { CapsuleMemoryPicker } from "./CapsuleMemoryPicker";
import {
  COMPOSER_IMAGE_QUALITY_OPTIONS,
  titleCaseComposerQuality,
} from "@/lib/composer/image-settings";
import { useCreditUsage } from "@/lib/billing/useCreditUsage";
import menuStyles from "@/components/ui/context-menu.module.css";

type CapsuleCustomizerProps = {
  open?: boolean;
  capsuleId?: string | null;
  capsuleName?: string | null;
  onClose: () => void;
  onSaved?: (result: CapsuleCustomizerSaveResult) => void;
  mode?: CapsuleCustomizerMode;
};

type LeftRailTab = "recent" | "drafts" | "projects" | "memory";

const LEFT_TAB_BUTTON_IDS: Record<LeftRailTab, string> = {
  recent: "capsule-customizer-tab-recent",
  drafts: "capsule-customizer-tab-drafts",
  projects: "capsule-customizer-tab-projects",
  memory: "capsule-customizer-tab-memory",
};

const LEFT_TAB_PANEL_IDS: Record<LeftRailTab, string> = {
  recent: "capsule-customizer-panel-recent",
  drafts: "capsule-customizer-panel-drafts",
  projects: "capsule-customizer-panel-projects",
  memory: "capsule-customizer-panel-memory",
};

function joinClassNames(...tokens: Array<string | undefined | null>): string {
  return tokens.filter((token): token is string => Boolean(token)).join(" ");
}

const SEARCH_EVENT_NAME = "capsules:search:open";

function ChatMessageBubble({
  message,
  onBannerSelect,
  onSuggestionSelect,
}: {
  message: ChatMessage;
  onBannerSelect: (option: ChatBannerOption) => void;
  onSuggestionSelect?: (suggestion: string) => void;
}) {
  const isUser = message.role === "user";
  return (
    <div className={styles.chatMessage} data-role={isUser ? "user" : "ai"}>
      <div
        className={joinClassNames(
          styles.chatBubble,
          isUser ? styles.chatBubbleUser : styles.chatBubbleAi,
        )}
      >
        <div className={styles.chatMessageText}>{message.content}</div>
        {message.bannerOptions && message.bannerOptions.length ? (
          <div className={styles.chatBannerGallery} role="list">
            {message.bannerOptions.map((option, index) => (
              <button
                key={option.id}
                type="button"
                className={styles.chatBannerOption}
                onClick={() => onBannerSelect(option)}
                role="listitem"
                aria-label={`Add banner option ${index + 1} to selection`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={option.previewUrl}
                  alt={`Banner concept ${index + 1}`}
                  className={styles.chatBannerImage}
                  loading="lazy"
                />
                <span className={styles.chatBannerOptionOverlay}>Add to banner</span>
              </button>
            ))}
          </div>
        ) : null}
        {message.suggestions && message.suggestions.length ? (
          <div className={styles.chatSuggestions} role="list">
            {message.suggestions.map((suggestion, index) => (
              <button
                key={`${message.id}-${index}`}
                type="button"
                className={styles.chatSuggestionChip}
                role="listitem"
                onClick={() => onSuggestionSelect?.(suggestion)}
                aria-label={`Use suggestion ${index + 1}`}
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}


function CapsuleCustomizer(props: CapsuleCustomizerProps) {
  const [imageQuality, setImageQuality] = React.useState<
    (typeof COMPOSER_IMAGE_QUALITY_OPTIONS)[number]
  >("standard");

  const { open, ...contextValue } = useCapsuleCustomizerState({
    ...props,
    imageQuality,
  });

  if (!open) return null;

  return (
    <CapsuleCustomizerProvider value={contextValue}>
      <CapsuleCustomizerContent
        imageQuality={imageQuality}
        onImageQualityChange={setImageQuality}
      />
    </CapsuleCustomizerProvider>
  );
}

function CapsuleCustomizerContent({
  imageQuality,
  onImageQualityChange,
}: {
  imageQuality: (typeof COMPOSER_IMAGE_QUALITY_OPTIONS)[number];
  onImageQualityChange: (value: (typeof COMPOSER_IMAGE_QUALITY_OPTIONS)[number]) => void;
}) {
  const meta = useCapsuleCustomizerMeta();
  const chat = useCapsuleCustomizerChat();
  const memory = useCapsuleCustomizerMemory();
  const preview = useCapsuleCustomizerPreview();
  const save = useCapsuleCustomizerSave();
  const actions = useCapsuleCustomizerActions();
  const panelLayoutId = React.useMemo(() => "capsule-customizer-panels-v3", []);
  const resizableColumnsClass = styles.resizableColumns ?? "";
  const navigationPanelClass = joinClassNames(styles.columnPanel, styles.navigationPanel);
  const chatPanelClass = joinClassNames(styles.columnPanel, styles.chatPanel);
  const previewPanelClass = joinClassNames(styles.columnPanel, styles.previewPanelWrap);
  const resizeHandleClass = styles.resizeHandle ?? "";
  const variants = useCapsuleCustomizerVariants();
  const personas = useCapsuleCustomizerPersonas();
  const advanced = useCapsuleCustomizerAdvancedOptions();
  const NAV_DEFAULT_SIZE = 20;
  const NAV_MIN_SIZE = 16;
  const NAV_COLLAPSED_SIZE = 9;
  const navPanelRef = React.useRef<ImperativePanelHandle | null>(null);
  const lastNavExpandedSize = React.useRef(NAV_DEFAULT_SIZE);
  const panelGroupRef = React.useRef<ImperativePanelGroupHandle | null>(null);
  const lastLayoutBeforeCollapse = React.useRef<number[] | null>(null);
  const [navCollapsed, setNavCollapsed] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [mobilePreviewOpen, setMobilePreviewOpen] = React.useState(false);
  const mobileNavCloseRef = React.useRef<HTMLButtonElement | null>(null);
  const mobilePreviewCloseRef = React.useRef<HTMLButtonElement | null>(null);
  const smartContextEnabled = chat.smartContextEnabled;
  const toggleSmartContext = chat.onToggleSmartContext;
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const settingsRef = React.useRef<HTMLDivElement | null>(null);
  const { percentRemaining, loading: creditsLoading, error: creditsError, bypass } = useCreditUsage();

  const handleSearchClick = React.useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(SEARCH_EVENT_NAME));
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 960px)");
    const update = () => setIsMobile(mediaQuery.matches);
    update();
    const listener = () => update();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", listener);
      return () => {
        mediaQuery.removeEventListener("change", listener);
      };
    }
    mediaQuery.addListener(listener);
    return () => {
      mediaQuery.removeListener(listener);
    };
  }, []);

  React.useEffect(() => {
    if (isMobile) return;
    setMobileNavOpen(false);
    setMobilePreviewOpen(false);
  }, [isMobile]);

  React.useEffect(() => {
    if (!mobileNavOpen && !mobilePreviewOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
        setMobilePreviewOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileNavOpen, mobilePreviewOpen]);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    if (!mobileNavOpen && !mobilePreviewOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileNavOpen, mobilePreviewOpen]);

  const handleToggleSettings = React.useCallback(() => {
    setSettingsOpen((open) => !open);
  }, []);

  const handleSelectQuality = React.useCallback(
    (quality: (typeof COMPOSER_IMAGE_QUALITY_OPTIONS)[number]) => {
      if (quality === imageQuality) return;
      onImageQualityChange(quality);
      setSettingsOpen(false);
    },
    [imageQuality, onImageQualityChange],
  );

  const creditLabel = React.useMemo(() => {
    if (creditsLoading) return "Loading credits.";
    if (creditsError) return "Usage unavailable";
    if (typeof percentRemaining !== "number" || Number.isNaN(percentRemaining)) {
      return "Usage unavailable";
    }
    const clamped = Math.max(0, Math.min(100, Math.round(percentRemaining)));
    if (bypass) return "Dev credits enabled";
    return `${clamped}% left this period`;
  }, [bypass, creditsError, creditsLoading, percentRemaining]);

  const creditPercent = React.useMemo(() => {
    if (bypass) return 100;
    if (typeof percentRemaining !== "number" || Number.isNaN(percentRemaining)) return 0;
    return Math.max(0, Math.min(100, Math.round(percentRemaining)));
  }, [bypass, percentRemaining]);

  React.useEffect(() => {
    if (!mobileNavOpen) return;
    const timer = window.setTimeout(() => {
      mobileNavCloseRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [mobileNavOpen]);

  React.useEffect(() => {
    if (!mobilePreviewOpen) return;
    const timer = window.setTimeout(() => {
      mobilePreviewCloseRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [mobilePreviewOpen]);

  const closeMobilePanels = React.useCallback(() => {
    setMobileNavOpen(false);
    setMobilePreviewOpen(false);
  }, []);

  React.useEffect(() => {
    if (!settingsOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (settingsRef.current && target && !settingsRef.current.contains(target)) {
        setSettingsOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [settingsOpen]);

  const handleToggleMobileNav = React.useCallback(() => {
    setMobileNavOpen((open) => {
      const next = !open;
      if (next) {
        setMobilePreviewOpen(false);
      }
      return next;
    });
  }, []);

  const handleToggleMobilePreview = React.useCallback(() => {
    setMobilePreviewOpen((open) => {
      const next = !open;
      if (next) {
        setMobileNavOpen(false);
      }
      return next;
    });
  }, []);

  React.useEffect(() => {
    const layout = panelGroupRef.current?.getLayout();
    const navSize = layout?.[0];
    if (navSize === undefined) return;
    if (navSize <= NAV_COLLAPSED_SIZE + 0.5) {
      setNavCollapsed(true);
      lastNavExpandedSize.current = lastLayoutBeforeCollapse.current?.[0] ?? NAV_DEFAULT_SIZE;
    }
  }, []);

  const handleNavResize = React.useCallback(
    (size: number) => {
      if (navCollapsed) return;
      lastNavExpandedSize.current = size;
    },
    [navCollapsed],
  );

  const handleToggleNavCollapsed = React.useCallback(() => {
    const group = panelGroupRef.current;
    if (!group) {
      setNavCollapsed((value) => !value);
      return;
    }

    if (navCollapsed) {
      const restore = lastLayoutBeforeCollapse.current;
      if (restore && restore.length === 3) {
        group.setLayout(restore);
        lastNavExpandedSize.current = restore[0] ?? NAV_DEFAULT_SIZE;
      } else {
        const fallbackChat = 42;
        const fallbackPreview = 32;
        group.setLayout([NAV_DEFAULT_SIZE, fallbackChat, fallbackPreview]);
        lastNavExpandedSize.current = NAV_DEFAULT_SIZE;
      }
      setNavCollapsed(false);
      return;
    }

    const currentLayout = group.getLayout();
    lastLayoutBeforeCollapse.current = currentLayout;
    const remaining = Math.max(100 - NAV_COLLAPSED_SIZE, 0);
    const chatSize = currentLayout[1] ?? 0;
    const previewSize = currentLayout[2] ?? 0;
    const restTotal = chatSize + previewSize || 1;
    const nextChat = (chatSize / restTotal) * remaining;
    const nextPreview = (previewSize / restTotal) * remaining;

    group.setLayout([NAV_COLLAPSED_SIZE, nextChat, nextPreview]);
    setNavCollapsed(true);
  }, [NAV_COLLAPSED_SIZE, NAV_DEFAULT_SIZE, navCollapsed]);

  const [personaName, setPersonaName] = React.useState("");
  const [personaPalette, setPersonaPalette] = React.useState("");
  const [personaMedium, setPersonaMedium] = React.useState("");
  const [personaCamera, setPersonaCamera] = React.useState("");
  const [personaNotes, setPersonaNotes] = React.useState("");
  const [personaSubmitting, setPersonaSubmitting] = React.useState(false);
  const variantsSupported =
    meta.mode === "banner" ||
    meta.mode === "storeBanner" ||
    meta.mode === "logo" ||
    meta.mode === "avatar";

  const [activeRailTab, setActiveRailTab] = React.useState<LeftRailTab>("recent");

  const railTabs = React.useMemo(
    () => [
      {
        key: "recent" as LeftRailTab,
        label: "Recent chats",
        renderIcon: (selected: boolean) => (
          <ChatsTeardrop size={18} weight={selected ? "fill" : "duotone"} />
        ),
      },
      {
        key: "drafts" as LeftRailTab,
        label: "Saved drafts",
        renderIcon: (selected: boolean) => (
          <FileText size={18} weight={selected ? "fill" : "duotone"} />
        ),
      },
      {
        key: "projects" as LeftRailTab,
        label: "Projects",
        renderIcon: (selected: boolean) => (
          <FolderSimple size={18} weight={selected ? "fill" : "duotone"} />
        ),
      },
      {
        key: "memory" as LeftRailTab,
        label: "Memory",
        renderIcon: (selected: boolean) => <Brain size={18} weight={selected ? "fill" : "duotone"} />,
      },
    ],
    [],
  );

  const variantDescription =
    meta.mode === "avatar"
      ? "Swap between avatar takes or branch from an earlier edit."
      : meta.mode === "logo"
        ? "Compare logo explorations and revert to any saved version."
        : "Branch, compare, or roll back to earlier AI versions.";

  const truncate = React.useCallback((value: string, max = 72) => {
    return value.length <= max ? value : `${value.slice(0, max - 1)}...`;
  }, []);

  const humanize = React.useCallback((value: string) => {
    return value
      .split(/[\s_-]+/g)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }, []);

  const personaFormDisabled = personaSubmitting || personas.loading;

  const handlePersonaSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!personaName.trim()) {
        return;
      }
      setPersonaSubmitting(true);
      try {
        await personas.create({
          name: personaName,
          palette: personaPalette,
          medium: personaMedium,
          camera: personaCamera,
          notes: personaNotes,
        });
        setPersonaName("");
        setPersonaPalette("");
        setPersonaMedium("");
        setPersonaCamera("");
        setPersonaNotes("");
      } catch {
        // errors surface via personas.error
      } finally {
        setPersonaSubmitting(false);
      }
    },
    [personaCamera, personaMedium, personaName, personaNotes, personaPalette, personas],
  );

  const handlePersonaRemove = React.useCallback(
    async (personaId: string) => {
      try {
        await personas.remove(personaId);
      } catch {
        // ignore; personas.error handles feedback
      }
    },
    [personas],
  );

  const clearPersonaSelection = React.useCallback(() => {
    personas.select(null);
  }, [personas]);

  const saveLabel =
    meta.mode === "tile"
      ? "Save tile"
      : meta.mode === "logo"
        ? "Save logo"
        : meta.mode === "avatar"
          ? "Save avatar"
          : meta.mode === "storeBanner"
            ? "Save store banner"
            : "Save banner";

  const NavigationSection = () => (
    <section className={styles.recentColumn} aria-label="Customizer navigation">
      <div className={styles.railTabs} role="tablist" aria-label="Customizer sections">
        {railTabs.map((tab) => {
          const selected = tab.key === activeRailTab;
          const buttonId = LEFT_TAB_BUTTON_IDS[tab.key];
          const panelId = LEFT_TAB_PANEL_IDS[tab.key];
          return (
            <button
              key={tab.key}
              id={buttonId}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              className={`${styles.railTab}${selected ? ` ${styles.railTabActive}` : ""}`}
              data-selected={selected ? "true" : undefined}
              onClick={() => setActiveRailTab(tab.key)}
              title={tab.label}
            >
              {tab.renderIcon(selected)}
              <span className={styles.srOnly}>{tab.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          className={`${styles.railTab} ${styles.railCollapseBtn}`}
          aria-pressed={navCollapsed}
          aria-label={navCollapsed ? "Expand sections panel" : "Collapse sections panel"}
          onClick={handleToggleNavCollapsed}
        >
          <SidebarSimple size={16} weight={navCollapsed ? "fill" : "duotone"} />
        </button>
      </div>
      <div
        className={styles.railScroll}
        role="tabpanel"
        id={LEFT_TAB_PANEL_IDS[activeRailTab]}
        aria-labelledby={LEFT_TAB_BUTTON_IDS[activeRailTab]}
        tabIndex={0}
      >
        {activeRailTab === "recent" ? (
          <div className={styles.railSection} aria-labelledby="customizer-recent-heading">
            <div className={styles.recentHeader}>
              <h3 id="customizer-recent-heading">Recent chats</h3>
            </div>
            <div className={styles.recentDescription}>
              Pull a message from this session back into the prompt.
            </div>
            <div className={styles.recentList} role="list">
              {chat.messages.length ? (
                [...chat.messages].slice(-8).reverse().map((message) => {
                  const label = message.role === "user" ? "You" : "Capsule AI";
                  const snippet = truncate(message.content, 120);
                  return (
                    <button
                      key={message.id}
                      type="button"
                      role="listitem"
                      className={styles.recentItem}
                      onClick={() => chat.onSuggestionSelect(message.content)}
                      aria-label={`Reuse ${label.toLowerCase()} message "${snippet}"`}
                    >
                      <div className={styles.recentMeta}>
                        <span className={styles.recentTitle}>{label}</span>
                        <span className={styles.recentSnippet}>{snippet}</span>
                      </div>
                    </button>
                  );
                })
              ) : (
                <p className={styles.recentHint}>
                  Start chatting with Capsule AI to see history here.
                </p>
              )}
            </div>
          </div>
        ) : null}
        {activeRailTab === "drafts" ? (
          variantsSupported ? (
            <div className={styles.railSection} aria-labelledby="customizer-drafts-heading">
              <div className={styles.recentHeader}>
                <h3 id="customizer-drafts-heading">Saved drafts</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void variants.refresh();
                  }}
                  disabled={variants.loading}
                >
                  Refresh
                </Button>
              </div>
              <div className={styles.recentDescription}>{variantDescription}</div>
              <div className={styles.recentList} role="list">
                {variants.loading ? (
                  <p className={styles.recentHint}>Loading your saved drafts...</p>
                ) : variants.error ? (
                  <p className={styles.recentHint}>{variants.error}</p>
                ) : variants.items.length ? (
                  variants.items.map((variant: CapsuleVariant) => {
                    const metadata = (variant.metadata ?? {}) as Record<string, unknown>;
                    const mode =
                      typeof metadata.mode === "string" && metadata.mode.trim().length
                        ? metadata.mode.trim().toLowerCase()
                        : "generate";
                    const stylePreset =
                      typeof metadata.stylePreset === "string" && metadata.stylePreset.trim().length
                        ? humanize(metadata.stylePreset.trim())
                        : null;
                    const providerRaw =
                      typeof metadata.provider === "string" && metadata.provider.trim().length
                        ? metadata.provider.trim().toLowerCase()
                        : null;
                    const provider =
                      providerRaw === "openai"
                        ? "OpenAI"
                        : providerRaw === "stability"
                          ? "Stability"
                          : providerRaw
                            ? humanize(providerRaw)
                            : null;
                    const resolvedPrompt =
                      typeof metadata.resolvedPrompt === "string" && metadata.resolvedPrompt.trim().length
                        ? metadata.resolvedPrompt.trim()
                        : null;
                    const userPrompt =
                      typeof metadata.userPrompt === "string" && metadata.userPrompt.trim().length
                        ? metadata.userPrompt.trim()
                        : null;
                    const snippetSource = resolvedPrompt || userPrompt || "";
                    const snippet = snippetSource.length ? `"${truncate(snippetSource, 68)}"` : null;
                    const detailParts = [
                      mode === "edit" ? "Edit" : "Generate",
                      stylePreset,
                      provider,
                    ].filter(Boolean) as string[];
                    const detail = detailParts.join(" | ");
                    const thumbUrl = variant.thumbUrl ?? variant.imageUrl;
                    const selected =
                      preview.selected?.kind === "memory" && preview.selected.id === variant.id;
                    return (
                      <button
                        key={variant.id}
                        type="button"
                        role="listitem"
                        className={styles.recentItem}
                        data-selected={selected ? "true" : undefined}
                        onClick={() => variants.select(variant)}
                        aria-label={`Switch to draft ${variant.version}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={thumbUrl}
                          alt={`Draft ${variant.version}`}
                          className={styles.recentImage}
                          loading="lazy"
                        />
                        <div className={styles.recentMeta}>
                          <span className={styles.recentTitle}>Draft v{variant.version}</span>
                          {snippet ? <span className={styles.recentSnippet}>{snippet}</span> : null}
                          {detail ? <span className={styles.recentSubtle}>{detail}</span> : null}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <p className={styles.recentHint}>
                    Drafts appear here after you generate or edit with Capsule AI.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className={styles.railSection} aria-labelledby="customizer-drafts-heading">
              <h3 id="customizer-drafts-heading">Saved drafts</h3>
              <p className={styles.recentHint}>
                Switch to a banner, store banner, logo, or avatar to work with drafts.
              </p>
            </div>
          )
        ) : null}
        {activeRailTab === "projects" ? (
          <>
            <div className={styles.railSection} aria-labelledby="style-personas-heading">
              <div className={styles.recentHeader}>
                <h3 id="style-personas-heading">Style personas</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void personas.refresh();
                  }}
                  disabled={personas.loading}
                  leftIcon={<ArrowsClockwise size={16} weight="bold" />}
                >
                  Refresh
                </Button>
              </div>
              <div className={styles.recentDescription}>
                Save reusable palettes, mediums, and camera cues so prompts stay consistent.
              </div>
              <form className={styles.personaForm} onSubmit={handlePersonaSubmit}>
                <input
                  className={styles.personaInput}
                  type="text"
                  placeholder="Persona name"
                  value={personaName}
                  onChange={(event) => setPersonaName(event.target.value)}
                  required
                  disabled={personaFormDisabled}
                />
                <textarea
                  className={styles.personaInput}
                  placeholder="Palette (colors, lighting, mood)"
                  value={personaPalette}
                  onChange={(event) => setPersonaPalette(event.target.value)}
                  disabled={personaFormDisabled}
                />
                <textarea
                  className={styles.personaInput}
                  placeholder="Medium or materials"
                  value={personaMedium}
                  onChange={(event) => setPersonaMedium(event.target.value)}
                  disabled={personaFormDisabled}
                />
                <textarea
                  className={styles.personaInput}
                  placeholder="Camera or framing"
                  value={personaCamera}
                  onChange={(event) => setPersonaCamera(event.target.value)}
                  disabled={personaFormDisabled}
                />
                <textarea
                  className={styles.personaInput}
                  placeholder="Notes (optional)"
                  value={personaNotes}
                  onChange={(event) => setPersonaNotes(event.target.value)}
                  disabled={personaFormDisabled}
                />
                <div className={styles.personaFormActions}>
                  <Button
                    type="submit"
                    size="sm"
                    variant="secondary"
                    disabled={personaFormDisabled || !personaName.trim()}
                    loading={personaSubmitting}
                  >
                    Save persona
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={clearPersonaSelection}
                    disabled={!personas.selectedId}
                  >
                    Clear selection
                  </Button>
                </div>
              </form>
              {personas.error ? <p className={styles.personaError}>{personas.error}</p> : null}
              <div className={styles.personaList} role="list">
                {personas.loading && personas.items.length === 0 ? (
                  <p className={styles.recentHint}>Loading personas...</p>
                ) : personas.items.length ? (
                  personas.items.map((persona) => {
                    const selected = personas.selectedId === persona.id;
                    return (
                      <button
                        key={persona.id}
                        type="button"
                        className={styles.personaItem}
                        role="listitem"
                        data-selected={selected ? "true" : undefined}
                        onClick={() => personas.select(persona.id)}
                      >
                        <div className={styles.personaItemDetails}>
                          <span className={styles.personaName}>{persona.name}</span>
                          {persona.palette ? (
                            <span className={styles.personaTrait}>Palette: {persona.palette}</span>
                          ) : null}
                          {persona.medium ? (
                            <span className={styles.personaTrait}>Medium: {persona.medium}</span>
                          ) : null}
                          {persona.camera ? (
                            <span className={styles.personaTrait}>Camera: {persona.camera}</span>
                          ) : null}
                          {persona.notes ? (
                            <span className={styles.personaTrait}>Notes: {persona.notes}</span>
                          ) : null}
                        </div>
                        <span
                          role="button"
                          tabIndex={0}
                          className={styles.personaDeleteButton}
                          aria-label="Remove persona"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handlePersonaRemove(persona.id);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              event.stopPropagation();
                              void handlePersonaRemove(persona.id);
                            }
                          }}
                        >
                          <TrashSimple size={14} weight="bold" />
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className={styles.recentHint}>Save a persona to reuse your aesthetic cues.</p>
                )}
              </div>
            </div>
            <div className={styles.railSection} aria-labelledby="advanced-controls-heading">
              <div className={styles.recentHeader}>
                <h3 id="advanced-controls-heading">Advanced controls</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={advanced.clear}
                  disabled={advanced.seed === null && advanced.guidance === null}
                >
                  Reset
                </Button>
              </div>
              <div className={styles.recentDescription}>
                Set deterministic seeds or guidance strength for supported models.
              </div>
              <div className={styles.advancedForm}>
                <label className={styles.advancedField}>
                  <span className={styles.advancedLabel}>Seed</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    className={styles.advancedInput}
                    placeholder="Random"
                    value={advanced.seed ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      advanced.setSeed(value === "" ? null : Number(value));
                    }}
                  />
                </label>
                <label className={styles.advancedField}>
                  <span className={styles.advancedLabel}>Guidance</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={30}
                    step={0.5}
                    className={styles.advancedInput}
                    placeholder="Model default"
                    value={advanced.guidance ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      advanced.setGuidance(value === "" ? null : Number(value));
                    }}
                  />
                </label>
              </div>
              <p className={styles.advancedHint}>
                Seed and guidance apply when generating with Stability models.
              </p>
            </div>
          </>
        ) : null}
        {activeRailTab === "memory" ? (
          <div className={styles.railSection}>
            <div className={styles.recentHeader}>
              <h3 id="customizer-memory-heading">Memory</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={memory.openPicker}
                aria-haspopup="dialog"
                aria-expanded={memory.isPickerOpen}
                aria-controls="memory-picker-dialog"
              >
                View all memories
              </Button>
            </div>
            <div className={styles.recentDescription}>{meta.recentDescription}</div>
            <div className={styles.recentList} role="list">
              {!memory.user ? (
                <p className={styles.recentHint}>Sign in to see recent memories.</p>
              ) : memory.loading ? (
                <p className={styles.recentHint}>Loading your recent memories...</p>
              ) : memory.error ? (
                <p className={styles.recentHint}>{memory.error}</p>
              ) : memory.recentMemories.length ? (
                memory.recentMemories.map((memoryItem, index) => {
                  const alt =
                    memoryItem.title?.trim() ||
                    memoryItem.description?.trim() ||
                    "Capsule memory preview";
                  const selected =
                    preview.selected?.kind === "memory" && preview.selected.id === memoryItem.id;
                  const memoryKey = memoryItem.id ? `${memoryItem.id}-${index}` : `memory-${index}`;
                  return (
                    <button
                      key={memoryKey}
                      type="button"
                      role="listitem"
                      className={styles.recentItem}
                      data-selected={selected ? "true" : undefined}
                      onClick={() => memory.onSelectMemory(memoryItem)}
                      aria-label={`Use memory ${alt}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={memoryItem.displayUrl}
                        alt={alt}
                        className={styles.recentImage}
                        loading="lazy"
                      />
                      <div className={styles.recentMeta}>
                        <span className={styles.recentTitle}>{alt}</span>
                        <span className={styles.recentSubtle}>Memory</span>
                      </div>
                    </button>
                  );
                })
              ) : (
                <p className={styles.recentHint}>
                  Generate, upload, or pick a memory to see it surface here.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );

  const ChatSection = () => (
    <section className={styles.chatColumn}>
      <div ref={chat.logRef} className={styles.chatLog} aria-live="polite">
        {chat.messages.map((message) => (
          <ChatMessageBubble
            key={message.id}
            message={message}
            onBannerSelect={chat.onBannerSelect}
            onSuggestionSelect={chat.onSuggestionSelect}
          />
        ))}
        {chat.busy ? (
          <div className={styles.chatTyping} aria-live="polite">
            <span className={styles.chatTypingDot} />
            <span className={styles.chatTypingDot} />
            <span className={styles.chatTypingDot} />
            <span className={styles.chatTypingLabel}>Generating…</span>
          </div>
        ) : null}
      </div>

      <div className={styles.prompterDock}>
        <div className={styles.prompterWrap}>
          <AiPrompterStage
            key={chat.prompterSession}
            placeholder={meta.prompterPlaceholder}
            chips={meta.prompterChips}
            statusMessage={null}
            onAction={chat.onPrompterAction}
            variant="bannerCustomizer"
            showIntentMenu
            submitVariant="icon"
          />
        </div>
      </div>
    </section>
  );

  const PreviewSection = () => (
    <section className={styles.previewColumn}>
    <div className={styles.previewPanel}>
    <CapsuleBannerPreview />
    <CapsuleAssetActions />
    </div>
    </section>
  );

  return (
    <div className={styles.overlay} role="presentation" onClick={actions.overlayClick}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={meta.headerTitle}
      >
        <header className={styles.header}>
          {!isMobile ? (
            <div className={styles.aiToolbar} aria-label="AI controls">
              <div className={styles.aiToolbarHeading}>
                <div className={styles.aiToolbarBrandRow}>
                  <span className={styles.aiMemoryLogo} aria-label="Memory">
                    <Brain size={18} weight="duotone" />
                  </span>
                </div>
              </div>

              <div className={styles.aiHeaderSearch}>
                <button
                  type="button"
                  className={styles.aiSearchButton}
                  onClick={handleSearchClick}
                  aria-label="Open search"
                  title="Search memories, capsules, and more"
                >
                  <MagnifyingGlass size={18} weight="duotone" />
                  <span className={styles.aiSearchLabel}>Search</span>
                </button>
              </div>

              <button
                type="button"
                className={styles.aiCloseIcon}
                onClick={actions.handleClose}
                aria-label={`Close ${meta.assetLabel} customizer`}
              >
                <X size={18} weight="bold" />
              </button>
            </div>
          ) : null}

          <div className={styles.headerMainRow}>
          <div className={styles.headerActions}>
            {isMobile ? (
              <>
                <button
                  type="button"
                  className={styles.mobileHeaderButton}
                  onClick={handleToggleMobileNav}
                  aria-expanded={mobileNavOpen}
                  aria-controls="capsule-customizer-mobile-nav"
                  data-active={mobileNavOpen ? "true" : undefined}
                >
                  <List size={18} weight="bold" />
                  <span>Sections</span>
                </button>
                <button
                  type="button"
                  className={styles.mobileHeaderButton}
                  onClick={handleToggleMobilePreview}
                  aria-expanded={mobilePreviewOpen}
                  aria-controls="capsule-customizer-mobile-preview"
                  data-active={mobilePreviewOpen ? "true" : undefined}
                >
                  <SidebarSimple size={18} weight="bold" />
                  <span>Preview</span>
                </button>
              </>
            ) : null}
          </div>
          </div>
        </header>

        <div
          className={styles.content}
          aria-hidden={mobileNavOpen || mobilePreviewOpen ? "true" : undefined}
        >
          {isMobile ? (
            <div className={styles.mobileChatColumn}>
              <ChatSection />
            </div>
          ) : (
            <PanelGroup
              ref={panelGroupRef}
              autoSaveId={panelLayoutId}
              direction="horizontal"
              className={resizableColumnsClass}
            >
              <Panel
                ref={navPanelRef}
                defaultSize={NAV_DEFAULT_SIZE}
                minSize={NAV_MIN_SIZE}
                collapsible={false}
                onResize={handleNavResize}
                className={navigationPanelClass}
                data-collapsed={navCollapsed ? "true" : undefined}
              >
                <NavigationSection />
              </Panel>
              <PanelResizeHandle
                className={resizeHandleClass}
                aria-label="Resize customizer navigation column"
              />
              <Panel
                defaultSize={42}
                minSize={34}
                collapsible={false}
                className={chatPanelClass}
              >
                <ChatSection />
              </Panel>
              <PanelResizeHandle
                className={resizeHandleClass}
                aria-label="Resize customizer preview panel"
              />

              <Panel
                defaultSize={32}
                minSize={26}
                collapsible={false}
                className={previewPanelClass}
              >
                <PreviewSection />
              </Panel>
            </PanelGroup>
          )}
        </div>

        {isMobile && mobileNavOpen ? (
          <div
            id="capsule-customizer-mobile-nav"
            className={styles.mobileSheet}
            role="dialog"
            aria-modal="true"
            aria-labelledby="capsule-customizer-mobile-nav-title"
            onClick={closeMobilePanels}
          >
            <div className={styles.mobileSheetBackdrop} />
            <div
              className={styles.mobileSheetPanel}
              role="document"
              onClick={(event) => event.stopPropagation()}
            >
              <div className={styles.mobileSheetHeader}>
                <span className={styles.mobileSheetTitle} id="capsule-customizer-mobile-nav-title">
                  Sections
                </span>
                <button
                  type="button"
                  className={styles.mobileSheetClose}
                  onClick={closeMobilePanels}
                  ref={mobileNavCloseRef}
                  aria-label="Close sections panel"
                >
                  <X size={16} weight="bold" />
                </button>
              </div>
              <div className={styles.mobileSheetBody}>
                <NavigationSection />
              </div>
            </div>
          </div>
        ) : null}

        {isMobile && mobilePreviewOpen ? (
          <>
            <div
              className={styles.mobilePreviewBackdrop}
              onClick={closeMobilePanels}
              role="presentation"
            />
            <div
              id="capsule-customizer-mobile-preview"
              className={styles.mobilePreviewOverlay}
              role="dialog"
              aria-modal="true"
              aria-labelledby="capsule-customizer-mobile-preview-title"
              onClick={closeMobilePanels}
            >
              <div
                className={styles.mobilePreviewDialog}
                role="document"
                onClick={(event) => event.stopPropagation()}
              >
                <div className={styles.mobilePreviewHeader}>
                  <span
                    className={styles.mobileSheetTitle}
                    id="capsule-customizer-mobile-preview-title"
                  >
                    Preview
                  </span>
                  <button
                    type="button"
                    className={styles.mobilePreviewClose}
                    onClick={closeMobilePanels}
                    ref={mobilePreviewCloseRef}
                    aria-label="Close preview panel"
                  >
                    <X size={18} weight="bold" />
                  </button>
                </div>
                <div className={styles.mobilePreviewContent}>
                  <PreviewSection />
                </div>
              </div>
            </div>
          </>
        ) : null}

        <CapsuleMemoryPicker />

        <footer className={styles.footer}>
          <div className={styles.footerStatus} role="status">
            <div className={styles.footerSettings} ref={settingsRef}>
              <button
                type="button"
                className={styles.footerSettingsToggle}
                onClick={handleToggleSettings}
                aria-haspopup="menu"
                aria-expanded={settingsOpen}
              >
                <span className={styles.footerSettingsIcon} aria-hidden="true">
                  <Brain weight={smartContextEnabled ? "fill" : "duotone"} />
                </span>
                <span className={styles.footerSettingsLabel}>
                  AI settings
                  {smartContextEnabled ? " · Context on" : ""}
                </span>
              </button>
              {settingsOpen ? (
                <div
                  className={`${menuStyles.menu} ${styles.footerSettingsMenu}`.trim()}
                  role="menu"
                >
                  <div className={menuStyles.sectionLabel}>Context</div>
                  <button
                    type="button"
                    className={menuStyles.item}
                    role="menuitemcheckbox"
                    aria-checked={smartContextEnabled}
                    aria-label={smartContextEnabled ? "Turn off context" : "Turn on context"}
                    onClick={toggleSmartContext}
                    data-active={smartContextEnabled ? "true" : undefined}
                  >
                    <Brain weight={smartContextEnabled ? "fill" : "duotone"} />
                    <span>{smartContextEnabled ? "Context on" : "Context off"}</span>
                  </button>

                  <div className={menuStyles.separator} aria-hidden="true" />

                  <div className={menuStyles.sectionLabel}>Image quality</div>
                  {COMPOSER_IMAGE_QUALITY_OPTIONS.map((quality) => (
                    <button
                      key={quality}
                      type="button"
                      className={`${menuStyles.item} ${menuStyles.choiceItem}`.trim()}
                      role="menuitemradio"
                      aria-checked={imageQuality === quality}
                      data-active={imageQuality === quality ? "true" : undefined}
                      onClick={() => handleSelectQuality(quality)}
                    >
                      <span className={menuStyles.itemLabel}>{titleCaseComposerQuality(quality)}</span>
                      {imageQuality === quality ? (
                        <span className={menuStyles.itemCheck} aria-hidden="true">
                          <Check weight="bold" />
                        </span>
                      ) : null}
                    </button>
                  ))}

                  <div className={menuStyles.separator} aria-hidden="true" />

                  <div className={menuStyles.sectionLabel}>AI credits</div>
                  <div className={styles.footerCredits}>
                    <div
                      className={styles.footerCreditsBar}
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={creditPercent}
                    >
                      <div
                        className={styles.footerCreditsBarFill}
                        style={{ width: `${creditPercent}%` }}
                      />
                    </div>
                    <p className={styles.footerCreditsLabel}>{creditLabel}</p>
                  </div>
                </div>
              ) : null}
            </div>
            <div>
              {save.error ? (
                <span className={styles.footerError}>{save.error}</span>
              ) : preview.selected ? (
                actions.describeSelection(preview.selected)
              ) : (
                meta.footerDefaultHint
              )}
            </div>
          </div>
          <div className={styles.footerActions}>
            <Button
              variant="primary"
              size="sm"
              className={styles.footerPrimary}
              onClick={() => {
                void save.onSave();
              }}
              disabled={!preview.selected || preview.selected.kind === "ai" || save.pending}
              loading={save.pending}
            >
              {saveLabel}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export function CapsuleBannerCustomizer(props: CapsuleCustomizerProps) {
  return <CapsuleCustomizer {...props} mode={props.mode ?? "banner"} />;
}

export function CapsuleStoreBannerCustomizer(props: Omit<CapsuleCustomizerProps, "mode">) {
  return <CapsuleCustomizer {...props} mode="storeBanner" />;
}

export function CapsuleTileCustomizer(props: Omit<CapsuleCustomizerProps, "mode">) {
  return <CapsuleCustomizer {...props} mode="tile" />;
}

export function CapsuleLogoCustomizer(props: Omit<CapsuleCustomizerProps, "mode">) {
  return <CapsuleCustomizer {...props} mode="logo" />;
}

export function ProfileAvatarCustomizer(props: Omit<CapsuleCustomizerProps, "mode">) {
  return <CapsuleCustomizer {...props} mode="avatar" />;
}

export { CapsuleCustomizer };
export type { CapsuleCustomizerSaveResult, CapsuleCustomizerMode, CapsuleCustomizerProps };
