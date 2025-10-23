"use client";

import * as React from "react";
import {
  X,
  ArrowsClockwise,
  TrashSimple,
  Stack,
  UsersThree,
  SlidersHorizontal,
  Brain,
} from "@phosphor-icons/react/dist/ssr";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";

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

type CapsuleCustomizerProps = {
  open?: boolean;
  capsuleId?: string | null;
  capsuleName?: string | null;
  onClose: () => void;
  onSaved?: (result: CapsuleCustomizerSaveResult) => void;
  mode?: CapsuleCustomizerMode;
};

type LeftRailTab = "versions" | "personas" | "advanced" | "memory";

const LEFT_TAB_BUTTON_IDS: Record<LeftRailTab, string> = {
  versions: "capsule-customizer-tab-versions",
  personas: "capsule-customizer-tab-personas",
  advanced: "capsule-customizer-tab-advanced",
  memory: "capsule-customizer-tab-memory",
};

const LEFT_TAB_PANEL_IDS: Record<LeftRailTab, string> = {
  versions: "capsule-customizer-panel-versions",
  personas: "capsule-customizer-panel-personas",
  advanced: "capsule-customizer-panel-advanced",
  memory: "capsule-customizer-panel-memory",
};

function joinClassNames(...tokens: Array<string | undefined | null>): string {
  return tokens.filter((token): token is string => Boolean(token)).join(" ");
}


function ChatMessageBubble({
  message,
  onBannerSelect,
}: {
  message: ChatMessage;
  onBannerSelect: (option: ChatBannerOption) => void;
}) {
  return (
    <div className={styles.chatMessage} data-role={message.role}>
      <span
        className={styles.chatAvatar}
        aria-label={message.role === "assistant" ? "Assistant" : "You"}
      />
      <div className={styles.chatBubble}>
        {message.content}
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
      </div>
    </div>
  );
}


function CapsuleCustomizer(props: CapsuleCustomizerProps) {
  const { open, ...contextValue } = useCapsuleCustomizerState(props);

  if (!open) return null;

  return (
    <CapsuleCustomizerProvider value={contextValue}>
      <CapsuleCustomizerContent />
    </CapsuleCustomizerProvider>
  );
}

