"use client";

import * as React from "react";
import type { ComposerSidebarData, SidebarDraftListItem } from "@/lib/composer/sidebar-types";
import type { SidebarListItem, SidebarSectionProps, SidebarTabKey } from "../panes/SidebarPane";

type UseComposerSidebarParams = {
  activeSidebarTab: SidebarTabKey;
  sidebar: ComposerSidebarData;
  onSelectRecentChat: (id: string) => void;
  onSelectDraft: (id: string) => void;
  onSelectProject: (id: string | null) => void;
  onCreateProject: (name: string) => void;
  onForceChoice?: ((key: string) => void) | undefined;
  onMemoryPickerOpen?: (() => void) | undefined;
  SidebarSectionComponent: React.ComponentType<SidebarSectionProps>;
};

type MobileMenuSection = {
  title: string;
  items: SidebarListItem[];
  emptyMessage: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function useComposerSidebar({
  activeSidebarTab,
  sidebar,
  onSelectRecentChat,
  onSelectDraft,
  onSelectProject,
  onCreateProject,
  onForceChoice,
  onMemoryPickerOpen,
  SidebarSectionComponent,
}: UseComposerSidebarParams) {
  const recentSidebarItems = React.useMemo<SidebarListItem[]>(
    () =>
      sidebar.recentChats.map((item) => ({
        id: item.id,
        title: item.title,
        subtitle: item.caption,
        onClick: () => onSelectRecentChat(item.id),
      })),
    [onSelectRecentChat, sidebar.recentChats],
  );

  const resolveDraftClick = React.useCallback(
    (draft: SidebarDraftListItem) => {
      if (draft.kind === "choice") {
        return () => onForceChoice?.(draft.key);
      }
      return () => onSelectDraft(draft.id);
    },
    [onForceChoice, onSelectDraft],
  );

  const draftSidebarItems = React.useMemo<SidebarListItem[]>(
    () =>
      sidebar.drafts.map((draft) => ({
        id: draft.kind === "choice" ? draft.key : draft.id,
        title: draft.title,
        subtitle: draft.caption,
        onClick: resolveDraftClick(draft),
      })),
    [resolveDraftClick, sidebar.drafts],
  );

  const projectSidebarItems = React.useMemo<SidebarListItem[]>(
    () =>
      sidebar.projects.map((project) => ({
        id: project.id,
        title: project.name,
        subtitle: `${project.draftCount} drafts`,
        active: project.id === sidebar.selectedProjectId,
        onClick: () => onSelectProject(project.id),
      })),
    [onSelectProject, sidebar.projects, sidebar.selectedProjectId],
  );

  const sidebarContent = React.useMemo(() => {
    if (activeSidebarTab === "recent") {
      return (
        <SidebarSectionComponent
          title="Recent chats"
          description="Jump back into a conversation."
          items={recentSidebarItems}
          emptyMessage="No recent chats yet."
          thumbClassName=""
        />
      );
    }
    if (activeSidebarTab === "drafts") {
      return (
        <SidebarSectionComponent
          title="Drafts"
          description="Keep iterating on saved work."
          items={draftSidebarItems}
          emptyMessage="No drafts yet."
        />
      );
    }
    if (activeSidebarTab === "projects") {
      return (
        <SidebarSectionComponent
          title="Projects"
          description="Organize drafts by project."
          items={projectSidebarItems}
          emptyMessage="No projects yet."
          actionLabel="New project"
          onAction={() => onCreateProject("New project")}
        />
      );
    }
    const memoryActions =
      typeof onMemoryPickerOpen === "function"
        ? { actionLabel: "Open memories", onAction: onMemoryPickerOpen }
        : {};
    return (
      <SidebarSectionComponent
        title="Memories"
        description="Attach memories to your draft."
        items={[]}
        emptyMessage="Browse your memories."
        {...memoryActions}
      />
    );
  }, [
    SidebarSectionComponent,
    activeSidebarTab,
    draftSidebarItems,
    onCreateProject,
    onMemoryPickerOpen,
    projectSidebarItems,
    recentSidebarItems,
  ]);

  const mobileSections = React.useMemo<MobileMenuSection[]>(
    () => [
      { title: "Recent chats", items: recentSidebarItems, emptyMessage: "No recent chats yet." },
      { title: "Drafts", items: draftSidebarItems, emptyMessage: "No drafts yet." },
      {
        title: "Projects",
        items: projectSidebarItems,
        emptyMessage: "No projects yet.",
        actionLabel: "New project",
        onAction: () => onCreateProject("New project"),
      },
    ],
    [draftSidebarItems, onCreateProject, projectSidebarItems, recentSidebarItems],
  );

  const mobileMemoriesSection = onMemoryPickerOpen
    ? {
        title: "Memories",
        buttonLabel: "Browse memories",
        description: "Open your memory library.",
        onBrowse: onMemoryPickerOpen,
      }
    : undefined;

  const recentModalOpen = false;
  const closeRecentModal = React.useCallback(() => {}, []);

  return {
    recentSidebarItems,
    sidebarContent,
    mobileSections,
    mobileMemoriesSection,
    recentModalOpen,
    closeRecentModal,
  };
}
