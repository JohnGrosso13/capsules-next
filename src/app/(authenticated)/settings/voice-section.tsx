"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import cards from "@/components/home-feed.module.css";

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
  const micTestStreamRef = React.useRef<MediaStream | null>(null);
  const micTestContextRef = React.useRef<AudioContext | null>(null);
  const micTestSourceRef = React.useRef<MediaStreamAudioSourceNode | null>(null);
  const micTestAnalyserRef = React.useRef<AnalyserNode | null>(null);
  const micTestGainRef = React.useRef<GainNode | null>(null);
  const micTestAnimationRef = React.useRef<number | null>(null);
  const micTestDataRef = React.useRef<Uint8Array | null>(null);
  const previousInputDeviceIdRef = React.useRef<string | null>(null);
  const [micTestActive, setMicTestActive] = React.useState(false);
  const [micTestPending, setMicTestPending] = React.useState(false);
  const [micTestLevel, setMicTestLevel] = React.useState(0);
  const [micTestError, setMicTestError] = React.useState<string | null>(null);
  const [micTestPlaybackEnabled, setMicTestPlaybackEnabled] = React.useState(false);

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
      // Ensure mic test resources are released on unmount.
      if (micTestAnimationRef.current !== null) {
        cancelAnimationFrame(micTestAnimationRef.current);
      }
      micTestAnimationRef.current = null;
      micTestAnalyserRef.current = null;
      micTestDataRef.current = null;
      micTestGainRef.current = null;
      micTestSourceRef.current = null;
      micTestContextRef.current
        ?.close()
        .catch(() => {
          // ignore
        })
        .finally(() => {
          micTestContextRef.current = null;
        });
      micTestStreamRef.current?.getTracks().forEach((track) => track.stop());
      micTestStreamRef.current = null;
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

  const stopMicTest = React.useCallback(() => {
    if (micTestAnimationRef.current !== null) {
      cancelAnimationFrame(micTestAnimationRef.current);
      micTestAnimationRef.current = null;
    }
    micTestAnalyserRef.current = null;
    micTestGainRef.current?.disconnect();
    micTestGainRef.current = null;
    micTestSourceRef.current?.disconnect();
    micTestSourceRef.current = null;
    micTestDataRef.current = null;
    micTestContextRef.current
      ?.close()
      .catch(() => {
        // ignore
      })
      .finally(() => {
        micTestContextRef.current = null;
      });
    if (micTestStreamRef.current) {
      micTestStreamRef.current.getTracks().forEach((track) => track.stop());
      micTestStreamRef.current = null;
    }
    setMicTestActive(false);
    setMicTestPending(false);
    setMicTestLevel(0);
  }, []);

  const tickMicLevel = React.useCallback(() => {
    const analyser = micTestAnalyserRef.current;
    if (!analyser) return;
    const existing = micTestDataRef.current;
    const dataArray =
      existing && existing.length === analyser.fftSize
        ? existing
        : new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(dataArray as unknown as Uint8Array<ArrayBuffer>);
    micTestDataRef.current = dataArray;
    let sum = 0;
    for (let index = 0; index < dataArray.length; index += 1) {
      const deviation = Math.abs(dataArray[index]! - 128) / 128;
      sum += deviation;
    }
    const avg = sum / dataArray.length;
    setMicTestLevel((prev) => {
      // Smoothing to avoid jitter.
      const smoothing = 0.35;
      return prev * smoothing + avg * (1 - smoothing);
    });
    micTestAnimationRef.current = requestAnimationFrame(tickMicLevel);
  }, []);

  const startMicTest = React.useCallback(async () => {
    if (micTestPending || micTestStreamRef.current) {
      return;
    }
    setMicTestPending(true);
    setMicTestError(null);
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Mic checks are not supported in this browser.");
      }
      const constraints: MediaStreamConstraints = {
        audio: inputDeviceId
          ? {
              deviceId: { exact: inputDeviceId },
            }
          : true,
        video: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      const gain = audioContext.createGain();
      gain.gain.value = micTestPlaybackEnabled ? 0.35 : 0;
      source.connect(analyser);
      source.connect(gain);
      gain.connect(audioContext.destination);

      micTestStreamRef.current = stream;
      micTestContextRef.current = audioContext;
      micTestSourceRef.current = source;
      micTestAnalyserRef.current = analyser;
      micTestGainRef.current = gain;
      setMicTestActive(true);
      setMicTestPending(false);
      setMicTestLevel(0);
      micTestAnimationRef.current = requestAnimationFrame(tickMicLevel);
    } catch (error) {
      console.error("voice settings mic test error", error);
      const message =
        error instanceof DOMException
          ? (() => {
              switch (error.name) {
                case "NotAllowedError":
                case "PermissionDeniedError":
                  return "Microphone permission is required to run a mic check.";
                case "NotFoundError":
                case "DevicesNotFoundError":
                  return "No microphone was found. Connect a mic and try again.";
                case "NotReadableError":
                case "AbortError":
                  return "Your microphone is busy with another app. Close other apps and retry.";
                default:
                  break;
              }
              return error.message;
            })()
          : "We couldn't start the mic test. Check your microphone and try again.";
      setMicTestError(message);
      setMicTestPending(false);
      stopMicTest();
    }
  }, [inputDeviceId, micTestPending, micTestPlaybackEnabled, stopMicTest, tickMicLevel]);

  React.useEffect(() => {
    const previousInputDeviceId = previousInputDeviceIdRef.current;
    if (previousInputDeviceId === inputDeviceId) {
      return;
    }
    previousInputDeviceIdRef.current = inputDeviceId;
    if (!micTestActive) {
      return;
    }
    stopMicTest();
    if (inputDeviceId) {
      void startMicTest();
    }
  }, [inputDeviceId, micTestActive, startMicTest, stopMicTest]);

  React.useEffect(() => {
    const gain = micTestGainRef.current;
    if (!gain) return;
    const audioContext = gain.context;
    const target = micTestPlaybackEnabled ? 0.35 : 0;
    gain.gain.setTargetAtTime(target, audioContext.currentTime, 0.1);
  }, [micTestPlaybackEnabled]);

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

        <div className={styles.micTestGroup}>
          <div className={styles.micTestHeader}>
            <h4>Mic test</h4>
            <p>
              Having mic issues? Start a test and say something fun—we&apos;ll play your voice back
              and show live levels.
            </p>
          </div>
          <div
            className={styles.micTestMeter}
            role="presentation"
            aria-hidden="true"
            data-active={micTestActive ? "true" : "false"}
          >
            {Array.from({ length: 48 }).map((_, index) => {
              const normalized = Math.min(Math.max(micTestLevel, 0), 1);
              const activeBars = Math.round(normalized * 48);
              const isActive = index < activeBars;
              return (
                <span
                  key={index}
                  className={`${styles.micTestMeterBar}${
                    isActive ? ` ${styles.micTestMeterBarActive}` : ""
                  }`}
                />
              );
            })}
          </div>
          <div className={styles.micTestStatusRow}>
            <p className={styles.status}>
              {micTestActive
                ? "Listening… speak into your mic and watch the activity bars react."
                : "Mic test is idle. Start the check to confirm Capsules can hear you."}
            </p>
            <label className={styles.micTestToggle}>
              <input
                type="checkbox"
                checked={micTestPlaybackEnabled}
                onChange={(event) => setMicTestPlaybackEnabled(event.target.checked)}
                disabled={!micTestActive}
              />
              <span>Play back my voice</span>
            </label>
          </div>
          {micTestError ? <p className={styles.error}>{micTestError}</p> : null}
          <div className={styles.micTestActions}>
            <Button
              type="button"
              variant={micTestActive ? "secondary" : "primary"}
              onClick={() => {
                if (micTestActive) {
                  stopMicTest();
                } else {
                  void startMicTest();
                }
              }}
              loading={micTestPending}
            >
              {micTestActive ? "Stop mic check" : "Start mic check"}
            </Button>
          </div>
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

