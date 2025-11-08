import { loadCapsuleKnowledgeDocs } from "./knowledge-docs";
import { indexCapsuleKnowledgeDocs } from "./knowledge-index";

export async function refreshCapsuleKnowledge(
  capsuleId: string,
  capsuleName?: string | null,
): Promise<void> {
  const docs = await loadCapsuleKnowledgeDocs(capsuleId, capsuleName ?? null);
  if (!docs.length) return;
  await indexCapsuleKnowledgeDocs(capsuleId, docs);
}

export function enqueueCapsuleKnowledgeRefresh(
  capsuleId: string | null | undefined,
  capsuleName?: string | null,
): void {
  if (!capsuleId) return;
  void refreshCapsuleKnowledge(capsuleId, capsuleName ?? null).catch((error) => {
    console.warn("capsule knowledge refresh enqueue failed", { capsuleId, error });
  });
}
