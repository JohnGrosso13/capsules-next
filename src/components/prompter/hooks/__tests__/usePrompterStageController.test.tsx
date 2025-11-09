// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePrompterStageController } from "../usePrompterStageController";
import type { PrompterVariantConfig } from "../usePrompterContext";
import type { usePrompterAttachments } from "../usePrompterAttachments";

const usePrompterContextMock = vi.fn();
vi.mock("../usePrompterContext", () => ({
  usePrompterContext: (...args: unknown[]) => usePrompterContextMock(...(args as [])),
}));

const usePrompterIntentMock = vi.fn();
vi.mock("../usePrompterIntent", () => ({
  usePrompterIntent: (...args: unknown[]) => usePrompterIntentMock(...(args as [])),
}));

const usePrompterAttachmentsMock = vi.fn();
vi.mock("../usePrompterAttachments", () => ({
  usePrompterAttachments: (...args: unknown[]) => usePrompterAttachmentsMock(...(args as [])),
}));

const usePrompterActionsMock = vi.fn();
vi.mock("../usePrompterActions", () => ({
  usePrompterActions: (...args: unknown[]) => usePrompterActionsMock(...(args as [])),
}));

const usePrompterVoiceMock = vi.fn();
vi.mock("../../usePrompterVoice", () => ({
  usePrompterVoice: (...args: unknown[]) => usePrompterVoiceMock(...(args as [])),
}));

const detectSuggestedToolsMock = vi.fn();
vi.mock("@/components/prompter/tools", () => ({
  detectSuggestedTools: (...args: unknown[]) => detectSuggestedToolsMock(...(args as [])),
}));

type ControllerProps = Parameters<typeof usePrompterStageController>[0];
type StageController = ReturnType<typeof usePrompterStageController>;
type PrompterAttachmentsReturn = ReturnType<typeof usePrompterAttachments>;

const baseVariantConfig: PrompterVariantConfig = {
  allowAttachments: true,
  allowVoice: true,
  allowIntentMenu: true,
  allowIntentHints: true,
  allowTools: true,
  allowNavigation: true,
  enableDragAndDrop: true,
  multilineInput: false,
  forceIntent: null,
  forceButtonLabel: null,
};

const baseContext = {
  composerContext: { activeCapsuleId: "capsule-123" },
  activeCapsuleId: "capsule-123",
  userEnvelope: { id: "user-1" },
  resolvedPlaceholder: "Prompt placeholder",
  localStatus: null as string | null,
  showLocalStatus: vi.fn<(message: string | null) => void>(),
};

const baseIntent = {
  autoIntent: { intent: "generate" as const, confidence: 0.72, reason: "Defaulting to post intent." },
  manualIntent: null,
  setManualIntent: vi.fn<(intent: string | null) => void>(),
  navTarget: null,
  postPlan: { mode: "manual" as const, content: "" },
  effectiveIntent: "generate" as const,
  buttonBusy: false,
};

const baseAttachments: PrompterAttachmentsReturn = {
  attachmentsEnabled: true,
  fileInputRef: { current: null },
  attachment: null,
  readyAttachment: null,
  attachmentUploading: false,
  attachmentList: [],
  removeAttachment: vi.fn(),
  handleAttachClick: vi.fn(),
  handleAttachmentSelect: vi.fn(),
  handlePasteAttachment: vi.fn(),
  handlePreviewAttachment: vi.fn(),
  handleRetryAttachment: vi.fn(),
  isDraggingFile: false,
  handleDragEnter: vi.fn(),
  handleDragOver: vi.fn(),
  handleDragLeave: vi.fn(),
  handleDrop: vi.fn(),
  clearAllAttachments: vi.fn(),
  preview: null,
  closePreview: vi.fn(),
  hasReadyAttachment: false,
};

const baseVoice = {
  voiceSupported: true,
  voiceStatus: "idle" as const,
  voiceStatusMessage: null as string | null,
  voiceButtonLabel: "Start voice input",
  handleVoiceToggle: vi.fn(),
};

function mockContext(overrides?: Partial<typeof baseContext> & { variantConfig?: Partial<PrompterVariantConfig> }) {
  const variantOverrides = overrides?.variantConfig ?? {};
  usePrompterContextMock.mockReturnValue({
    ...baseContext,
    ...overrides,
    variantConfig: { ...baseVariantConfig, ...variantOverrides },
  });
}

