"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AiStreamCapsuleGate } from "@/components/create/ai-stream/AiStreamCapsuleGate";
import type { CapsuleSummary } from "@/server/capsules/service";

import styles from "./mystore.page.module.css";

type StoreCapsuleGateProps = {
  capsules: CapsuleSummary[];
  selectedCapsuleId: string | null;
  show?: boolean;
};

export function StoreCapsuleGate({ capsules, selectedCapsuleId, show = true }: StoreCapsuleGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedCapsule = React.useMemo(
    () => capsules.find((capsule) => capsule.id === selectedCapsuleId) ?? null,
    [capsules, selectedCapsuleId],
  );

  const handleSelectionChange = React.useCallback(
    (capsule: CapsuleSummary | null) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (capsule?.id) {
        params.set("capsuleId", capsule.id);
        params.delete("switch");
      } else {
        params.delete("capsuleId");
      }
      const query = params.toString();
      const href = query ? `${pathname}?${query}` : pathname;
      router.replace(href);
    },
    [pathname, router, searchParams],
  );

  if (!show) return null;

  return (
    <div className={styles.capsuleGatePanel}>
      <AiStreamCapsuleGate
        capsules={capsules}
        selectedCapsule={selectedCapsule}
        onSelectionChange={handleSelectionChange}
        selectorTitle="Pick a store to manage"
        selectorSubtitle={null}
        showMemberships={false}
        showFollowers={false}
      />
    </div>
  );
}
