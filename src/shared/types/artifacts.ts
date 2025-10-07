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
  format?: "plain" | "markdown" | "html" | undefined;
  summary?: string | null | undefined;
  keywords?: string[] | null | undefined;
};

export type MediaSlotValue = {
  kind: "media";
  url: string;
  thumbUrl?: string | null | undefined;
  posterUrl?: string | null | undefined;
  altText?: string | null | undefined;
  descriptors?: Record<string, unknown> | null | undefined;
};

export type PollSlotValue = {
  kind: "poll";
  prompt: string;
  options: Array<{ id: string; label: string; value?: string | null | undefined }>;
  settings?: Record<string, unknown> | null | undefined;
};

export type DataSlotValue = {
  kind: "data";
  schema: Record<string, unknown>;
  values?: Record<string, unknown> | null | undefined;
};

export type ActionSlotValue = {
  kind: "action";
  label: string;
  url?: string | null | undefined;
  meta?: Record<string, unknown> | null | undefined;
};

export type CollectionSlotValue = {
  kind: "collection";
  items: SlotValue[];
  layout?: string | null | undefined;
};

export type SlotValue =
  | TextSlotValue
  | MediaSlotValue
  | PollSlotValue
  | DataSlotValue
  | ActionSlotValue
  | CollectionSlotValue;

export type SlotConstraints = {
  maxLength?: number | undefined;
  minLength?: number | undefined;
  allowedKinds?: SlotKind[] | undefined;
  disallowedKinds?: SlotKind[] | undefined;
  aspectRatio?: string | null | undefined;
  contentTypes?: string[] | undefined;
};

export type SlotProvenance = {
  source: "ai" | "user" | "upload" | "template" | "external";
  promptId?: string | null | undefined;
  assetId?: string | null | undefined;
  templateId?: string | null | undefined;
  generator?: string | null | undefined;
  costCents?: number | null | undefined;
  createdAt?: string | null | undefined;
};

export type ArtifactSlot = {
  id: string;
  kind: SlotKind;
  status: SlotStatus;
  value?: SlotValue | undefined;
  provenance?: SlotProvenance | undefined;
  constraints?: SlotConstraints | undefined;
  draftId?: string | null | undefined;
};

export type BlockState = {
  mode: "active" | "suggested" | "archived" | "deleted";
  locked?: boolean | undefined;
  lastEditedBy?: string | null | undefined;
  lastEditedAt?: string | null | undefined;
  branchId?: string | null | undefined;
};

export type BlockAnnotation = {
  label: string;
  kind: "diff" | "comment" | "branch" | "rollback";
  payload?: Record<string, unknown> | undefined;
};

export type ArtifactBlock = {
  id: string;
  type: BlockType;
  label?: string | undefined;
  state: BlockState;
  slots: Record<string, ArtifactSlot>;
  children?: ArtifactBlock[] | undefined;
  annotations?: BlockAnnotation[] | undefined;
};

export type ArtifactContext = {
  relatedArtifactIds?: string[] | undefined;
  relatedAssetIds?: string[] | undefined;
  tags?: string[] | undefined;
  summary?: string | null | undefined;
  lastPromptId?: string | null | undefined;
};

export type Artifact = {
  id: string;
  ownerUserId: string;
  artifactType: ArtifactType;
  status: ArtifactStatus;
  title: string;
  description?: string | null | undefined;
  version: number;
  metadata: Record<string, unknown>;
  blocks: ArtifactBlock[];
  context?: ArtifactContext | undefined;
  createdAt: string;
  updatedAt: string;
  committedAt?: string | null | undefined;
};

export type ArtifactSummary = Pick<Artifact, "id" | "artifactType" | "status" | "title" | "version" | "updatedAt"> & {
  preview?: Record<string, unknown> | null | undefined;
};

export type ComposerViewState = "idle" | "drafting" | "focusing-slot" | "reviewing-action";

export type InsertBlockEvent = {
  artifactId: string;
  parentId?: string | null | undefined;
  index?: number | undefined;
  block: ArtifactBlock;
  source?: "ai" | "user" | "template" | undefined;
};

export type UpdateSlotEvent = {
  artifactId: string;
  blockId: string;
  slotId: string;
  patch: Partial<ArtifactSlot> & { value?: SlotValue | undefined };
  draftId?: string | null | undefined;
};

export type RemoveBlockEvent = {
  artifactId: string;
  blockId: string;
  reason?: string | null | undefined;
  soft?: boolean | undefined;
};

export type PreviewMediaEvent = {
  artifactId: string;
  blockId: string;
  slotId: string;
  previewUrl: string;
  expiresAt?: string | null | undefined;
  descriptors?: Record<string, unknown> | null | undefined;
};

export type CommitArtifactEvent = {
  artifactId: string;
  version: number;
  diffSummary?: Record<string, unknown> | null | undefined;
};

export type BranchArtifactEvent = {
  sourceArtifactId: string;
  newArtifact: Artifact;
  summary?: string | null | undefined;
};

export type StatusUpdateEvent = {
  artifactId: string;
  scope: "chat" | "media" | "autosave" | "embedding" | "system";
  status: "pending" | "success" | "error" | "cancelled";
  message?: string | null | undefined;
  costCents?: number | null | undefined;
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


