"use client";

import * as React from "react";

import {
  type Artifact,
  type ArtifactBlock,
  type ArtifactSlot,
  type ComposerEvent,
  type ComposerEventMap,
  type ComposerEventType,
  type ComposerViewState,
  type PendingComposerChange,
  SLOT_STATUSES,
} from "@/shared/types/artifacts";

import {
  ComposerEventBusProvider,
  createComposerEventBus,
  useComposerEventBus,
  type ComposerEventBus,
} from "@/lib/composer/event-bus";
import { safeRandomUUID } from "@/lib/random";

export type FocusedSlotRef = {
  blockId: string;
  slotId: string;
};

type ComposerStatusSnapshot = {
  scope: ComposerEventMap["status_update"]["scope"];
  status: ComposerEventMap["status_update"]["status"];
  message?: string | null;
  costCents?: number | null;
  timestamp: number;
};

type ComposerArtifactState = {
  artifact: Artifact | null;
  viewState: ComposerViewState;
  selectedBlockId: string | null;
  focusedSlot: FocusedSlotRef | null;
  pendingChanges: PendingComposerChange[];
  lastStatus: ComposerStatusSnapshot | null;
};


function createSeedArtifact(): Artifact {
  const id = safeRandomUUID();
  const blockId = safeRandomUUID();
  const now = new Date().toISOString();
  return {
    id,
    ownerUserId: "local-user",
    artifactType: "custom",
    status: "draft",
    title: "Untitled artifact",
    description: null,
    version: 1,
    metadata: {},
    blocks: [
      {
        id: blockId,
        type: "text.rich",
        label: "Body",
        state: { mode: "active" },
        slots: {
          body: {
            id: "body",
            kind: "text",
            status: "ready",
            value: {
              kind: "text",
              content: "",
              format: "markdown",
            },
          },
        },
      },
    ],
    context: undefined,
    createdAt: now,
    updatedAt: now,
    committedAt: null,
  };
}

const INITIAL_STATE: ComposerArtifactState = {
  artifact: null,
  viewState: "idle",
  selectedBlockId: null,
  focusedSlot: null,
  pendingChanges: [],
  lastStatus: null,
};

type ComposerReducerAction =
  | { type: "hydrate"; artifact: Artifact }
  | { type: "apply_event"; event: ComposerEvent }
  | { type: "set_view"; view: ComposerViewState }
  | { type: "select_block"; blockId: string | null }
  | { type: "focus_slot"; slot: FocusedSlotRef | null }
  | { type: "mark_pending_persisted"; timestamps?: number[] }
  | { type: "clear_pending"; timestamps?: number[] }
  | { type: "reset" };

