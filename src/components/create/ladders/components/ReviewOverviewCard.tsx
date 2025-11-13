import * as React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LadderVisibility } from "@/types/ladders";
import { ladderVisibilityOptions } from "../ladderFormState";
import styles from "../LadderBuilder.module.css";

export type ReviewOverviewCardProps = {
  capsuleName: string | null;
  visibility: LadderVisibility;
  publish: boolean;
  membersCount: number;
  sectionsReady: number;
};

export const ReviewOverviewCard = React.memo(function ReviewOverviewCard({
  capsuleName,
  visibility,
  publish,
  membersCount,
  sectionsReady,
}: ReviewOverviewCardProps) {
  const visibilityOption = ladderVisibilityOptions.find((option) => option.value === visibility);
  const stats = [
    { label: "Capsule", value: capsuleName ?? "Select a capsule" },
    { label: "Visibility", value: visibilityOption?.label ?? visibility },
    { label: "Status on save", value: publish ? "Publish immediately" : "Save as draft" },
    { label: "Participants", value: membersCount ? `${membersCount} seeded` : "Add at least one team or player" },
    { label: "Sections ready", value: sectionsReady },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Review launch settings</CardTitle>
      </CardHeader>
      <CardContent className={styles.cardContent}>
        <dl className={styles.reviewList}>
          {stats.map((stat) => (
            <div key={stat.label} className={styles.reviewRow}>
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
});