function CapsuleCustomizerContent() {
  const meta = useCapsuleCustomizerMeta();
  const chat = useCapsuleCustomizerChat();
  const memory = useCapsuleCustomizerMemory();
  const preview = useCapsuleCustomizerPreview();
  const save = useCapsuleCustomizerSave();
  const actions = useCapsuleCustomizerActions();
  const panelLayoutId = React.useMemo(() => "capsule-customizer-panels-v1", []);
  const resizableColumnsClass = styles.resizableColumns ?? "";
  const navigationPanelClass = joinClassNames(styles.columnPanel, styles.navigationPanel);
  const chatPanelClass = joinClassNames(styles.columnPanel, styles.chatPanel);
  const previewPanelClass = joinClassNames(styles.columnPanel, styles.previewPanelWrap);
  const resizeHandleClass = styles.resizeHandle ?? "";
  const variants = useCapsuleCustomizerVariants();
  const personas = useCapsuleCustomizerPersonas();
  const advanced = useCapsuleCustomizerAdvancedOptions();

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

  const [activeRailTab, setActiveRailTab] = React.useState<LeftRailTab>(
    variantsSupported ? "versions" : "memory",
  );

  const railTabs = React.useMemo(
    () => [
      {
        key: "versions" as LeftRailTab,
        label: "Versions",
        renderIcon: (selected: boolean) => <Stack size={18} weight={selected ? "fill" : "duotone"} />,
      },
      {
        key: "personas" as LeftRailTab,
        label: "Personas",
        renderIcon: (selected: boolean) => (
          <UsersThree size={18} weight={selected ? "fill" : "duotone"} />
        ),
      },
      {
        key: "advanced" as LeftRailTab,
        label: "Advanced",
        renderIcon: (selected: boolean) => (
          <SlidersHorizontal size={18} weight={selected ? "fill" : "duotone"} />
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

  return (
    <div className={styles.overlay} role="presentation" onClick={actions.overlayClick}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="capsule-customizer-heading"
      >
        <header className={styles.header}>
          <div className={styles.titleGroup}>
            <h2 id="capsule-customizer-heading">{meta.headerTitle}</h2>
            <p>{meta.headerSubtitle}</p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={actions.handleClose}
            aria-label={`Close ${meta.assetLabel} customizer`}
          >
            <X size={18} weight="bold" />
          </button>
        </header>

        <div className={styles.content}>
          <PanelGroup
            autoSaveId={panelLayoutId}
            direction="horizontal"
            className={resizableColumnsClass}
          >
            <Panel
              defaultSize={24}
              minSize={22}
              collapsible={false}
              className={navigationPanelClass}
            >
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
            </div>
            <div
              className={styles.railScroll}
              role="tabpanel"
              id={LEFT_TAB_PANEL_IDS[activeRailTab]}
              aria-labelledby={LEFT_TAB_BUTTON_IDS[activeRailTab]}
              tabIndex={0}
            >
              {activeRailTab === "memory" ? (
                <div className={styles.railSection}>
                  <div className={styles.recentHeader}>
                    <h3 id="customizer-memory-heading">Memories</h3>
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
              {activeRailTab === "versions" ? (
                variantsSupported ? (
                  <div className={styles.railSection} aria-labelledby="customizer-versions-heading">
                    <div className={styles.recentHeader}>
                      <h3 id="customizer-versions-heading">AI versions</h3>
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
                        <p className={styles.recentHint}>Loading your saved versions...</p>
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
                          const snippet = snippetSource.length ? `“${truncate(snippetSource, 68)}”` : null;
                          const detailParts = [
                            mode === "edit" ? "Edit" : "Generate",
                            stylePreset,
                            provider,
                          ].filter(Boolean) as string[];
                          const detail = detailParts.join(" • ");
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
                              aria-label={`Switch to AI version ${variant.version}`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={thumbUrl}
                                alt={`AI version ${variant.version}`}
                                className={styles.recentImage}
                                loading="lazy"
                              />
                              <div className={styles.recentMeta}>
                                <span className={styles.recentTitle}>Version v{variant.version}</span>
                                {snippet ? <span className={styles.recentSnippet}>{snippet}</span> : null}
                                {detail ? <span className={styles.recentSubtle}>{detail}</span> : null}
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <p className={styles.recentHint}>
                          Versions appear here after you generate or edit with Capsule AI.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className={styles.railSection} aria-labelledby="customizer-versions-heading">
                    <h3 id="customizer-versions-heading">AI versions</h3>
                    <p className={styles.recentHint}>
                      Switch to a banner, store banner, logo, or avatar to work with AI versions.
                    </p>
                  </div>
                )
              ) : null}
              {activeRailTab === "personas" ? (
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
              ) : null}
              {activeRailTab === "advanced" ? (
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
              ) : null}
            </div>
              </section>
            </Panel>
            <PanelResizeHandle
              className={resizeHandleClass}
              aria-label="Resize customizer navigation column"
            />
            <Panel
              defaultSize={46}
              minSize={34}
              collapsible={false}
              className={chatPanelClass}
            >
              <section className={styles.chatColumn}>
            <div ref={chat.logRef} className={styles.chatLog} aria-live="polite">
              {chat.messages.map((message) => (
                <ChatMessageBubble
                  key={message.id}
                  message={message}
                  onBannerSelect={chat.onBannerSelect}
                />
              ))}
              {chat.busy ? (
                <div className={styles.chatTyping} aria-live="polite">
                  Capsule AI is thinking...
                </div>
              ) : null}
            </div>

            <div className={styles.prompterDock}>
              <div className={styles.prompterWrap}>
                <AiPrompterStage
                  key={chat.prompterSession}
                  placeholder={meta.prompterPlaceholder}
                  chips={[]}
                  statusMessage={null}
                  onAction={chat.onPrompterAction}
                  variant="bannerCustomizer"
                />
              </div>
            </div>
              </section>
            </Panel>
            <PanelResizeHandle
              className={resizeHandleClass}
              aria-label="Resize customizer preview panel"
            />

            <Panel
              defaultSize={30}
              minSize={24}
              collapsible={false}
              className={previewPanelClass}
            >
              <section className={styles.previewColumn}>
            <div className={styles.previewPanel}>
              <CapsuleBannerPreview />
              <CapsuleAssetActions />
            </div>
              </section>
            </Panel>
          </PanelGroup>
        </div>

        <CapsuleMemoryPicker />

        <footer className={styles.footer}>
          <div className={styles.footerStatus} role="status">
            {save.error ? (
              <span className={styles.footerError}>{save.error}</span>
            ) : preview.selected ? (
              actions.describeSelection(preview.selected)
            ) : (
              meta.footerDefaultHint
            )}
          </div>
          <div className={styles.footerActions}>
            <Button variant="ghost" size="sm" onClick={actions.handleClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
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