function composerReducer(state: ComposerArtifactState, action: ComposerReducerAction): ComposerArtifactState {
  switch (action.type) {
    case "hydrate": {
      return {
        artifact: action.artifact,
        viewState: action.artifact.blocks.length ? "drafting" : "idle",
        selectedBlockId: state.selectedBlockId,
        focusedSlot: null,
        pendingChanges: [],
        lastStatus: null,
      };
    }
    case "apply_event": {
      const { event } = action;
      let nextArtifact = state.artifact;
      let nextViewState = state.viewState;
      let nextSelectedBlock = state.selectedBlockId;
      let nextFocusedSlot = state.focusedSlot;
      let nextStatus = state.lastStatus;

      switch (event.type) {
        case "insert_block": {
          const payload = event.payload as ComposerEventMap["insert_block"];
          if (state.artifact && state.artifact.id === payload.artifactId) {
            const { blocks, inserted } = insertBlock(
              state.artifact.blocks,
              payload.block,
              payload.parentId ?? null,
              payload.index,
            );
            if (inserted) {
              nextArtifact = {
                ...state.artifact,
                blocks,
                updatedAt: new Date().toISOString(),
              };
              nextSelectedBlock = payload.block.id;
              nextViewState = event.origin === "remote" ? "reviewing-action" : "drafting";
            }
          }
          break;
        }
        case "update_slot": {
          const payload = event.payload as ComposerEventMap["update_slot"];
          if (state.artifact && state.artifact.id === payload.artifactId) {
            const { blocks, updated } = updateSlot(
              state.artifact.blocks,
              payload.blockId,
              payload.slotId,
              (slot) => applySlotPatch(payload, slot),
            );
            if (updated) {
              nextArtifact = {
                ...state.artifact,
                blocks,
                updatedAt: new Date().toISOString(),
              };
              nextFocusedSlot = { blockId: payload.blockId, slotId: payload.slotId };
              if (payload.patch.status === "pending") {
                nextViewState = "focusing-slot";
              } else if (event.origin === "remote") {
                nextViewState = "reviewing-action";
              }
            }
          }
          break;
        }
        case "remove_block": {
          const payload = event.payload as ComposerEventMap["remove_block"];
          if (state.artifact && state.artifact.id === payload.artifactId) {
            const { blocks, removed } = removeBlock(
              state.artifact.blocks,
              payload.blockId,
              Boolean(payload.soft),
            );
            if (removed) {
              nextArtifact = {
                ...state.artifact,
                blocks,
                updatedAt: new Date().toISOString(),
              };
              if (nextSelectedBlock === payload.blockId) {
                nextSelectedBlock = null;
              }
              if (nextFocusedSlot && nextFocusedSlot.blockId === payload.blockId) {
                nextFocusedSlot = null;
              }
              nextViewState = "reviewing-action";
            }
          }
          break;
        }
        case "preview_media": {
          const payload = event.payload as ComposerEventMap["preview_media"];
          if (state.artifact && state.artifact.id === payload.artifactId) {
            const { blocks, updated } = updateSlot(
              state.artifact.blocks,
              payload.blockId,
              payload.slotId,
              (slot) => {
                const base = slot ?? {
                  id: payload.slotId,
                  kind: "media",
                  status: SLOT_STATUSES[0],
                };
                return {
                  ...base,
                  status: "pending",
                  value: {
                    kind: "media",
                    url: payload.previewUrl,
                    descriptors: payload.descriptors ?? null,
                  },
                };
              },
            );
            if (updated) {
              nextArtifact = {
                ...state.artifact,
                blocks,
                updatedAt: new Date().toISOString(),
              };
              nextFocusedSlot = { blockId: payload.blockId, slotId: payload.slotId };
              nextViewState = "focusing-slot";
            }
          }
          break;
        }
        case "commit_artifact": {
          const payload = event.payload as ComposerEventMap["commit_artifact"];
          if (state.artifact && state.artifact.id === payload.artifactId) {
            nextArtifact = {
              ...state.artifact,
              version: payload.version,
              committedAt: new Date().toISOString(),
            };
            nextViewState = "idle";
            nextFocusedSlot = null;
          }
          break;
        }
        case "branch_artifact": {
          const payload = event.payload as ComposerEventMap["branch_artifact"];
          if (state.artifact && state.artifact.id === payload.sourceArtifactId) {
            nextViewState = "idle";
          }
          break;
        }
        case "status_update": {
          const payload = event.payload as ComposerEventMap["status_update"];
          nextStatus = {
            scope: payload.scope,
            status: payload.status,
            message: payload.message ?? null,
            costCents: payload.costCents ?? null,
            timestamp: event.timestamp,
          };
          if (payload.scope === "autosave" && payload.status === "success") {
            nextViewState = "idle";
          }
          break;
        }
        default:
          break;
      }

      let nextPending = state.pendingChanges;
      if (event.origin === "local") {
        nextPending = [...nextPending, { event, persisted: false }];
      }

      if (event.type === "commit_artifact") {
        nextPending = nextPending.map((change) =>
          change.persisted ? change : { ...change, persisted: true },
        );
      }

      return {
        artifact: nextArtifact,
        viewState: nextViewState,
        selectedBlockId: nextSelectedBlock,
        focusedSlot: nextFocusedSlot,
        pendingChanges: nextPending,
        lastStatus: nextStatus,
      };
    }
    case "set_view": {
      if (state.viewState === action.view) return state;
      return { ...state, viewState: action.view };
    }
    case "select_block": {
      if (state.selectedBlockId === action.blockId) return state;
      return { ...state, selectedBlockId: action.blockId };
    }
    case "focus_slot": {
      if (
        state.focusedSlot?.blockId === action.slot?.blockId &&
        state.focusedSlot?.slotId === action.slot?.slotId
      ) {
        return state;
      }
      return { ...state, focusedSlot: action.slot, viewState: action.slot ? "focusing-slot" : state.viewState };
    }
    case "mark_pending_persisted": {
      if (!state.pendingChanges.length) return state;
      if (!action.timestamps || !action.timestamps.length) {
        return {
          ...state,
          pendingChanges: state.pendingChanges.map((change) => ({ ...change, persisted: true })),
        };
      }
      const timestamps = new Set(action.timestamps);
      return {
        ...state,
        pendingChanges: state.pendingChanges.map((change) =>
          timestamps.has(change.event.timestamp) ? { ...change, persisted: true } : change,
        ),
      };
    }
    case "clear_pending": {
      if (!state.pendingChanges.length) return state;
      if (!action.timestamps || !action.timestamps.length) {
        return { ...state, pendingChanges: [] };
      }
      const timestamps = new Set(action.timestamps);
      return {
        ...state,
        pendingChanges: state.pendingChanges.filter((change) => !timestamps.has(change.event.timestamp)),
      };
    }
    case "reset":
      return INITIAL_STATE;
    default:
      return state;
  }
}

