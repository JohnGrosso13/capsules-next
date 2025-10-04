export const ARTIFACT_TYPES = [
  "presentation",
  "proposal",
  "sop",
  "form",
  "campaign",
  "custom",
] as const;

export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export const ARTIFACT_STATUSES = ["draft", "published", "archived"] as const;
export type ArtifactStatus = (typeof ARTIFACT_STATUSES)[number];

export const BLOCK_TYPES = [
  "text.rich",
  "media.hero",
  "media.gallery",
  "callout",
  "timeline",
  "list.checklist",
  "form.field_group",
  "table.grid",
  "poll.multi",
  "embed.social",
  "cta.block",
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export const SLOT_KINDS = ["text", "media", "poll", "action", "data", "collection"] as const;
export type SlotKind = (typeof SLOT_KINDS)[number];

export const SLOT_STATUSES = ["empty", "pending", "ready", "error"] as const;
export type SlotStatus = (typeof SLOT_STATUSES)[number];

export type TextSlotValue = {
  kind: "text";
  content: string;
  format?: "plain" | "markdown" | "html";
  summary?: string | null;
  keywords?: string[] | null;
};

export type MediaSlotValue = {
  kind: "media";
  url: string;
  thumbUrl?: string | null;
  posterUrl?: string | null;
  altText?: string | null;
  descriptors?: Record<string, unknown> | null;
};

export type PollSlotValue = {
  kind: "poll";
  prompt: string;
  options: Array<{ id: string; label: string; value?: string | null }>;
  settings?: Record<string, unknown> | null;
};

export type DataSlotValue = {
  kind: "data";
  schema: Record<string, unknown>;
  values?: Record<string, unknown> | null;
};

export type ActionSlotValue = {
  kind: "action";
  label: string;
  url?: string | null;
  meta?: Record<string, unknown> | null;
};

export type CollectionSlotValue = {
  kind: "collection";
  items: SlotValue[];
  layout?: string | null;
};

export type SlotValue =
  | TextSlotValue
  | MediaSlotValue
  | PollSlotValue
  | DataSlotValue
  | ActionSlotValue
  | CollectionSlotValue;

export type SlotConstraints = {
  maxLength?: number;
  minLength?: number;
  allowedKinds?: SlotKind[];
  disallowedKinds?: SlotKind[];
  aspectRatio?: string | null;
  contentTypes?: string[];
};

export type SlotProvenance = {
  source: "ai" | "user" | "upload" | "template" | "external";
  promptId?: string | null;
  assetId?: string | null;
  templateId?: string | null;
  generator?: string | null;
  costCents?: number | null;
  createdAt?: string | null;
};

export type ArtifactSlot = {
  id: string;
  kind: SlotKind;
  status: SlotStatus;
  value?: SlotValue;
  provenance?: SlotProvenance;
  constraints?: SlotConstraints;
  draftId?: string | null;
};

export type BlockState = {
  mode: "active" | "suggested" | "archived" | "deleted";
  locked?: boolean;
  lastEditedBy?: string | null;
  lastEditedAt?: string | null;
  branchId?: string | null;
};

export type BlockAnnotation = {
  label: string;
  kind: "diff" | "comment" | "branch" | "rollback";
  payload?: Record<string, unknown>;
};

export type ArtifactBlock = {
  id: string;
  type: BlockType;
  label?: string;
  state: BlockState;
  slots: Record<string, ArtifactSlot>;
  children?: ArtifactBlock[];
  annotations?: BlockAnnotation[];
};

export type ArtifactContext = {
  relatedArtifactIds?: string[];
  relatedAssetIds?: string[];
  tags?: string[];
  summary?: string | null;
  lastPromptId?: string | null;
};

export type Artifact = {
  id: string;
  ownerUserId: string;
  artifactType: ArtifactType;
  status: ArtifactStatus;
  title: string;
  description?: string | null;
  version: number;
  metadata: Record<string, unknown>;
  blocks: ArtifactBlock[];
  context?: ArtifactContext;
  createdAt: string;
  updatedAt: string;
  committedAt?: string | null;
};

export type ArtifactSummary = Pick<Artifact, "id" | "artifactType" | "status" | "title" | "version" | "updatedAt"> & {
  preview?: Record<string, unknown> | null;
};

export type ComposerViewState = "idle" | "drafting" | "focusing-slot" | "reviewing-action";

export type InsertBlockEvent = {
  artifactId: string;
  parentId?: string | null;
  index?: number;
  block: ArtifactBlock;
  source?: "ai" | "user" | "template";
};

export type UpdateSlotEvent = {
  artifactId: string;
  blockId: string;
  slotId: string;
  patch: Partial<ArtifactSlot> & { value?: SlotValue };
  draftId?: string | null;
};

export type RemoveBlockEvent = {
  artifactId: string;
  blockId: string;
  reason?: string | null;
  soft?: boolean;
};

export type PreviewMediaEvent = {
  artifactId: string;
  blockId: string;
  slotId: string;
  previewUrl: string;
  expiresAt?: string | null;
  descriptors?: Record<string, unknown> | null;
};

export type CommitArtifactEvent = {
  artifactId: string;
  version: number;
  diffSummary?: Record<string, unknown> | null;
};

export type BranchArtifactEvent = {
  sourceArtifactId: string;
  newArtifact: Artifact;
  summary?: string | null;
};

export type StatusUpdateEvent = {
  artifactId: string;
  scope: "chat" | "media" | "autosave" | "embedding" | "system";
  status: "pending" | "success" | "error" | "cancelled";
  message?: string | null;
  costCents?: number | null;
};

export type ComposerEventMap = {
  insert_block: InsertBlockEvent;
  update_slot: UpdateSlotEvent;
  remove_block: RemoveBlockEvent;
  preview_media: PreviewMediaEvent;
  commit_artifact: CommitArtifactEvent;
  branch_artifact: BranchArtifactEvent;
  status_update: StatusUpdateEvent;
};

export type ComposerEventType = keyof ComposerEventMap;

export type ComposerEvent<K extends ComposerEventType = ComposerEventType> = {
  type: K;
  payload: ComposerEventMap[K];
  timestamp: number;
  origin: "local" | "remote" | "system";
};

export type PendingComposerChange = {
  event: ComposerEvent;
  persisted: boolean;
};

