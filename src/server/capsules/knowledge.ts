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