function insertBlock(
  blocks: ArtifactBlock[],
  block: ArtifactBlock,
  parentId: string | null,
  index?: number,
): { blocks: ArtifactBlock[]; inserted: boolean } {
  if (!parentId) {
    const target = typeof index === "number" && index >= 0 ? Math.min(index, blocks.length) : blocks.length;
    const next = [...blocks];
    next.splice(target, 0, block);
    return { blocks: next, inserted: true };
  }
  let inserted = false;
  const nextBlocks = blocks.map((existing) => {
    if (existing.id === parentId) {
      const children = existing.children ?? [];
      const target =
        typeof index === "number" && index >= 0 ? Math.min(index, children.length) : children.length;
      const nextChildren = [...children];
      nextChildren.splice(target, 0, block);
      inserted = true;
      return { ...existing, children: nextChildren };
    }
    if (existing.children && existing.children.length) {
      const result = insertBlock(existing.children, block, parentId, index);
      if (result.inserted) {
        inserted = true;
        return { ...existing, children: result.blocks };
      }
    }
    return existing;
  });
  return { blocks: inserted ? nextBlocks : blocks, inserted };
}

function updateSlot(
  blocks: ArtifactBlock[],
  blockId: string,
  slotId: string,
  updater: (slot: ArtifactSlot | undefined) => ArtifactSlot | null,
): { blocks: ArtifactBlock[]; updated: boolean } {
  let updated = false;
  const nextBlocks = blocks.map((block) => {
    if (block.id === blockId) {
      const currentSlot = block.slots[slotId];
      const nextSlot = updater(currentSlot);
      if (!nextSlot) return block;
      updated = true;
      return {
        ...block,
        slots: { ...block.slots, [slotId]: nextSlot },
      };
    }
    if (block.children && block.children.length) {
      const childResult = updateSlot(block.children, blockId, slotId, updater);
      if (childResult.updated) {
        updated = true;
        return { ...block, children: childResult.blocks };
      }
    }
    return block;
  });
  return { blocks: updated ? nextBlocks : blocks, updated };
}

function removeBlock(
  blocks: ArtifactBlock[],
  blockId: string,
  soft: boolean,
): { blocks: ArtifactBlock[]; removed: boolean } {
  let removed = false;
  const nextBlocks: ArtifactBlock[] = [];
  for (const block of blocks) {
    if (block.id === blockId) {
      removed = true;
      if (soft) {
        nextBlocks.push({
          ...block,
          state: { ...block.state, mode: "deleted" },
        });
      }
      continue;
    }
    let nextBlock = block;
    if (block.children && block.children.length) {
      const result = removeBlock(block.children, blockId, soft);
      if (result.removed) {
        nextBlock = { ...block, children: result.blocks };
        removed = true;
      }
    }
    nextBlocks.push(nextBlock);
  }
  return { blocks: removed ? nextBlocks : blocks, removed };
}

function applySlotPatch(
  payload: ComposerEventMap["update_slot"],
  slot: ArtifactSlot | undefined,
): ArtifactSlot | null {
  const patch = payload.patch;
  const baseSlot: ArtifactSlot | null =
    slot ??
    (patch.kind
      ? {
          id: payload.slotId,
          kind: patch.kind,
          status: patch.status ?? "empty",
          value: patch.value,
          provenance: patch.provenance,
          constraints: patch.constraints,
          draftId: payload.draftId ?? patch.draftId ?? null,
        }
      : null);
  if (!baseSlot) return null;
  const nextSlot: ArtifactSlot = {
    ...baseSlot,
    ...patch,
  };
  if (patch.value !== undefined) {
    nextSlot.value = patch.value;
  }
  if (patch.provenance !== undefined) {
    nextSlot.provenance = patch.provenance;
  }
  if (patch.constraints !== undefined) {
    nextSlot.constraints = patch.constraints;
  }
  if (patch.status !== undefined) {
    nextSlot.status = patch.status;
  }
  nextSlot.draftId = payload.draftId ?? patch.draftId ?? baseSlot.draftId ?? null;
  return nextSlot;
}

