import * as React from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import styles from "../LadderBuilder.module.css";

type AiPlanSuggestion = {
  id: string;
  title: string;
  summary: string;
  section?: string | null;
};

export type AiPlanLike = {
  reasoning?: string | null;
  prompt?: string | null;
  suggestions?: AiPlanSuggestion[];
} | null;

export type AiPlanCardProps = {
  plan: AiPlanLike;
};

export const AiPlanCard = React.memo(function AiPlanCard({ plan }: AiPlanCardProps) {
  if (!plan) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>AI notes</CardTitle>
        <CardDescription>Save for internal planning or next iteration prompts.</CardDescription>
      </CardHeader>
      <CardContent className={styles.cardContent}>
        {plan.reasoning ? (
          <div className={styles.aiReasoning}>
            <strong>Why this plan works</strong>
            <p>{plan.reasoning}</p>
          </div>
        ) : null}
        {plan.suggestions && plan.suggestions.length ? (
          <div className={styles.aiSuggestions}>
            <strong>Suggested improvements</strong>
            <ul>
              {plan.suggestions.map((suggestion) => (
                <li key={suggestion.id}>
                  <span>{suggestion.title} - </span>
                  <span>{suggestion.summary}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
});
