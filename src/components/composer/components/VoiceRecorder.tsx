"use client";

import * as React from "react";
import { Microphone, MicrophoneSlash } from "@phosphor-icons/react/dist/ssr";

import styles from "../../ai-composer.module.css";
import prompterStyles from "@/components/prompter/prompter.module.css";

type VoiceRecorderProps = {
  isActive: boolean;
  status: string;
  buttonLabel: string;
  buttonDisabled: boolean;
  onToggle: () => void;
  errorMessage: string | null;
};

export function VoiceRecorder({
  isActive,
  status,
  buttonLabel,
  buttonDisabled,
  onToggle,
  errorMessage,
}: VoiceRecorderProps) {
  const dataStatus = errorMessage ? "error" : status;

  return (
    <button
      type="button"
      className={`${styles.promptIconBtn} ${prompterStyles.voiceBtn}`}
      aria-label={buttonLabel}
      title={buttonLabel}
      aria-pressed={isActive}
      data-active={isActive ? "true" : undefined}
      data-status={dataStatus}
      onClick={onToggle}
      disabled={buttonDisabled}
    >
      <span className={prompterStyles.voicePulse} aria-hidden />
      {isActive ? (
        <MicrophoneSlash size={18} weight="fill" />
      ) : (
        <Microphone size={18} weight="duotone" />
      )}
    </button>
  );
}



