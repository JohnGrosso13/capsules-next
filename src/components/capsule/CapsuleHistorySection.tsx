"use client";

import * as React from "react";

import { FeedSurface } from "@/components/feed-surface";
import { Button } from "@/components/ui/button";
import { useCapsuleHistory } from "@/hooks/useCapsuleHistory";
import capTheme from "@/app/(authenticated)/capsule/capsule.module.css";
import CapsuleHistoryCuration from "./CapsuleHistoryCuration";
import CapsuleWikiView from "./CapsuleWikiView";
import { CapsuleLibraryState } from "./CapsuleLibrarySections";

type CapsuleHistorySectionProps = {
  capsuleId: string | null;
  capsuleName: string | null;
  viewerIsOwner: boolean;
};

export function CapsuleHistorySection({
  capsuleId,
  capsuleName: _capsuleName,
  viewerIsOwner,
}: CapsuleHistorySectionProps) {
  const { snapshot, loading, error, refresh } = useCapsuleHistory(capsuleId);
  const [editing, setEditing] = React.useState(false);

  const handleRefresh = React.useCallback(() => {
    void refresh(true);
  }, [refresh]);

  React.useEffect(() => {
    if (!viewerIsOwner) {
      setEditing(false);
    }
  }, [viewerIsOwner]);

  if (!capsuleId) {
    return <CapsuleLibraryState message="Select a capsule to see its history." />;
  }

  if (loading && !snapshot) {
    return <CapsuleLibraryState message="Building capsule history..." />;
  }

  if (error) {
    return <CapsuleLibraryState message={error} onRetry={handleRefresh} />;
  }

  if (!snapshot) {
    return (
      <CapsuleLibraryState message="No activity yet. Post updates to start your capsule wiki." />
    );
  }

  const sections = snapshot.sections ?? [];
  if (!sections.length) {
    return (
      <CapsuleLibraryState message="No activity yet. Post updates to start your capsule wiki." />
    );
  }

  return (
    <FeedSurface variant="capsule">
      <div className={capTheme.wikiWrap}>
        <CapsuleWikiView
          snapshot={snapshot}
          canEdit={viewerIsOwner}
          loading={loading}
          {...(viewerIsOwner ? { onEdit: () => setEditing(true) } : {})}
        />
      </div>
      {viewerIsOwner ? (
        <div className={capTheme.wikiEditor} data-open={editing ? "true" : undefined}>
          {editing ? (
            <>
              <div className={capTheme.wikiEditorHeader}>
                <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
                  Done editing
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={handleRefresh} disabled={loading}>
                  Refresh AI Draft
                </Button>
              </div>
              <CapsuleHistoryCuration
                capsuleId={capsuleId}
                snapshot={snapshot}
                loading={loading}
                error={error}
                onRefresh={refresh}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </FeedSurface>
  );
}