function mockIntent(overrides?: Partial<typeof baseIntent>) {
  usePrompterIntentMock.mockReturnValue({
    ...baseIntent,
    ...overrides,
  });
}

function mockAttachments(overrides?: Partial<PrompterAttachmentsReturn>) {
  usePrompterAttachmentsMock.mockReturnValue({
    ...baseAttachments,
    ...overrides,
  });
}

function mockActions() {
  usePrompterActionsMock.mockReturnValue({
    handleGenerate: vi.fn(),
    handleSuggestedAction: vi.fn(),
  });
}

function mockVoice(overrides?: Partial<typeof baseVoice>) {
  usePrompterVoiceMock.mockReturnValue({
    ...baseVoice,
    ...overrides,
  });
}

describe("usePrompterStageController", () => {
  let container: HTMLDivElement;
  let root: Root;
  let controller: StageController | null = null;

  const defaultProps: ControllerProps = {
    placeholder: "Prompt placeholder",
    chips: ["Idea starter"],
    statusMessage: null,
    variant: "default",
  };

  function ControllerHarness(props: ControllerProps) {
    controller = usePrompterStageController(props);
    return null;
  }

  async function renderController(overrides?: Partial<ControllerProps>) {
    await act(async () => {
      root.render(<ControllerHarness {...defaultProps} {...overrides} />);
      await Promise.resolve();
    });
  }

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    detectSuggestedToolsMock.mockReturnValue([]);
    mockContext();
    mockIntent();
    mockAttachments();
    mockActions();
    mockVoice();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    controller = null;
    vi.clearAllMocks();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("applies manual intents when the intent menu is enabled", async () => {
    const setManualIntent = vi.fn();
    mockIntent({ setManualIntent });

    await renderController();

    await act(async () => {
      controller?.applyManualIntent("style");
    });

    expect(setManualIntent).toHaveBeenCalledWith("style");
  });

  it("ignores manual intent overrides when the menu is disabled", async () => {
    const setManualIntent = vi.fn();
    mockIntent({ setManualIntent });
    mockContext({ variantConfig: { allowIntentMenu: false } });

    await renderController();

    await act(async () => {
      controller?.applyManualIntent("navigate");
    });

    expect(setManualIntent).not.toHaveBeenCalled();
  });

  it("surfaces detected tools when tool suggestions are enabled", async () => {
    detectSuggestedToolsMock.mockReturnValue([
      { key: "poll" },
      { key: "logo" },
      { key: "custom" },
    ]);

    await renderController();

    expect(controller?.suggestedTools?.map((tool) => tool.key)).toEqual(["poll", "logo"]);
  });

  it("suppresses suggested tools when the feature flag is off", async () => {
    detectSuggestedToolsMock.mockReturnValue([{ key: "poll" }]);
    mockContext({ variantConfig: { allowTools: false } });

    await renderController();

    expect(controller?.suggestedTools).toEqual([]);
  });

  it("proxies voice controls and hint messaging when voice is enabled", async () => {
    const handleVoiceToggle = vi.fn();
    mockVoice({
      voiceStatusMessage: "Listening for a prompt...",
      voiceButtonLabel: "Stop listening",
      handleVoiceToggle,
    });

    await renderController();

    expect(controller?.variantConfig.allowVoice).toBe(true);
    expect(controller?.voiceSupported).toBe(true);
    expect(controller?.voiceControls.voiceButtonLabel).toBe("Stop listening");
    expect(controller?.hint).toBe("Listening for a prompt...");

    await act(async () => {
      controller?.handleVoiceToggle();
    });

    expect(handleVoiceToggle).toHaveBeenCalled();
  });

  it("disables voice interactions when variant config disallows voice input", async () => {
    const handleVoiceToggle = vi.fn();
    mockVoice({ handleVoiceToggle });
    mockContext({ variantConfig: { allowVoice: false } });

    await renderController();

    await act(async () => {
      controller?.handleVoiceToggle();
    });

    expect(handleVoiceToggle).not.toHaveBeenCalled();
    expect(controller?.voiceSupported).toBe(false);
    expect(controller?.hint).toBe("Add what you'd like to share.");
  });
});