export type UseComposerArtifactOptions = {
  artifact: Artifact | null;
  autoHydrate?: boolean;
  eventBus?: ComposerEventBus | null;
};

export type UseComposerArtifactResult = ComposerArtifactState & {
  emitEvent<K extends ComposerEventType>(type: K, payload: ComposerEventMap[K]): void;
  setViewState(view: ComposerViewState): void;
  selectBlock(blockId: string | null): void;
  setFocusedSlot(slot: FocusedSlotRef | null): void;
  markPendingPersisted(timestamps?: number[]): void;
  clearPending(timestamps?: number[]): void;
  hydrate(artifact: Artifact): void;
  eventBus: ComposerEventBus;
};

const EVENT_TYPES: ComposerEventType[] = [
  "insert_block",
  "update_slot",
  "remove_block",
  "preview_media",
  "commit_artifact",
  "branch_artifact",
  "status_update",
];

export function useComposerArtifact(options: UseComposerArtifactOptions): UseComposerArtifactResult {
  const contextBus = useComposerEventBus();
  const memoBus = React.useMemo(() => {
    if (options.eventBus) return options.eventBus;
    if (contextBus) return contextBus;
    return createComposerEventBus();
  }, [options.eventBus, contextBus]);

  const [state, dispatch] = React.useReducer(composerReducer, INITIAL_STATE);
  const artifactRef = React.useRef<Artifact | null>(null);

  React.useEffect(() => {
    if (options.autoHydrate === false) return;
    if (options.artifact) {
      dispatch({ type: "hydrate", artifact: options.artifact });
      artifactRef.current = options.artifact;
      return;
    }
    if (!artifactRef.current) {
      const seed = createSeedArtifact();
      dispatch({ type: "hydrate", artifact: seed });
      artifactRef.current = seed;
    }
  }, [options.artifact, options.autoHydrate]);

  React.useEffect(() => {
    const unsubscribeList = EVENT_TYPES.map((eventType) =>
      memoBus.subscribe(eventType, (event) => {
        if (artifactRef.current && "artifactId" in event.payload) {
          const payloadArtifactId = (event.payload as { artifactId?: string }).artifactId;
          if (payloadArtifactId && artifactRef.current.id !== payloadArtifactId) {
            return;
          }
        }
        dispatch({ type: "apply_event", event });
      }),
    );
    return () => {
      unsubscribeList.forEach((unsubscribe) => unsubscribe());
    };
  }, [memoBus]);

  const emitEvent = React.useCallback(
    <K extends ComposerEventType>(type: K, payload: ComposerEventMap[K]) => {
      memoBus.emit(type, payload, "local");
    },
    [memoBus],
  );

  const setViewState = React.useCallback((view: ComposerViewState) => {
    dispatch({ type: "set_view", view });
  }, []);

  const selectBlock = React.useCallback((blockId: string | null) => {
    dispatch({ type: "select_block", blockId });
  }, []);

  const setFocusedSlot = React.useCallback((slot: FocusedSlotRef | null) => {
    dispatch({ type: "focus_slot", slot });
  }, []);

  const markPendingPersisted = React.useCallback((timestamps?: number[]) => {
    dispatch({
      type: "mark_pending_persisted",
      ...(timestamps ? { timestamps } : {}),
    });
  }, []);

  const clearPending = React.useCallback((timestamps?: number[]) => {
    dispatch({
      type: "clear_pending",
      ...(timestamps ? { timestamps } : {}),
    });
  }, []);

  const hydrate = React.useCallback((artifact: Artifact) => {
    dispatch({ type: "hydrate", artifact });
    artifactRef.current = artifact;
  }, []);

  React.useEffect(() => {
    artifactRef.current = state.artifact;
  }, [state.artifact]);

  return {
    ...state,
    emitEvent,
    setViewState,
    selectBlock,
    setFocusedSlot,
    markPendingPersisted,
    clearPending,
    hydrate,
    eventBus: memoBus,
  };
}

export function ComposerArtifactProvider(
  props: React.PropsWithChildren<{ eventBus?: ComposerEventBus | null }>,
) {
  const bus = React.useMemo(() => props.eventBus ?? createComposerEventBus(), [props.eventBus]);
  return <ComposerEventBusProvider bus={bus}>{props.children}</ComposerEventBusProvider>;
}



