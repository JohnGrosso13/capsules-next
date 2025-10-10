"use client";

import * as React from "react";

export type ComposerPrivacy = "public" | "private";

export type ComposerDragState =
  | { kind: "left"; startX: number; start: number }
  | { kind: "right"; startX: number; start: number }
  | { kind: "bottom"; startY: number; start: number };

export type ComposerVoiceState = {
  draft: { session: number; text: string } | null;
  interim: string | null;
  lastResult: string | null;
  error: string | null;
};

export type ComposerLayoutState = {
  leftWidth: number;
  rightWidth: number;
  bottomHeight: number;
  mainHeight: number;
  drag: ComposerDragState | null;
};

export type ComposerFormState = {
  privacy: ComposerPrivacy;
  projectsOpen: boolean;
  mobileRailOpen: boolean;
  previewOpen: boolean;
  layout: ComposerLayoutState;
  viewerOpen: boolean;
  voice: ComposerVoiceState;
};

type ComposerFormAction =
  | { type: "setPrivacy"; value: ComposerPrivacy }
  | { type: "setProjectsOpen"; value: boolean }
  | { type: "toggleProjects" }
  | { type: "setMobileRailOpen"; value: boolean }
  | { type: "setPreviewOpen"; value: boolean }
  | { type: "layout/setLeftWidth"; value: number }
  | { type: "layout/setRightWidth"; value: number }
  | { type: "layout/setBottomHeight"; value: number }
  | { type: "layout/setMainHeight"; value: number }
  | { type: "layout/setDrag"; value: ComposerDragState | null }
  | { type: "viewer/setOpen"; value: boolean }
  | { type: "voice/merge"; value: Partial<ComposerVoiceState> };

const initialState: ComposerFormState = {
  privacy: "public",
  projectsOpen: true,
  mobileRailOpen: false,
  previewOpen: true,
  layout: {
    leftWidth: 320,
    rightWidth: 420,
    bottomHeight: 200,
    mainHeight: 0,
    drag: null,
  },
  viewerOpen: false,
  voice: {
    draft: null,
    interim: null,
    lastResult: null,
    error: null,
  },
};

function reducer(state: ComposerFormState, action: ComposerFormAction): ComposerFormState {
  switch (action.type) {
    case "setPrivacy":
      return { ...state, privacy: action.value };
    case "setProjectsOpen":
      return { ...state, projectsOpen: action.value };
    case "toggleProjects":
      return { ...state, projectsOpen: !state.projectsOpen };
    case "setMobileRailOpen":
      return { ...state, mobileRailOpen: action.value };
    case "setPreviewOpen":
      return { ...state, previewOpen: action.value };
    case "layout/setLeftWidth":
      return { ...state, layout: { ...state.layout, leftWidth: action.value } };
    case "layout/setRightWidth":
      return { ...state, layout: { ...state.layout, rightWidth: action.value } };
    case "layout/setBottomHeight":
      return { ...state, layout: { ...state.layout, bottomHeight: action.value } };
    case "layout/setMainHeight":
      return { ...state, layout: { ...state.layout, mainHeight: action.value } };
    case "layout/setDrag":
      return { ...state, layout: { ...state.layout, drag: action.value } };
    case "viewer/setOpen":
      return { ...state, viewerOpen: action.value };
    case "voice/merge":
      return { ...state, voice: { ...state.voice, ...action.value } };
    default:
      return state;
  }
}

export type ComposerFormActions = {
  setPrivacy: (value: ComposerPrivacy) => void;
  setProjectsOpen: (value: boolean) => void;
  toggleProjects: () => void;
  setMobileRailOpen: (value: boolean) => void;
  setPreviewOpen: (value: boolean) => void;
  layout: {
    setLeftWidth: (value: number) => void;
    setRightWidth: (value: number) => void;
    setBottomHeight: (value: number) => void;
    setMainHeight: (value: number) => void;
    setDrag: (value: ComposerDragState | null) => void;
  };
  viewer: {
    open: () => void;
    close: () => void;
  };
  voice: {
    merge: (value: Partial<ComposerVoiceState>) => void;
    setDraft: (draft: ComposerVoiceState["draft"]) => void;
    setInterim: (interim: ComposerVoiceState["interim"]) => void;
    setLastResult: (lastResult: ComposerVoiceState["lastResult"]) => void;
    setError: (error: ComposerVoiceState["error"]) => void;
    reset: () => void;
  };
};

export function useComposerFormReducer(
  overrides?: Partial<ComposerFormState>,
): { state: ComposerFormState; actions: ComposerFormActions } {
  const [state, dispatch] = React.useReducer(reducer, { ...initialState, ...overrides });

  const actions = React.useMemo<ComposerFormActions>(() => {
    const mergeVoice = (value: Partial<ComposerVoiceState>) =>
      dispatch({ type: "voice/merge", value });

    return {
      setPrivacy: (value) => dispatch({ type: "setPrivacy", value }),
      setProjectsOpen: (value) => dispatch({ type: "setProjectsOpen", value }),
      toggleProjects: () => dispatch({ type: "toggleProjects" }),
      setMobileRailOpen: (value) => dispatch({ type: "setMobileRailOpen", value }),
      setPreviewOpen: (value) => dispatch({ type: "setPreviewOpen", value }),
      layout: {
        setLeftWidth: (value) => dispatch({ type: "layout/setLeftWidth", value }),
        setRightWidth: (value) => dispatch({ type: "layout/setRightWidth", value }),
        setBottomHeight: (value) => dispatch({ type: "layout/setBottomHeight", value }),
        setMainHeight: (value) => dispatch({ type: "layout/setMainHeight", value }),
        setDrag: (value) => dispatch({ type: "layout/setDrag", value }),
      },
      viewer: {
        open: () => dispatch({ type: "viewer/setOpen", value: true }),
        close: () => dispatch({ type: "viewer/setOpen", value: false }),
      },
      voice: {
        merge: mergeVoice,
        setDraft: (draft) => mergeVoice({ draft }),
        setInterim: (interim) => mergeVoice({ interim }),
        setLastResult: (lastResult) => mergeVoice({ lastResult }),
        setError: (error) => mergeVoice({ error }),
        reset: () => mergeVoice(initialState.voice),
      },
    };
  }, []);

  return { state, actions };
}

export { initialState as composerFormInitialState };
