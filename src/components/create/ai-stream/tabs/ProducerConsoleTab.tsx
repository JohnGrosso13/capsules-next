"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import type { CapsuleSummary } from "@/server/capsules/service";

import styles from "@/app/(authenticated)/create/ai-stream/ai-stream.page.module.css";
import {
  StudioNotificationBanner,
  type StudioNotification,
} from "../StudioNotificationBanner";

type ProducerConsoleTabProps = {
  selectedCapsule: CapsuleSummary | null;
  notification?: StudioNotification | null;
};

export function ProducerConsoleTab({ selectedCapsule, notification }: ProducerConsoleTabProps) {
  if (!selectedCapsule) {
    return (
      <div className={styles.noticeCard}>
        <h3>Pick a Capsule to unlock Producer tools</h3>
        <p>
          Once you choose a destination, we&apos;ll populate AI scene controls, cue playlists, and automation templates
          tailored to that Capsule.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.producerLayout}>
      {notification ? (
        <StudioNotificationBanner
          notification={notification}
          className={styles.encoderBanner}
        />
      ) : null}
      <div className={styles.producerColumn}>
        <div className={styles.shellCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.shellCardTitle}>Scene stack</div>
            <Button variant="outline" size="sm" disabled>
              + New Scene
            </Button>
          </div>
          <ul className={styles.sceneList}>
            <li className={styles.sceneItem}>
              <div className={styles.sceneItemTitle}>Main stage</div>
              <div className={styles.sceneItemMeta}>AI camera framing | host + guest</div>
            </li>
            <li className={styles.sceneItem}>
              <div className={styles.sceneItemTitle}>Clips &amp; react</div>
              <div className={styles.sceneItemMeta}>Picture-in-picture | sponsor lower-third</div>
            </li>
            <li className={styles.sceneItem}>
              <div className={styles.sceneItemTitle}>Q&amp;A wrap</div>
              <div className={styles.sceneItemMeta}>Chat overlay | poll recap</div>
            </li>
          </ul>
        </div>
      </div>
      <div className={styles.timelineCard}>
        <div className={styles.sectionHeader}>
          <div className={styles.shellCardTitle}>Run of show timeline</div>
          <Button variant="outline" size="sm" disabled>
            Add cue
          </Button>
        </div>
        <div className={styles.shellCardSubtitle}>
          Arrange segments, sponsor reads, and automation triggers. AI producer can auto-fire cues.
        </div>
        <div className={styles.timelineRail}>
          <div className={styles.timelineRow} />
          <div className={styles.timelineRow} />
          <div className={styles.timelineRow} />
        </div>
      </div>
      <div className={styles.assistantCard}>
        <div className={styles.sectionHeader}>
          <div className={styles.shellCardTitle}>AI copilot</div>
          <Button variant="outline" size="sm" disabled>
            Open chat
          </Button>
        </div>
        <ul className={styles.assistantList}>
          <li>Summaries live chat into beat-by-beat show notes.</li>
          <li>Suggests follow-up questions and polls in real time.</li>
          <li>Flags moments for instant clips &amp; VOD chapters.</li>
        </ul>
        <div className={styles.assistantPrompt}>
          &quot;Queue the sponsor slate in 2 minutes and remind me to plug the merch drop.&quot;
        </div>
      </div>
    </div>
  );
}




