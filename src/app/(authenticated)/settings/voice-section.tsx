"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import cards from "@/components/home.module.css";

import layout from "./settings.module.css";
import styles from "./voice-section.module.css";

type MediaDeviceOption = {
  deviceId: string;
  label: string;
};

const INPUT_DEVICE_STORAGE_KEY = "capsules:voice:input-device";
const OUTPUT_DEVICE_STORAGE_KEY = "capsules:voice:output-device";
const INPUT_VOLUME_STORAGE_KEY = "capsules:voice:input-volume";
const OUTPUT_VOLUME_STORAGE_KEY = "capsules:voice:output-volume";

function supportsOutputSelection(): boolean {
  if (typeof document === "undefined") return false;
  const element = document.createElement("audio") as HTMLAudioElement & {
    setSinkId?: (id: string) => Promise<void>;
  };
  return typeof element.setSinkId === "function";
}

function buildFallbackLabel(kind: MediaDeviceInfo["kind"], index: number): string {
  if (kind === "audioinput") {
    return `Microphone ${index + 1}`;
  }
  if (kind === "audiooutput") {
    return `Speakers ${index + 1}`;
  }
  return `Device ${index + 1}`;
}

export function VoiceSettingsSection(): React.JSX.Element {
  const [inputDevices, setInputDevices] = React.useState<MediaDeviceOption[]>([]);
  const [outputDevices, setOutputDevices] = React.useState<MediaDeviceOption[]>([]);
  const [inputDeviceId, setInputDeviceId] = React.useState<string>("");
  const [outputDeviceId, setOutputDeviceId] = React.useState<string>("");
  const [inputVolume, setInputVolume] = React.useState<number>(80);
  const [outputVolume, setOutputVolume] = React.useState<number>(80);
  const [loadingDevices, setLoadingDevices] = React.useState(false);
  const [deviceError, setDeviceError] = React.useState<string | null>(null);
  const [outputSelectionSupported, setOutputSelectionSupported] = React.useState(false);
  const mountedRef = React.useRef(false);

  const readStoredValue = React.useCallback((key: string) => {
    if (typeof window === "undefined") return "";
    const stored = window.localStorage.getItem(key);
    if (!stored) return "";
    return stored;
  }, []);

  const readStoredNumber = React.useCallback((key: string, fallback: number) => {
    if (typeof window === "undefined") return fallback;
    const stored = window.localStorage.getItem(key);
    if (!stored) return fallback;
    const parsed = Number.parseInt(stored, 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(Math.max(parsed, 0), 100);
  }, []);

  const persistValue = React.useCallback((key: string, value: string) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      console.warn("voice settings storage error", error);
    }
  }, []);

  const persistNumber = React.useCallback((key: string, value: number) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, String(Math.round(value)));
    } catch (error) {
      console.warn("voice settings storage error", error);
    }
  }, []);

  const enumerateDevices = React.useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      setDeviceError("Audio device enumeration is not supported in this browser.");
      setInputDevices([]);
      setOutputDevices([]);
      return;
    }
    setDeviceError(null);
    setLoadingDevices(true);
    try {
      // Attempt to prompt for permission so labels populate when possible.
      if (navigator.mediaDevices.getUserMedia) {
        await navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) => {
            stream.getTracks().forEach((track) => track.stop());
          })
          .catch(() => {
            // Ignore permission errors – enumeration still works but without labels.
          });
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const nextInputDevices: MediaDeviceOption[] = [];
      const nextOutputDevices: MediaDeviceOption[] = [];
      let audioInputIndex = 0;
      let audioOutputIndex = 0;
      devices.forEach((device) => {
        if (device.kind === "audioinput") {
          const label = device.label?.trim()
            ? device.label.trim()
            : buildFallbackLabel(device.kind, audioInputIndex);
          nextInputDevices.push({ deviceId: device.deviceId, label });
          audioInputIndex += 1;
        }
        if (device.kind === "audiooutput") {
          const label = device.label?.trim()
            ? device.label.trim()
            : buildFallbackLabel(device.kind, audioOutputIndex);
          nextOutputDevices.push({ deviceId: device.deviceId, label });
          audioOutputIndex += 1;
        }
      });
      setInputDevices(nextInputDevices);
      setOutputDevices(nextOutputDevices);
    } catch (error) {
      console.error("voice settings device enumeration error", error);
      setDeviceError(
        error instanceof Error
          ? error.message
          : "We couldn't access your audio devices. Check browser permissions and try again.",
      );
      setInputDevices([]);
      setOutputDevices([]);
    } finally {
      setLoadingDevices(false);
    }
  }, []);

  React.useEffect(() => {
    mountedRef.current = true;
    setOutputSelectionSupported(supportsOutputSelection());
    setInputDeviceId(readStoredValue(INPUT_DEVICE_STORAGE_KEY));
    setOutputDeviceId(readStoredValue(OUTPUT_DEVICE_STORAGE_KEY));
    setInputVolume(readStoredNumber(INPUT_VOLUME_STORAGE_KEY, 80));
    setOutputVolume(readStoredNumber(OUTPUT_VOLUME_STORAGE_KEY, 80));
    void enumerateDevices();
    return () => {
      mountedRef.current = false;
    };
  }, [enumerateDevices, readStoredNumber, readStoredValue]);

  React.useEffect(() => {
    if (!mountedRef.current) return;
    persistValue(INPUT_DEVICE_STORAGE_KEY, inputDeviceId);
  }, [inputDeviceId, persistValue]);

  React.useEffect(() => {
    if (!mountedRef.current) return;
    persistValue(OUTPUT_DEVICE_STORAGE_KEY, outputDeviceId);
  }, [outputDeviceId, persistValue]);

  React.useEffect(() => {
    if (!mountedRef.current) return;
    persistNumber(INPUT_VOLUME_STORAGE_KEY, inputVolume);
  }, [inputVolume, persistNumber]);

  React.useEffect(() => {
    if (!mountedRef.current) return;
    persistNumber(OUTPUT_VOLUME_STORAGE_KEY, outputVolume);
  }, [outputVolume, persistNumber]);

  const inputVolumePercent = `${inputVolume}%`;
  const outputVolumePercent = `${outputVolume}%`;
  const inputDeviceAvailable = inputDevices.length > 0;
  const outputDeviceAvailable = outputDevices.length > 0;

  return (
    <article className={`${cards.card} ${layout.card}`}>
      <header className={cards.cardHead}>
        <h3 className={layout.sectionTitle}>Voice</h3>
      </header>
      <div className={`${cards.cardBody} ${styles.sectionBody}`}>
        <p className={styles.intro}>
          Configure how Capsules uses your microphone and speakers. These selections will be used
          for parties and any upcoming voice-enabled experiences.
        </p>

        <div className={styles.fieldGroup}>
          <div className={styles.fieldHeader}>
            <label htmlFor="voice-input-device">Input device</label>
            <span className={styles.fieldHint}>
              Choose which microphone Capsules should use by default.
            </span>
          </div>
          <select
            id="voice-input-device"
            className={styles.select}
            value={inputDeviceId}
            onChange={(event) => setInputDeviceId(event.target.value)}
            disabled={!inputDeviceAvailable || loadingDevices}
          >
            <option value="">System default</option>
            {inputDevices.map((device) => (
              <option key={device.deviceId || "default-input"} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
          {!inputDeviceAvailable ? (
            <p className={styles.status}>
              No microphones were detected. Connect a microphone and refresh devices.
            </p>
          ) : null}
        </div>

        <div className={styles.fieldGroup}>
          <div className={styles.fieldHeader}>
            <label htmlFor="voice-output-device">Output device</label>
            <span className={styles.fieldHint}>
              Choose where Capsules should play party audio.
            </span>
          </div>
          <select
            id="voice-output-device"
            className={styles.select}
            value={outputDeviceId}
            onChange={(event) => setOutputDeviceId(event.target.value)}
            disabled={!outputSelectionSupported || !outputDeviceAvailable || loadingDevices}
          >
            <option value="">System default</option>
            {outputDevices.map((device) => (
              <option key={device.deviceId || "default-output"} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
          {!outputSelectionSupported ? (
            <p className={styles.status}>
              Selecting a playback device isn&apos;t supported by this browser. Capsules will use
              the system default output.
            </p>
          ) : null}
          {outputSelectionSupported && !outputDeviceAvailable ? (
            <p className={styles.status}>
              No speaker or headset outputs were detected. Connect audio playback hardware and
              refresh devices.
            </p>
          ) : null}
        </div>

        <div className={styles.sliderGroup}>
          <div className={styles.sliderHeader}>
            <span>Input volume</span>
            <span>{inputVolumePercent}</span>
          </div>
          <input
            type="range"
            className={styles.slider}
            min={0}
            max={100}
            step={1}
            value={inputVolume}
            onChange={(event) => setInputVolume(Number.parseInt(event.target.value, 10))}
            aria-label="Microphone level"
          />
          <p className={styles.status}>
            Adjust the level Capsules applies when capturing your microphone.
          </p>
        </div>

        <div className={styles.sliderGroup}>
          <div className={styles.sliderHeader}>
            <span>Output volume</span>
            <span>{outputVolumePercent}</span>
          </div>
          <input
            type="range"
            className={styles.slider}
            min={0}
            max={100}
            step={1}
            value={outputVolume}
            onChange={(event) => setOutputVolume(Number.parseInt(event.target.value, 10))}
            aria-label="Speaker level"
          />
          <p className={styles.status}>
            Tune the baseline speaker volume Capsules uses for parties and voice playback.
          </p>
        </div>

        {deviceError ? <p className={styles.error}>{deviceError}</p> : null}

        <div className={styles.actions}>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void enumerateDevices();
            }}
            loading={loadingDevices}
          >
            Refresh devices
          </Button>
        </div>
      </div>
    </article>
  );
}
